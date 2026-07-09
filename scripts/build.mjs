// Precompiles all PlayPal sources into dist/ so the browser never runs Babel.
//
// Constraint: the app's files communicate through globals (Object.assign(window, …)
// and top-level const bindings in classic scripts), so we transform file-by-file
// (no bundling) and never rename identifiers — whitespace minification only.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';

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
  'components/sharingService.js',
  'components/migrations.js',
  'components/egt/egtSeedData.js',
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
  'components/bottomLineProvider.js',
  'components/BottomLine.jsx',
  'components/EgtTournament.jsx',
  'components/Shared.jsx',
  'components/Home.jsx',
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

console.log('Build complete → dist/');
