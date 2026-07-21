// Loads PlayPal's browser scripts into a Node vm context that imitates a
// page's global scope (a `window` object that is also the global object),
// so the same files that ship to the browser are what get tested.

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Minimal in-memory localStorage so storage-backed services run under Node.
function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
    clear: () => map.clear(),
  };
}

export function loadPlayPal(opts = {}) {
  const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, parseInt, parseFloat, isNaN };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (opts.localStorage !== false) sandbox.localStorage = makeFakeStorage();
  const ctx = createContext(sandbox);

  for (const file of [
    'components/gameData.js',
    'components/gameUtils.js',
    'components/tripUtils.js',
    'components/handicapService.js',
    'components/courseService.js',
    'components/matchEngine.js',
    'components/statsService.js',
    'components/profileService.js',
    'components/roundHistoryService.js',
    'components/sharingService.js',
    'components/migrations.js',
    // EGT tournament engine (classic scripts, self-assign to window):
    'components/egt/egtHandicap.js',
    'components/egt/egtImporter.js',
    'components/egt/egtScoring.js',
    'components/egt/egtSideGames.js',
    'components/egt/egtPoints.js',
    'components/egt/egtMoney.js',
    'components/egt/egtStandings.js',
    'components/egt/egtStore.js',
    'components/egt/egtPrintable.js',
    'components/egt/egtEngine.js',
    'components/egt/egtBridge.js',
    'components/egt/egtSync.js',
    'components/bottomLineProvider.js',
  ]) {
    const code = readFileSync(join(root, file), 'utf8');
    runInContext(code, ctx, { filename: file });
  }
  // Top-level consts live in the context's global lexical scope, not on
  // `window` — surface the ones tests need.
  runInContext(
    'window.FORMATS = FORMATS; window.FORMAT_INFO = FORMAT_INFO; ' +
    'window.COURSES = COURSES; window.DEFAULT_PLAYERS = DEFAULT_PLAYERS; ' +
    'window.HandicapService = HandicapService; window.CourseService = CourseService; ' +
    'window.MatchEngine = MatchEngine; window.StatsService = StatsService; ' +
    'window.ProfileService = ProfileService; window.RoundHistoryService = RoundHistoryService; ' +
    'window.SharingService = SharingService; window.PP_SCHEMA_VERSION = PP_SCHEMA_VERSION; ' +
    'window.migratePlayersV2 = migratePlayersV2; window.migrateCoursesV2 = migrateCoursesV2; ' +
    'window.runMigrations = runMigrations;',
    ctx
  );
  return sandbox.window;
}
