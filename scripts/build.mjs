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
  'components/Shared.jsx',
  'components/Home.jsx',
  'components/Setup.jsx',
  'components/PlayerCard.jsx',
  'components/Trackers.jsx',
  'components/LiveScorecard.jsx',
  'components/ScoreEntry.jsx',
  'components/Summary.jsx',
  'components/RoundViewer.jsx',
  'components/TripDashboard.jsx',
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
