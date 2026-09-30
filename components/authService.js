// authService.js — Firebase Auth wrapper (email/password + Google + optional anonymous guest).
//
// Primary path for live users is a real signed-in account. Anonymous auth remains
// available as a try-before-signin guest so foursome sync still works offline /
// without forcing a wall before the first round.

const AuthService = (function () {
  const CACHE_KEY = 'pp_auth_user';
  let _user = null;
  let _listeners = [];
  let _started = false;
  let _googleProvider = null;

  function _auth() {
    if (!window.firebase || !window.firebase.auth) return null;
    return window.firebase.auth();
  }

  function _fs() {
    if (!window.firebase || !window.firebase.firestore) return null;
    return window.firebase.firestore();
  }

  function _cache(user) {
    _user = user;
    try {
      if (user) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          isAnonymous: !!user.isAnonymous,
          providerId: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || (user.isAnonymous ? 'anonymous' : 'password'),
        }));
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (e) {}
    _listeners.forEach(fn => { try { fn(user); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('pp:auth', { detail: { user: snapshot() } })); } catch (e) {}
  }

  function snapshot() {
    if (!_user) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    return {
      uid: _user.uid,
      email: _user.email || null,
      displayName: _user.displayName || null,
      isAnonymous: !!_user.isAnonymous,
      providerId: (_user.providerData && _user.providerData[0] && _user.providerData[0].providerId) || (_user.isAnonymous ? 'anonymous' : 'password'),
    };
  }

  function currentUser() { return _user; }
  function isSignedIn() { return !!( _user && !_user.isAnonymous); }
  function isGuest() { return !!( _user && _user.isAnonymous); }
  function uid() { return _user ? _user.uid : (snapshot() && snapshot().uid) || null; }

  function onAuth(fn) {
    _listeners.push(fn);
    if (_user !== undefined) { try { fn(_user); } catch (e) {} }
    return () => { _listeners = _listeners.filter(f => f !== fn); };
  }

  // Firebase-backed io for GroupService.switchToAccountGroup.
  function _groupIo() {
    const fb = window.firebase;
    if (!fb || !fb.database || !fb.firestore) return null;
    const db = fb.database(), fs = fb.firestore();
    return {
      readRt: (path) => db.ref(path).once('value').then(s => s.val()).catch(() => null),
      updateRt: (patch) => db.ref().update(patch),
      readDoc: (col, id) => fs.collection(col).doc(id).get().then(s => (s.exists ? s.data() : null)),
      createDoc: (col, id, data) => fs.collection(col).doc(id).set(data),
    };
  }

  let _switching = null;

  // The signed-in account's group is the device's default group. Returns true
  // when the device switched (the caller reloads). A failed merge leaves the
  // device where it was and retries on the next launch — nothing is dropped.
  async function useAccountGroup(acctGroup, opts) {
    const GS = window.GroupService;
    if (!acctGroup || !GS || !GS.switchToAccountGroup) return false;
    GS.setAccountGroup(acctGroup);
    if (GS.current() === acctGroup) return false;
    // A round-invite deep link is mid-join on this page; switch on next launch.
    if (window.__pp_pending_join_code) return false;
    if (_switching) return _switching;
    _switching = (async () => {
      window.__pp_group_switching = true;
      try {
        const io = (opts && opts.io) || _groupIo();
        const res = await GS.switchToAccountGroup(acctGroup, io, opts);
        if (!res || !res.switched) { window.__pp_group_switching = false; return false; }
        const reload = (opts && opts.reload) || (() => { try { window.location.reload(); } catch (e) {} });
        reload();
        return true;
      } catch (e) {
        console.warn('[AuthService] account group switch deferred:', e && e.message);
        window.__pp_group_switching = false;
        return false;
      } finally { _switching = null; }
    })();
    return _switching;
  }

  async function ensureUserDoc(user, opts) {
    if (!user || user.isAnonymous) return;
    const fs = (opts && opts.fs) || _fs();
    if (!fs) return;
    const ref = fs.collection('users').doc(user.uid);
    const GS = window.GroupService;
    const groupId = (GS && GS.current) ? GS.current() : null;
    try {
      const snap = await ref.get();
      const now = new Date().toISOString();
      let acctGroup = snap.exists ? (snap.data() || {}).groupId : null;
      if (!snap.exists) {
        await ref.set({
          email: user.email || null,
          displayName: user.displayName || null,
          pro: false,
          groupId: groupId || null,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        acctGroup = groupId || null;
      } else {
        const patch = { updatedAt: now };
        if (user.email) patch.email = user.email;
        if (user.displayName) patch.displayName = user.displayName;
        if (groupId && !acctGroup) { patch.groupId = groupId; acctGroup = groupId; }
        await ref.set(patch, { merge: true });
      }
      if (GS && GS.setOwnerUid && acctGroup) GS.setOwnerUid(user.uid);
      // Always land on the account's group — roster, round in progress and
      // LEGACY devices included; local-only data is merged over first.
      if (acctGroup) await useAccountGroup(acctGroup, opts);
    } catch (e) {
      console.warn('[AuthService] ensureUserDoc failed:', e && e.message);
    }
  }

  function start() {
    if (_started) return;
    const auth = _auth();
    if (!auth) {
      console.warn('[AuthService] Firebase Auth unavailable');
      return;
    }
    _started = true;
    auth.onAuthStateChanged(async (user) => {
      _cache(user);
      if (user && !user.isAnonymous) {
        await ensureUserDoc(user);
        if (window.ProService && window.ProService.refresh) {
          try { window.ProService.refresh(); } catch (e) {}
        }
      }
    });
  }

  /** Guest path — anonymous Firebase user for try-before-signin. */
  function continueAsGuest() {
    const auth = _auth();
    if (!auth) return Promise.reject(new Error('Auth unavailable'));
    return auth.signInAnonymously().then(cred => {
      _cache(cred.user);
      return cred.user;
    });
  }

  function signUpEmail(email, password) {
    const auth = _auth();
    if (!auth) return Promise.reject(new Error('Auth unavailable'));
    return auth.createUserWithEmailAndPassword(String(email).trim(), password)
      .then(async (cred) => {
        await ensureUserDoc(cred.user);
        _cache(cred.user);
        return cred.user;
      });
  }

  function signInEmail(email, password) {
    const auth = _auth();
    if (!auth) return Promise.reject(new Error('Auth unavailable'));
    return auth.signInWithEmailAndPassword(String(email).trim(), password)
      .then(async (cred) => {
        await ensureUserDoc(cred.user);
        _cache(cred.user);
        return cred.user;
      });
  }

  function signInGoogle() {
    const auth = _auth();
    if (!auth) return Promise.reject(new Error('Auth unavailable'));
    if (!_googleProvider) {
      _googleProvider = new window.firebase.auth.GoogleAuthProvider();
      _googleProvider.setCustomParameters({ prompt: 'select_account' });
    }
    // Prefer popup; fall back to redirect on browsers that block it.
    return auth.signInWithPopup(_googleProvider)
      .then(async (cred) => {
        await ensureUserDoc(cred.user);
        _cache(cred.user);
        return cred.user;
      })
      .catch((err) => {
        if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
          return auth.signInWithRedirect(_googleProvider);
        }
        throw err;
      });
  }

  function signOut() {
    const auth = _auth();
    if (!auth) return Promise.resolve();
    return auth.signOut().then(() => {
      try { window.GroupService && window.GroupService.setAccountGroup && window.GroupService.setAccountGroup(null); } catch (e) {}
      _cache(null);
    });
  }

  async function getIdToken(forceRefresh) {
    if (!_user) return null;
    try { return await _user.getIdToken(!!forceRefresh); }
    catch (e) { return null; }
  }

  /** Force-refresh ID token and return claims (includes custom claims like pro). */
  async function getIdTokenResult(forceRefresh) {
    if (!_user) return null;
    try { return await _user.getIdTokenResult(forceRefresh !== false); }
    catch (e) { return null; }
  }

  function friendlyError(err) {
    const code = (err && err.code) || '';
    const map = {
      'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
      'auth/invalid-email': 'That does not look like a valid email.',
      'auth/weak-password': 'Use a password with at least 6 characters.',
      'auth/user-not-found': 'No account with that email.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/popup-closed-by-user': 'Sign-in cancelled.',
      'auth/network-request-failed': 'Network error — check your connection.',
      'auth/too-many-requests': 'Too many attempts. Try again in a minute.',
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
  }

  return {
    start,
    onAuth,
    snapshot,
    currentUser,
    isSignedIn,
    isGuest,
    uid,
    continueAsGuest,
    signUpEmail,
    signInEmail,
    signInGoogle,
    signOut,
    getIdToken,
    getIdTokenResult,
    ensureUserDoc,
    useAccountGroup,
    friendlyError,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { AuthService });
}
