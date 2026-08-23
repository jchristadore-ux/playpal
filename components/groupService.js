// groupService.js — which pile of synced data this device belongs to.
//
// WHY THIS EXISTS
// ---------------
// PlayPal used to write every player profile, custom course and saved round to
// one shared location in Firebase. That is fine for one friend group with the
// app side-loaded on four phones. It is not fine for a public App Store build:
// every stranger who installed it would land in the same bucket, read everyone
// else's email addresses and Venmo handles, and `players.set()` would wipe the
// previous roster on every save.
//
// So every synced path is now namespaced by a GROUP: a 128-bit random id that
// lives on the device and is shared with your golf buddies as a short code. A
// group is not an account — there is still no sign-in, nothing to remember, and
// no personal data leaves the group — but two groups can never see each other.
//
// Existing installs keep their data: a device that already has a roster adopts
// the reserved `LEGACY` group, whose paths ARE the old unscoped ones, so the
// upgrade is invisible to the group that has been using the app all along.

const GroupService = (function () {

  const KEY        = 'pp_group_id';
  const LEGACY_KEY = 'pp_players';          // proof this device predates groups
  const LEGACY_ID  = 'LEGACY';

  // Crockford-ish base32: no I/L/O/U, so a code read aloud in a clubhouse or
  // typed by someone who has had a beer still resolves.
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function _random(len) {
    const out = [];
    const g = (typeof globalThis !== 'undefined') ? globalThis : {};
    const crypto = g.crypto || g.msCrypto;
    if (crypto && crypto.getRandomValues) {
      const buf = new Uint8Array(len);
      crypto.getRandomValues(buf);
      for (let i = 0; i < len; i++) out.push(ALPHABET[buf[i] % ALPHABET.length]);
    } else {
      for (let i = 0; i < len; i++) out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
    }
    return out.join('');
  }

  // 26 characters of this alphabet is ~130 bits — not guessable, and the rules
  // never let anyone list groups, only address one they already know.
  function newGroupId() { return _random(26); }

  function _store() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; }
    catch (e) { return null; }
  }

  // Accepts what a human types: lowercase, spaces, dashes, and the letters
  // people substitute for the digits this alphabet leaves out.
  function normalizeCode(input) {
    return String(input || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .replace(/[ILO]/g, c => ({ I: '1', L: '1', O: '0' }[c]))
      .replace(/U/g, 'V');
  }

  function isValidCode(input) {
    const c = normalizeCode(input);
    return c.length >= 8 && c.length <= 40 && !/[ILOU]/.test(c);
  }

  // The group this device syncs with, creating one on first run. A device that
  // already has a roster keeps talking to the pre-group data instead of waking
  // up to an empty app.
  function current() {
    const store = _store();
    if (!store) return LEGACY_ID;
    let id = store.getItem(KEY);
    if (id) return id;
    id = store.getItem(LEGACY_KEY) ? LEGACY_ID : newGroupId();
    store.setItem(KEY, id);
    return id;
  }

  function isLegacy() { return current() === LEGACY_ID; }

  // Joins the group behind a shared code. Returns the normalized id, or null
  // when the code is not one.
  function join(code) {
    if (!isValidCode(code)) return null;
    const id = normalizeCode(code);
    const store = _store();
    if (store) store.setItem(KEY, id);
    return id;
  }

  // Starts a brand-new, empty group on this device. The old group is not
  // touched — the other phones in it carry on — this device just stops
  // listening to it.
  function reset() {
    const id = newGroupId();
    const store = _store();
    if (store) store.setItem(KEY, id);
    return id;
  }

  // Grouped into blocks so it is readable off a screen and typable by hand.
  function displayCode(id) {
    const c = id || current();
    return (c.match(/.{1,4}/g) || [c]).join('-');
  }

  return {
    LEGACY_ID,
    newGroupId,
    normalizeCode,
    isValidCode,
    current,
    isLegacy,
    join,
    reset,
    displayCode,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { GroupService });
}
