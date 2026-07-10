// gen-seed.mjs — regenerates components/egt/egtSeedData.js from the single
// source of truth (fixtures/egt-2026-seed.json). Run after editing the fixture:
//   node scripts/gen-seed.mjs
// egtSeedData.js embeds the trip definition as window.EGT_SEED so the offline
// PWA imports it with no network fetch. Do not hand-edit egtSeedData.js.

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'fixtures/egt-2026-seed.json';
const OUT = 'components/egt/egtSeedData.js';

const seed = JSON.parse(readFileSync(SRC, 'utf8'));

// Pretty JSON, then ASCII-escape non-ASCII so the emitted JS matches the
// repo's existing \uXXXX style and stays 7-bit clean.
const json = JSON.stringify(seed, null, 2).replace(/[-￿]/g, ch =>
  '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));

const out = `// egtSeedData.js — the canonical EGT 2026 trip definition, embedded so the
// offline PWA imports it with no network fetch. Generated from
// fixtures/egt-2026-seed.json (the single source of truth). Re-generate with:
//   node scripts/gen-seed.mjs   — Do not hand-edit.
const EGT_SEED = ${json};
if (typeof window !== "undefined") { window.EGT_SEED = EGT_SEED; }
`;

writeFileSync(OUT, out);
console.log(`Wrote ${OUT} from ${SRC} (schemaVersion ${seed.schemaVersion}).`);
