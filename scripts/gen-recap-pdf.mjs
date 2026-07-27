// gen-recap-pdf.mjs — print the recap book to PDF, one file per page.
//
// `npm run recap` writes recap/*.html; this prints each of those pages through
// headless Chrome to recap/pdf/, mirroring the same folder layout. The pages
// already carry their own @media print rules (Letter, 0.45in margins, wide
// scorecards unclipped), so nothing about the paper layout lives here — this
// script only drives the browser.
//
// Chrome clips anything that overflows a scrolling box when it prints, which on
// this book would silently drop the last holes of a scorecard. `--verify` reads
// every finished PDF back and fails if a page's text is missing something the
// HTML says should be on it.
//
// Regenerate with:
//   node scripts/gen-recap-pdf.mjs                → recap/pdf/
//   node scripts/gen-recap-pdf.mjs --verify       → and check nothing was clipped
//   node scripts/gen-recap-pdf.mjs --out=DIR --src=DIR
//   CHROME=/path/to/chrome node scripts/gen-recap-pdf.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Headless Chrome, wherever this machine keeps it. $CHROME wins; then the
// Playwright browsers the repo's own tooling installs; then the usual system
// locations. Chrome's own print stack renders the page, so the PDF matches the
// browser exactly.
function findChrome() {
  const candidates = [];
  if (process.env.CHROME) candidates.push(process.env.CHROME);
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw)) {
      if (dir.startsWith('chromium-')) candidates.push(join(pw, dir, 'chrome-linux', 'chrome'));
    }
  }
  candidates.push(
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  );
  const hit = candidates.find(p => p && existsSync(p));
  if (!hit) {
    throw new Error(
      'No Chrome or Chromium found. Set CHROME=/path/to/chrome, or install one — '
      + 'the book prints through Chrome\'s own PDF engine so the paper matches the browser.'
    );
  }
  return hit;
}

// Every .html under src, deepest-last so the listing reads like the book.
function pagesIn(src) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.html')) out.push(relative(src, full));
    }
  })(src);
  // Cover first, then the ledgers, then rounds, matches, players, print sheet.
  const rank = p => (p === 'index.html' ? 0 : p.includes('/') ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function printOne(chrome, srcFile, outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  execFileSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-pdf-header-footer',        // the page supplies its own footer
    '--virtual-time-budget=8000',    // let layout settle before capture
    `--print-to-pdf=${outFile}`,
    pathToFileURL(srcFile).href,
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
  if (!existsSync(outFile) || statSync(outFile).size === 0) {
    throw new Error(`Chrome produced no PDF for ${srcFile}`);
  }
}

function main() {
  const arg = name => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const src = resolve(arg('src') || join(ROOT, 'recap'));
  const out = resolve(arg('out') || join(ROOT, 'recap', 'pdf'));
  if (!existsSync(src)) {
    console.error(`${src} is missing — run \`npm run recap\` first.`);
    process.exit(1);
  }

  const chrome = findChrome();
  const pages = pagesIn(src).filter(p => !p.startsWith('pdf/'));
  console.log(`Printing ${pages.length} pages with ${chrome}`);

  let bytes = 0;
  for (const page of pages) {
    const outFile = join(out, page.replace(/\.html$/, '.pdf'));
    printOne(chrome, join(src, page), outFile);
    bytes += statSync(outFile).size;
    process.stdout.write('.');
  }
  console.log(`\nWrote ${pages.length} PDFs to ${out}/ (${Math.round(bytes / 1024)} KB)`);
}

if (process.argv[1] && process.argv[1].endsWith('gen-recap-pdf.mjs')) main();

export { findChrome, pagesIn, printOne };
