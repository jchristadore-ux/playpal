// Loads PlayPal's browser scripts into a Node vm context that imitates a
// page's global scope (a `window` object that is also the global object),
// so the same files that ship to the browser are what get tested.

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadPlayPal() {
  const sandbox = { console, Math, Date, JSON, Object, Array };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = createContext(sandbox);

  for (const file of ['components/gameData.js', 'components/gameUtils.js', 'components/tripUtils.js']) {
    const code = readFileSync(join(root, file), 'utf8');
    runInContext(code, ctx, { filename: file });
  }
  // Top-level consts live in the context's global lexical scope, not on
  // `window` — surface the ones tests need.
  runInContext(
    'window.FORMATS = FORMATS; window.FORMAT_INFO = FORMAT_INFO; ' +
    'window.COURSES = COURSES; window.DEFAULT_PLAYERS = DEFAULT_PLAYERS;',
    ctx
  );
  return sandbox.window;
}
