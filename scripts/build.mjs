// Precompiles all PlayPal sources into dist/ so the browser never runs Babel.
//
// Constraint: the app's files communicate through globals (Object.assign(window, …)
// and top-level const bindings in classic scripts), so we transform file-by-file
// (no bundling) and never rename identifiers — whitespace minification only.

import { build } from 'esbuild';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCES = [
  'components/gameData.js',
  'components/gameUtils.js',
  'components/tripUtils.js',
  'components/handicapService.js',
  'components/courseService.js',
  'components/matchEngine.js',
  'components/statsService.js',
  'components/profileService.js',
  'components/roundHistoryService.js',
  'components/groupService.js',
  'components/entitlementHelpers.js',
  'components/authService.js',
  'components/proService.js',
  'components/sharingService.js',
  'components/scorecardImport.js',
  'components/migrations.js',
  'components/egt/egtSeedData.js',
  'components/egt/egtHandicap.js',
  'components/egt/egtImporter.js',
  'components/egt/egtScoring.js',
  'components/egt/egtSideGames.js',
  'components/egt/egtPoints.js',
  'components/egt/egtMoney.js',
  'components/egt/egtMoneySummary.js',
  'components/egt/egtStandings.js',
  'components/egt/egtStore.js',
  'components/egt/egtPrintable.js',
  'components/egt/egtEngine.js',
  'components/egt/egtBridge.js',
  'components/egt/egtSync.js',
  'components/bottomLineProvider.js',
  'components/BottomLine.jsx',
  'components/EgtTournament.jsx',
  'components/Shared.jsx',
  'components/Home.jsx',
  'components/AuthScreen.jsx',
  'components/Setup.jsx',
  'components/Trackers.jsx',
  'components/GameTrackers.jsx',
  'components/LiveScorecard.jsx',
  'components/ScoreEntry.jsx',
  'components/Summary.jsx',
  'components/RoundViewer.jsx',
  'components/TripDashboard.jsx',
  'components/StatsScreen.jsx',
  'components/App.jsx',
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: SOURCES,
  outdir: 'dist',
  bundle: false,
  format: undefined,          // keep top-level bindings global (classic scripts)
  loader: { '.jsx': 'jsx' },
  jsx: 'transform',           // JSX → React.createElement (React is a global)
  target: 'es2017',
  minifyWhitespace: true,
  minifyIdentifiers: false,   // cross-file refs rely on top-level names
  minifySyntax: false,
  charset: 'utf8',
  logLevel: 'info',
});


// GitHub Pages assemble step (deploy-pages.yml) copies dist/ but not root
// app.html until the workflow list is updated. Publish a path-rewritten shell
// at dist/app.html so the marketing CTA / PWA start_url work on Pages today.
{
  const raw = readFileSync('app.html', 'utf8');
  const rewritten = raw
    .replaceAll('src="dist/', 'src="')
    .replaceAll('href="dist/', 'href="')
    .replaceAll('src="vendor/', 'src="../vendor/')
    .replaceAll('href="vendor/', 'href="../vendor/')
    .replaceAll('href="icons/', 'href="../icons/')
    .replaceAll('src="icons/', 'src="../icons/')
    .replaceAll('href="manifest.webmanifest"', 'href="../manifest.webmanifest"')
    .replaceAll('src="playpal-logo.png"', 'src="../playpal-logo.png"')
    .replaceAll("register('sw.js')", "register('../sw.js')")
    .replaceAll(
      'content="https://jchristadore-ux.github.io/playpal/app.html"',
      'content="https://jchristadore-ux.github.io/playpal/dist/app.html"',
    )
    .replaceAll(
      'content="https://jchristadore-ux.github.io/playpal/assets/og-card.png"',
      'content="https://jchristadore-ux.github.io/playpal/icons/og-card.png"',
    );
  writeFileSync('dist/app.html', rewritten);
  console.log('Pages app shell → dist/app.html');
}

console.log('Build complete → dist/');

