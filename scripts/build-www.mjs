// Assemble the self-contained web bundle that ships inside the native
// (Capacitor) binary. Everything the app needs at runtime is copied into
// www/ — no CDN or remote-URL shell (App Review guideline 4.2).
//
// sw.js is intentionally NOT copied: Capacitor serves the bundle locally,
// so the service worker is only used by the web/PWA deployment.
//
//   npm run build:www              everything, including the private EGT Cup
//   npm run build:www -- --public  the build to submit to the App Store
//
// --public leaves out the two things that are one private group's, not the
// app's: the EGT Cup seed (four named people, their scores and their money)
// and their profile photos. The Cup engine is generic code and stays; without
// a seed there is simply no tournament to show, which is what a stranger who
// downloads a golf scorer should get. Everything else is identical.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const isPublic = process.argv.includes('--public');

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
for (const d of DIRS) {
  cpSync(join(root, d), join(out, d), {
    recursive: true,
    // Skip the four private profile photos on a public build.
    filter: (src) => !(isPublic && src.includes(join('icons', 'players'))),
  });
}

if (isPublic) {
  // The script tag stays so nothing 404s; the personal data does not.
  writeFileSync(join(out, 'dist', 'egt', 'egtSeedData.js'),
    '// Private tournament data is not part of the public build.\n'
    + 'if (typeof window !== "undefined") { window.EGT_SEED = null; }\n');
}

console.log(isPublic
  ? 'www/ assembled — PUBLIC build (private tournament data excluded)'
  : 'www/ assembled (self-contained native web bundle)');
