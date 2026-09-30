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
  const OWNER_KEY  = 'pp_group_owner_uid';

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
    try {
      if (typeof window !== 'undefined' && window.AuthService &&
          window.AuthService.isSignedIn && window.AuthService.isSignedIn()) {
        setOwnerUid(window.AuthService.uid());
      }
    } catch (e) {}
    return id;
  }

  function setOwnerUid(uid) {
    const store = _store();
    if (!store) return;
    if (uid) store.setItem(OWNER_KEY, String(uid));
    else store.removeItem(OWNER_KEY);
  }

  function ownerUid() {
    const store = _store();
    if (!store) return null;
    return store.getItem(OWNER_KEY) || null;
  }

  // ── Account default group ──────────────────────────────────────────────
  // A signed-in account owns one group (users/{uid}.groupId). Every device the
  // account signs in on switches to it, carrying its own local-only data over
  // first so nothing is lost. The switch reads the old group and never writes
  // to it; the account group is only ever added to, never overwritten.
  const ACCOUNT_KEY = 'pp_account_group';
  const SWITCH_BACKUP_KEY = 'pp_group_switch_backup';

  function setAccountGroup(id) {
    const store = _store();
    if (!store) return;
    if (id) store.setItem(ACCOUNT_KEY, String(id)); else store.removeItem(ACCOUNT_KEY);
  }
  function accountGroup() {
    const store = _store();
    return store ? (store.getItem(ACCOUNT_KEY) || null) : null;
  }
  // True when the device is on the signed-in account's own group.
  function isAccountGroupActive() {
    const a = accountGroup();
    return !!a && a === current();
  }

  // Like join(), but also accepts the reserved LEGACY id (an account created
  // on a pre-group device carries groupId "LEGACY").
  function adopt(id) {
    if (!id) return null;
    const gid = id === LEGACY_ID ? LEGACY_ID : (isValidCode(id) ? normalizeCode(id) : null);
    if (!gid) return null;
    const store = _store();
    if (store) store.setItem(KEY, gid);
    return gid;
  }

  // Storage locations for an explicit group (same scheme as app.html _rt/_col).
  function rtPath(gid, leaf) { return gid === LEGACY_ID ? leaf : 'groups/' + gid + '/' + leaf; }
  function colName(gid, leaf) {
    if (gid === LEGACY_ID) return leaf === 'rounds' ? 'playpal_rounds' : 'golf_trips';
    return 'g_' + gid + '_' + leaf;
  }

  function _vals(v) {
    if (!v) return [];
    return (Array.isArray(v) ? v : Object.values(v)).filter(x => x && typeof x === 'object');
  }
  function _nm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

  // Pure merge. Account records always win; a candidate is added only when no
  // account record matches it by id, by the id/name it was imported from, or
  // by case-insensitive name. Returns what to add plus the id remap for
  // candidates that turned out to be an existing account player.
  function mergePlan(input) {
    const i = input || {};
    const acctPlayers = _vals(i.acctPlayers);
    const byId = {}, byName = {};
    const index = (p, id) => {
      byId[p.id] = id;
      if (p.importedFrom && p.importedFrom.id != null) byId[p.importedFrom.id] = byId[p.importedFrom.id] || id;
      if (_nm(p.name)) byName[_nm(p.name)] = byName[_nm(p.name)] || id;
      if (p.importedFrom && _nm(p.importedFrom.name)) byName[_nm(p.importedFrom.name)] = byName[_nm(p.importedFrom.name)] || id;
    };
    acctPlayers.forEach(p => { if (p.id != null) index(p, p.id); });
    const idMap = {}, addPlayers = [];
    _vals(i.localPlayers).concat(_vals(i.oldPlayers)).forEach(p => {
      if (p.id == null) return;
      const hit = byId[p.id] != null ? byId[p.id] : (byName[_nm(p.name)] != null ? byName[_nm(p.name)] : null);
      if (hit != null) { if (hit !== p.id) idMap[p.id] = hit; return; }
      addPlayers.push(p);
      index(p, p.id);
    });

    const acctCourses = _vals(i.acctCourses);
    const cId = new Set(acctCourses.map(c => c.id)), cName = new Set(acctCourses.map(c => _nm(c.name)).filter(Boolean));
    const addCourses = [];
    _vals(i.localCourses).concat(_vals(i.oldCourses)).forEach(c => {
      if (c.id == null || cId.has(c.id) || (_nm(c.name) && cName.has(_nm(c.name)))) return;
      addCourses.push(c); cId.add(c.id); if (_nm(c.name)) cName.add(_nm(c.name));
    });

    const acctSaved = _vals(i.acctSaved);
    const sCode = new Set(acctSaved.map(m => m.syncCode).filter(Boolean));
    const addSaved = [];
    _vals(i.localRecent).concat(_vals(i.oldSaved)).forEach(m => {
      if (!m.syncCode || sCode.has(m.syncCode)) return;
      addSaved.push(m); sCode.add(m.syncCode);
    });

    const recent = acctSaved.concat(addSaved)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 20);
    return {
      idMap, addPlayers, addCourses, addSaved,
      players: acctPlayers.concat(addPlayers),
      courses: acctCourses.concat(addCourses),
      recent,
    };
  }

  // Rewrites player ids (object keys and exact string values) per idMap.
  function remapIds(o, idMap) {
    if (!idMap || !Object.keys(idMap).length) return o;
    if (Array.isArray(o)) return o.map(v => remapIds(v, idMap));
    if (o && typeof o === 'object') {
      const r = {};
      Object.keys(o).forEach(k => { r[idMap[k] || k] = remapIds(o[k], idMap); });
      return r;
    }
    if (typeof o === 'string' && Object.prototype.hasOwnProperty.call(idMap, o)) return idMap[o];
    return o;
  }

  function _json(store, key, fallback) {
    try { const raw = store.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  // Merge this device's old group into the account group, then switch.
  //   io: { readRt(path) → Promise<val>, updateRt(patch) → Promise,
  //         readDoc(col, id) → Promise<data|null>, createDoc(col, id, data) → Promise }
  // Old-group paths are only ever read. Account-group writes only create
  // records that do not exist. Local data: completed snapshots and the round in
  // progress stay on the device (player ids remapped where a player was matched
  // to an existing account profile; the pre-switch copy is kept in
  // pp_group_switch_backup). Resolves { switched, plan }.
  async function switchToAccountGroup(acctGroup, io, opts) {
    const store = (opts && opts.storage) || _store();
    const from = current();
    const to = acctGroup === LEGACY_ID ? LEGACY_ID : (isValidCode(acctGroup) ? normalizeCode(acctGroup) : null);
    if (!store || !to || to === from || !io) return { switched: false };

    const [oldPlayers, oldCourses, oldSaved, acctPlayers, acctCourses, acctSaved] = await Promise.all([
      io.readRt(rtPath(from, 'players')), io.readRt(rtPath(from, 'courses')), io.readRt(rtPath(from, 'saved_rounds')),
      io.readRt(rtPath(to, 'players')),   io.readRt(rtPath(to, 'courses')),   io.readRt(rtPath(to, 'saved_rounds')),
    ]);
    const plan = mergePlan({
      localPlayers: _json(store, 'pp_players', []), oldPlayers, acctPlayers,
      localCourses: _json(store, 'pp_custom_courses', []), oldCourses, acctCourses,
      localRecent: _json(store, 'pp_recent', []), oldSaved, acctSaved,
    });
    const idMap = plan.idMap;

    // 1. Account group: add-only.
    const patch = {};
    plan.addPlayers.forEach(p => { patch[rtPath(to, 'players') + '/' + p.id] = p; });
    plan.addCourses.forEach(c => { patch[rtPath(to, 'courses') + '/' + c.id] = c; });
    plan.addSaved.forEach(m => { patch[rtPath(to, 'saved_rounds') + '/' + m.syncCode] = m; });
    if (Object.keys(patch).length) await io.updateRt(patch);

    // Round docs for carried-over saved rounds and the round in progress.
    const active = store.getItem('pp_active_round') === '1' ? _json(store, 'pp_round', null) : null;
    const codes = plan.addSaved.map(m => m.syncCode);
    if (active && active.syncCode && codes.indexOf(active.syncCode) === -1) codes.push(active.syncCode);
    for (const code of codes) {
      if (!/^[A-Z0-9]{4,12}$/.test(String(code))) continue;
      try {
        const have = await io.readDoc(colName(to, 'rounds'), code);
        if (have) continue;
        const src = await io.readDoc(colName(from, 'rounds'), code);
        if (src) await io.createDoc(colName(to, 'rounds'), code, remapIds(src, idMap));
      } catch (e) { /* one round doc failing must not block the switch */ }
    }

    // 2. Local state for the account group.
    const remapKeys = [];
    for (let k = 0; k < store.length; k++) {
      const key = store.key(k);
      if (!key) continue;
      if (key.indexOf('pp_round_snap_') === 0) remapKeys.push(key);
      else if (active && active.id != null && key !== 'pp_round' &&
               /^pp_[a-z]+_/.test(key) && key.slice(-(String(active.id).length + 1)) === '_' + active.id) remapKeys.push(key);
    }
    if (active) remapKeys.push('pp_round');
    if (Object.keys(idMap).length) {
      const backup = { from, to, at: Date.now(), idMap, active: {} };
      if (active) remapKeys.filter(k => k.indexOf('pp_round_snap_') !== 0).forEach(k => { backup.active[k] = store.getItem(k); });
      try { store.setItem(SWITCH_BACKUP_KEY, JSON.stringify(backup)); } catch (e) { /* storage full */ }
      remapKeys.forEach(key => {
        try {
          const raw = store.getItem(key);
          if (raw == null) return;
          const next = JSON.stringify(remapIds(JSON.parse(raw), idMap));
          if (next !== raw) store.setItem(key, next);
        } catch (e) { /* non-JSON value — leave it */ }
      });
    }
    store.setItem('pp_players', JSON.stringify(plan.players));
    store.setItem('pp_custom_courses', JSON.stringify(plan.courses));
    store.setItem('pp_recent', JSON.stringify(plan.recent));
    store.setItem(KEY, to);
    setAccountGroup(to);
    return { switched: true, from, to, plan };
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
    setOwnerUid,
    ownerUid,
    setAccountGroup,
    accountGroup,
    isAccountGroupActive,
    adopt,
    rtPath,
    colName,
    mergePlan,
    remapIds,
    switchToAccountGroup,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { GroupService });
}
