// migrations.js — versioned, idempotent localStorage migrations.
//
// Runs once per schema bump before the app reads any stored data. Migrations
// only ever ADD fields/normalize shapes — they never delete user data, so a
// downgrade to an older build keeps working (old code ignores new fields).

const PP_SCHEMA_VERSION = 2;

// v2: players gain profile fields, custom courses gain tees[] + holeCount.
function migratePlayersV2(players) {
  const PS = (typeof window !== 'undefined' && window.ProfileService) || ProfileService;
  return PS.normalizeAll(players);
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

  try { ls.setItem('pp_schema_version', String(PP_SCHEMA_VERSION)); } catch (e) { /* non-fatal */ }
  return { ran: true, from, to: PP_SCHEMA_VERSION };
}

if (typeof window !== 'undefined') {
  Object.assign(window, { PP_SCHEMA_VERSION, migratePlayersV2, migrateCoursesV2, runMigrations });
  // Browser: run immediately so every screen sees migrated data.
  if (typeof localStorage !== 'undefined') runMigrations();
}
