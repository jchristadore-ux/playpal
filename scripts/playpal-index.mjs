#!/usr/bin/env node
// playpal-index.mjs — reload every stored scorecard and compute each player's
// PlayPal Index (WHS method) from them.
//
// Sources: fixtures/egt-2026-results.json (every gross score the app synced)
//          fixtures/egt-2026-seed.json    (courses, tees, rounds, CHs)
// Outputs: docs/scorecards/egt-2026-scorecards.json  (reloadable scorecards)
//          docs/scorecards/PLAYPAL_INDEX.md           (the index report)
//
// Method (World Handicap System):
//   1. Adjusted Gross Score: each hole capped at net double bogey
//      (par + 2 + strokes received from the round's pre-trip course handicap).
//   2. Score Differential = (113 / Slope) × (AGS − Course Rating), 1 dp.
//   3. Index from the count of differentials (WHS table, < 20 scores):
//      3→low1 −2.0 · 4→low1 −1.0 · 5→low1 · 6→low2 avg −1.0 · 7-8→low2 ·
//      9-11→low3 · 12-14→low4 · 15-16→low5 · 17-18→low6 · 19→low7 · 20→low8.
//
// Run: node scripts/playpal-index.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(readFileSync(join(ROOT, 'fixtures/egt-2026-results.json'), 'utf8'));
const seed = JSON.parse(readFileSync(join(ROOT, 'fixtures/egt-2026-seed.json'), 'utf8'));

const NAMES = { john: 'John', brian: 'Brian', tj: 'TJ', mike: 'Mike' };
const priorIndex = Object.fromEntries(seed.players.map(p => [p.id, p.handicapIndex]));

function strokesOnHole(ch, si) {
  if (ch <= 0) return 0;
  return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0);
}

function whsIndex(diffs) {
  const n = diffs.length;
  if (n < 3) return null;
  const table = [
    [3, 1, -2], [4, 1, -1], [5, 1, 0], [6, 2, -1], [8, 2, 0], [11, 3, 0],
    [14, 4, 0], [16, 5, 0], [18, 6, 0], [19, 7, 0], [Infinity, 8, 0],
  ];
  const [, use, adj] = table.find(([max]) => n <= max);
  const recent = diffs.slice(-20);
  const low = recent.map(d => d.diff).sort((a, b) => a - b).slice(0, use);
  const avg = low.reduce((a, b) => a + b, 0) / low.length;
  return { index: Math.round((avg + adj) * 10) / 10, used: use, adjustment: adj, counted: low };
}

const scorecards = [];
const byPlayer = {};

for (const round of seed.rounds) {
  const stored = results.rounds[round.id];
  if (!stored) continue;
  const course = seed.courseLibrary[round.courseId];
  const tee = course.tees.find(t => t.name === round.playedTee);
  const holes = course.holes.map(h => ({ hole: h.hole, par: h.par, si: h.si }));
  const par = holes.reduce((a, h) => a + h.par, 0);

  const players = {};
  for (const [pid, gross] of Object.entries(stored.scores)) {
    const ch = round.courseHandicaps?.[pid] ?? 0;
    const adjusted = gross.map((g, i) => Math.min(g, holes[i].par + 2 + strokesOnHole(ch, holes[i].si)));
    const grossTotal = gross.reduce((a, b) => a + b, 0);
    const ags = adjusted.reduce((a, b) => a + b, 0);
    const diff = Math.round(((113 / tee.slope) * (ags - tee.cr)) * 10) / 10;
    players[pid] = {
      name: NAMES[pid] || pid,
      courseHandicap: ch,
      gross,
      out: gross.slice(0, 9).reduce((a, b) => a + b, 0),
      in: gross.slice(9).reduce((a, b) => a + b, 0),
      grossTotal,
      toPar: grossTotal - par,
      adjustedGross: ags,
      differential: diff,
    };
    (byPlayer[pid] ||= []).push({ round: round.id, course: course.name, gross: grossTotal, ags, diff });
  }

  scorecards.push({
    round: round.id,
    date: round.date,
    courseId: round.courseId,
    course: course.name,
    location: course.location,
    tee: { name: tee.name, rating: tee.cr, slope: tee.slope, par: tee.par, yards: tee.yards },
    format: round.primaryGame,
    holes,
    players,
  });
}

const indexes = Object.entries(byPlayer).map(([pid, diffs]) => {
  const w = whsIndex(diffs);
  return { pid, name: NAMES[pid] || pid, prior: priorIndex[pid], rounds: diffs, ...w };
}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

// ── write outputs ────────────────────────────────────────────────────────────
const outDir = join(ROOT, 'docs/scorecards');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'egt-2026-scorecards.json'), JSON.stringify({
  _comment: 'Every stored EGT 2026 scorecard, reloaded from fixtures/egt-2026-results.json with course/tee data from fixtures/egt-2026-seed.json. Regenerate with node scripts/playpal-index.mjs.',
  generatedAt: new Date().toISOString().slice(0, 10),
  scorecards,
  playpalIndex: Object.fromEntries(indexes.map(p => [p.pid, {
    name: p.name, index: p.index, priorIndex: p.prior, differentialsUsed: p.used, adjustment: p.adjustment,
  }])),
}, null, 2) + '\n');

const fmt = n => (n > 0 ? '+' : '') + n;
const pids = Object.keys(NAMES).filter(p => byPlayer[p]);
let md = '# PlayPal Index — EGT 2026\n\n';
md += 'Every stored scorecard (R1–R6), reloaded and run through the World Handicap System: ';
md += 'net-double-bogey hole caps (from each round\'s pre-trip course handicap), ';
md += 'Score Differential = 113 ÷ Slope × (AGS − Course Rating), and the WHS table for fewer than 20 scores.\n\n';
md += 'Regenerate: `node scripts/playpal-index.mjs`\n\n';

md += '## PlayPal Index\n\n| Player | PlayPal Index | Pre-trip Index | Change | Rounds | Differentials counted |\n|---|---:|---:|---:|---:|---|\n';
for (const p of indexes) {
  md += `| ${p.name} | **${p.index.toFixed(1)}** | ${p.prior.toFixed(1)} | ${fmt(Math.round((p.index - p.prior) * 10) / 10)} | ${p.rounds.length} | low ${p.used} (${p.counted.map(d => d.toFixed(1)).join(', ')})${p.adjustment ? ` ${p.adjustment.toFixed(1)}` : ''} |\n`;
}

md += '\n## Differentials by round\n\n| Round | Course (White) | CR / Slope | ' + pids.map(p => NAMES[p]).join(' | ') + ' |\n|---|---|---|' + pids.map(() => '---:').join('|') + '|\n';
for (const sc of scorecards) {
  md += `| ${sc.round} | ${sc.course} | ${sc.tee.rating} / ${sc.tee.slope} | ` + pids.map(p => {
    const x = sc.players[p];
    return x ? `${x.grossTotal} → ${x.adjustedGross} · **${x.differential.toFixed(1)}**` : '—';
  }).join(' | ') + ' |\n';
}
md += '\nCells read gross → adjusted gross · differential.\n';

md += '\n## Scorecards\n';
for (const sc of scorecards) {
  md += `\n### ${sc.round} — ${sc.course}, ${sc.location} · ${sc.date}\n\n`;
  md += `White tees · ${sc.tee.yards} yds · Par ${sc.tee.par} · CR ${sc.tee.rating} · Slope ${sc.tee.slope}\n\n`;
  const h = sc.holes;
  md += '| Hole | ' + h.map(x => x.hole).join(' | ') + ' | Out | In | Tot | ± | CH | AGS | Diff |\n';
  md += '|---|' + h.map(() => '---:').join('|') + '|---:|---:|---:|---:|---:|---:|---:|\n';
  md += '| Par | ' + h.map(x => x.par).join(' | ') + ` | ${h.slice(0, 9).reduce((a, x) => a + x.par, 0)} | ${h.slice(9).reduce((a, x) => a + x.par, 0)} | ${sc.tee.par} | | | | |\n`;
  md += '| SI | ' + h.map(x => x.si).join(' | ') + ' | | | | | | | |\n';
  for (const p of pids) {
    const x = sc.players[p];
    if (!x) continue;
    md += `| ${x.name} | ` + x.gross.join(' | ') + ` | ${x.out} | ${x.in} | **${x.grossTotal}** | ${fmt(x.toPar)} | ${x.courseHandicap} | ${x.adjustedGross} | ${x.differential.toFixed(1)} |\n`;
  }
}

md += '\n## Notes\n\n';
md += '- Minerals and Cascades are 9-hole courses played twice; they use the 18-hole White rating/slope.\n';
md += '- R5 (Cascades) was a scramble/alternate-shot day for the team game; the individual gross cards used here are the ones kept for the round-robin singles.\n';
md += '- No soft/hard cap or exceptional-score reduction applied — this is a fresh index built only from these six cards.\n';

writeFileSync(join(outDir, 'PLAYPAL_INDEX.md'), md);

for (const p of indexes) console.log(`${p.name.padEnd(6)} ${p.index.toFixed(1).padStart(5)}  (pre-trip ${p.prior.toFixed(1)})  diffs: ${p.rounds.map(r => r.diff.toFixed(1)).join(', ')}`);
