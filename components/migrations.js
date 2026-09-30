// migrations.js — versioned, idempotent localStorage migrations.
//
// Runs once per schema bump before the app reads any stored data. Migrations
// only ever ADD fields/normalize shapes — they never delete user data, so a
// downgrade to an older build keeps working (old code ignores new fields).

const PP_SCHEMA_VERSION = 3;

// v2: players gain profile fields, custom courses gain tees[] + holeCount.
function migratePlayersV2(players) {
  const PS = (typeof window !== 'undefined' && window.ProfileService) || ProfileService;
  return PS.normalizeAll(players);
}

// v3: players gain the PlayPal Index fields, and — one-time backfill — each
// player's differential history is rebuilt from locally saved rounds so a
// group that has been scoring for months has an index immediately.
// Idempotent (roundId/syncCode dedupe) and additive (never deletes).
function migratePlayersV3(players, dataList) {
  const PS = (typeof window !== 'undefined' && window.ProfileService) || ProfileService;
  const IS = (typeof window !== 'undefined' && window.IndexService) || IndexService;
  let list = dataList;
  if (!list) {
    try {
      const RH = (typeof window !== 'undefined' && window.RoundHistoryService) || RoundHistoryService;
      list = RH.listRoundData();
    } catch (e) { list = []; }
  }
  return PS.normalizeAll(players).map(p => IS.rebuildFromHistory(p, list));
}

function migrateCoursesV2(courses) {
  const CS = (typeof window !== 'undefined' && window.CourseService) || CourseService;
  return (courses || []).map(c => CS.normalizeCourse(c));
}

function runMigrations() {
  let ls;
  try { ls = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { ls = null; }
  if (!ls) return { ran: false, from: null, to: PP_SCHEMA_VERSION };

  let from = 1;
  try { from = parseInt(ls.getItem('pp_schema_version')) || 1; } catch (e) { from = 1; }
  if (from >= PP_SCHEMA_VERSION) return { ran: false, from, to: from };

  if (from < 2) {
    try {
      const raw = ls.getItem('pp_players');
      if (raw) ls.setItem('pp_players', JSON.stringify(migratePlayersV2(JSON.parse(raw))));
    } catch (e) { console.warn('[PlayPal] player migration skipped:', e); }
    try {
      const raw = ls.getItem('pp_custom_courses');
      if (raw) ls.setItem('pp_custom_courses', JSON.stringify(migrateCoursesV2(JSON.parse(raw))));
    } catch (e) { console.warn('[PlayPal] course migration skipped:', e); }
  }

  if (from < 3) {
    try {
      const raw = ls.getItem('pp_players');
      if (raw) ls.setItem('pp_players', JSON.stringify(migratePlayersV3(JSON.parse(raw))));
    } catch (e) { console.warn('[PlayPal] PlayPal Index backfill skipped:', e); }
  }

  try { ls.setItem('pp_schema_version', String(PP_SCHEMA_VERSION)); } catch (e) { /* non-fatal */ }
  return { ran: true, from, to: PP_SCHEMA_VERSION };
}

if (typeof window !== 'undefined') {
  Object.assign(window, { PP_SCHEMA_VERSION, migratePlayersV2, migratePlayersV3, migrateCoursesV2, runMigrations });
  // Browser: run immediately so every screen sees migrated data.
  if (typeof localStorage !== 'undefined') runMigrations();
}
