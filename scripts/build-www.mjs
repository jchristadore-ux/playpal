// Assemble the self-contained web bundle that ships inside the native
// (Capacitor) binary. Everything the app needs at runtime is copied into
// www/ — no CDN or remote-URL shell (App Review guideline 4.2).
//
// sw.js is intentionally NOT copied: Capacitor serves the bundle locally,
// so the service worker is only used by the web/PWA deployment.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const FILES = [
  'index.html', 'join.html', 'privacy.html', 'terms.html', 'support.html',
  'manifest.webmanifest', 'playpal-logo.png',
];
const DIRS = ['dist', 'icons', 'vendor'];

if (!existsSync(join(root, 'dist'))) {
  console.error('dist/ missing — run `npm run build` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(out, f));
for (const d of DIRS) cpSync(join(root, d), join(out, d), { recursive: true });

console.log('www/ assembled (self-contained native web bundle)');
