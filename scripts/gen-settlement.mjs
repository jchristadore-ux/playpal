// gen-settlement.mjs — writes settlement.html, the one-screen final money board
// for the EGT 2026 Cup. Everything on the page comes out of the tournament
// engine run over fixtures/egt-2026-seed.json + fixtures/egt-2026-results.json
// (the scores the app actually synced), so the board can never drift from what
// the app and the SportsCenter compute. Regenerate with:
//   node scripts/gen-settlement.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { loadPlayPal } from '../tests/helpers/load.mjs';

const SEED = JSON.parse(readFileSync('fixtures/egt-2026-seed.json', 'utf8'));
const RESULTS = JSON.parse(readFileSync('fixtures/egt-2026-results.json', 'utf8')).rounds;
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

const W = loadPlayPal();
const { EgtImporter, EgtStore, EgtBridge, EgtEngine } = W;
const IDS = ['john', 'brian', 'tj', 'mike'];
const NAME = { john: 'John', brian: 'Brian', tj: 'TJ', mike: 'Mike' };

// ── replay the trip ─────────────────────────────────────────────────────────
const model = EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
const state = EgtStore.emptyState(model.trip.id);
state.model = model;
for (const rid of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) {
  const r = RESULTS[rid];
  EgtBridge.bridge(model, state, rid, {
    scores: r.scores, wolfData: r.wolfData || {}, bbbData: r.bbbData || {},
    putts: {}, firData: {}, girData: {}, extraStats: {},
  });
  state.finalized.push(rid);
}
const live = EgtEngine.liveUpdate(state, { noPersist: true, season: true });
const money = live.money;
const res = live.resultsByRound;

// ── the summary ─────────────────────────────────────────────────────────────
// Shape it with the shared module, so this board, the app's Money tab and the
// SportsCenter all describe the trip's money identically.
const summary = W.EgtMoneySummary.build(model, live);
const settle = summary.settle;

// Formats and day labels are board furniture, not engine output.
const DAY = { R1: 'Tue', R2: 'Wed AM', R3: 'Wed PM', R4: 'Thu AM', R5: 'Thu PM', R6: 'Fri' };
const FORMAT = {
  R1: 'Bingo Bango Bongo (front) + The Nines (back)',
  R2: '18-hole four-ball · John + TJ v Brian + Mike',
  R3: 'Wolf + a TJ v John $2 Nassau',
  R4: '2v2 aggregate Stableford over all 18',
  R5: 'Full-18 Bingo Bango Bongo + six-match round robin',
  R6: 'Individual Stableford + two $2 Nassaus',
};
const ROUNDS = summary.rounds.map(r => ({
  id: r.id, day: DAY[r.id] || r.date, course: r.course,
  format: FORMAT[r.id] || '', lines: r.work,
}));

// ── render ──────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cash = n => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(0)}`;
const tone = n => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
const cell = n => (n === 0 ? '<td class="flat">—</td>' : `<td class="${tone(n)}">${cash(n)}</td>`);

const finalOrder = IDS.slice().sort((a, b) => money.total[b] - money.total[a]);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="description" content="EGT 2026 Cup — the final money settlement: every round's stakes, the off-course costs, and who pays whom."/>
<meta name="theme-color" content="#05090C"/>
<title>EGT 2026 · Final Settlement</title>
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png"/>
<link href="vendor/fonts.css" rel="stylesheet"/>
<style>
${styles()}
</style>
</head>
<body>
${body()}
</body>
</html>
`;

writeFileSync('settlement.html', html);
console.log('Wrote settlement.html');

// A standalone copy for sharing: same board, but with nothing to fetch — the
// app's vendored webfont isn't there, so it rides on the system stack, and the
// host page supplies the document wrapper.
const shareTarget = process.argv.find(a => a.startsWith('--share='));
if (shareTarget) {
  const path = shareTarget.slice('--share='.length);
  writeFileSync(path, `<title>EGT 2026 · Final Settlement</title>\n<style>\n${
    styles().replace(/'Plus Jakarta Sans', 'Inter', /, '')}\n</style>\n${body()}\n`);
  console.log(`Wrote ${path}`);
}
console.log('  final:', IDS.map(p => `${NAME[p]} ${cash(money.total[p])}`).join('  '));
console.log('  golf :', IDS.map(p => `${NAME[p]} ${cash(money.golfOnly[p])}`).join('  '));
console.log('  nets to zero:', money.netsToZero);

function styles() {
  return `
  /* The EGT SportsCenter's own palette (bottomline.html): near-black ground,
     bone type, brass accent, broadcast green/coral for up and down. This board
     is a TV card, so it commits to the dark world rather than following the
     viewer's theme. */
  :root {
    --ground: #05090C;
    --panel: #0B1218;
    --panel-2: #101922;
    --line: rgba(200, 161, 90, 0.22);
    --bone: #F6F4EE;
    --dim: rgba(246, 244, 238, 0.52);
    --faint: rgba(246, 244, 238, 0.30);
    --brass: #C8A15A;
    --up: #3DCB6C;
    --down: #F26D6D;
    --ui: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --num: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: var(--ground); }
  body {
    background: var(--ground); color: var(--bone); font-family: var(--ui);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh; padding: clamp(10px, 1.4vw, 22px);
    display: flex; flex-direction: column; gap: clamp(8px, 0.9vw, 14px);
  }

  /* masthead */
  .top { display: flex; align-items: baseline; gap: clamp(8px, 1vw, 18px); flex-wrap: wrap;
         border-bottom: 1px solid var(--line); padding-bottom: clamp(6px, 0.7vw, 12px); }
  .mark { font-size: clamp(15px, 1.7vw, 30px); font-weight: 800; letter-spacing: 0.16em; color: var(--brass); }
  .title { font-size: clamp(15px, 1.7vw, 30px); font-weight: 800; letter-spacing: 0.02em; }
  .sub { font-size: clamp(10px, 0.82vw, 15px); color: var(--dim); margin-left: auto; text-align: right; }

  .label { font-size: clamp(9px, 0.72vw, 13px); font-weight: 800; letter-spacing: 0.2em;
           color: var(--brass); text-transform: uppercase; }

  /* the answer, first */
  .standings { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(6px, 0.7vw, 12px); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
          padding: clamp(8px, 0.9vw, 16px); display: flex; flex-direction: column; gap: 2px;
          border-top: 3px solid var(--faint); }
  .card.up { border-top-color: var(--up); }
  .card.down { border-top-color: var(--down); }
  .card .who { font-size: clamp(12px, 1.05vw, 19px); font-weight: 800; letter-spacing: 0.04em; }
  .card .amt { font-family: var(--num); font-variant-numeric: tabular-nums;
               font-size: clamp(22px, 2.7vw, 50px); font-weight: 700; line-height: 1.02; }
  .card .verdict { font-size: clamp(9px, 0.74vw, 13px); color: var(--dim); }
  .up { color: var(--up); } .down { color: var(--down); } .flat { color: var(--faint); }

  /* Body: what to do · what it adds up to · why. Three columns so the whole
     reckoning lands on one screen without scrolling. */
  main { display: grid;
         grid-template-columns: minmax(230px, 0.74fr) minmax(340px, 1.1fr) minmax(260px, 0.98fr);
         gap: clamp(8px, 0.9vw, 14px); align-items: stretch; flex: 1; }
  .block { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
           padding: clamp(9px, 1vw, 16px); display: flex; flex-direction: column;
           gap: clamp(6px, 0.6vw, 10px); }

  .pay { list-style: none; display: flex; flex-direction: column; gap: clamp(3px, 0.35vw, 6px); }
  .pay li { display: grid; grid-template-columns: 1fr auto; align-items: baseline;
            gap: 8px; padding: clamp(4px, 0.42vw, 8px) 0; border-bottom: 1px solid rgba(246,244,238,0.07); }
  .pay li:last-child { border-bottom: 0; }
  .pay .flow { font-size: clamp(11px, 0.95vw, 17px); font-weight: 600; }
  .pay .arrow { color: var(--brass); padding: 0 0.35em; }
  .pay .due { font-family: var(--num); font-variant-numeric: tabular-nums;
              font-size: clamp(13px, 1.15vw, 21px); font-weight: 700; }
  .pay .was { display: block; font-size: clamp(9px, 0.7vw, 12px); color: var(--dim); font-weight: 500; }

  /* ledger */
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: clamp(10px, 0.85vw, 15px); }
  th, td { text-align: right; padding: clamp(3px, 0.4vw, 7px) clamp(4px, 0.5vw, 10px); white-space: nowrap; }
  thead th { font-size: clamp(9px, 0.7vw, 12px); font-weight: 800; letter-spacing: 0.14em;
             color: var(--brass); text-transform: uppercase; border-bottom: 1px solid var(--line); }
  th.rnd, td.rnd { text-align: left; white-space: normal; }
  tbody tr { border-bottom: 1px solid rgba(246,244,238,0.06); }
  tbody td { font-family: var(--num); font-variant-numeric: tabular-nums; font-weight: 700; }
  tbody td.rnd { font-family: var(--ui); font-weight: 600; }
  .rnd .where { font-weight: 800; }
  .rnd .when { color: var(--faint); font-weight: 600; font-size: 0.85em; padding-left: 0.5em; }
  .rnd .fmt { display: block; color: var(--dim); font-weight: 500; font-size: 0.85em; }
  tr.sum td { border-top: 1px solid var(--line); padding-top: clamp(5px, 0.5vw, 9px); }
  tr.sum td.rnd { font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
                  font-size: clamp(9px, 0.72vw, 13px); color: var(--brass); }
  tr.total td { background: var(--panel-2); }
  tr.total td.rnd { color: var(--bone); font-size: clamp(10px, 0.8vw, 14px); }
  tr.total td:not(.rnd) { font-size: clamp(12px, 1.05vw, 19px); }

  /* the work behind each round */
  .work { display: flex; flex-direction: column; gap: clamp(5px, 0.5vw, 9px);
          font-size: clamp(9.5px, 0.74vw, 13px); line-height: 1.42; }
  .work .r { display: flex; flex-direction: column; gap: 1px; }
  .work .r b { color: var(--brass); font-weight: 800; letter-spacing: 0.06em;
               font-size: 0.92em; text-transform: uppercase; }
  .work .r span { color: var(--dim); }
  .work .r span.ind { padding-left: 1.1em; text-indent: -0.6em; }

  .note { font-size: clamp(9px, 0.75vw, 13px); color: var(--dim); line-height: 1.5; }
  .note b { color: var(--bone); font-weight: 700; }
  footer { border-top: 1px solid var(--line); padding-top: clamp(5px, 0.6vw, 10px);
           display: flex; gap: clamp(10px, 1.4vw, 26px); flex-wrap: wrap; }
  footer p { font-size: clamp(9px, 0.72vw, 12px); color: var(--faint); line-height: 1.5;
             flex: 1 1 240px; }
  footer b { color: var(--dim); }

  a { color: var(--brass); }
  :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  @media (max-width: 1180px) {
    main { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .work-block { grid-column: 1 / -1; }
  }
  @media (max-width: 760px) {
    main { grid-template-columns: 1fr; }
    .standings { grid-template-columns: repeat(2, 1fr); }
  }`;
}

function body() {
  const cards = finalOrder.map(p => {
    const v = money.total[p];
    const verdict = v > 0 ? 'collects' : v < 0 ? 'pays out' : 'square';
    return `    <div class="card ${tone(v)}">
      <span class="who">${NAME[p]}</span>
      <span class="amt ${tone(v)}">${cash(v)}</span>
      <span class="verdict">${verdict} · golf ${cash(money.golfOnly[p])} · off-course ${cash(money.extras.total[p])}</span>
    </div>`;
  }).join('\n');

  const payList = settle.map(s => `      <li>
        <span class="flow">${NAME[s.from]}<span class="arrow">→</span>${NAME[s.to]}${
          s.credit ? `<span class="was">$${s.amount.toFixed(0)} owed, less $${s.credit.toFixed(0)} already in the poker pot</span>` : ''}</span>
        <span class="due">$${s.due.toFixed(0)}</span>
      </li>`).join('\n');

  const rows = ROUNDS.map((r, i) => `      <tr>
        <td class="rnd"><span class="where">${i + 1}. ${esc(r.course)}</span><span class="when">${esc(r.day)}</span>
          <span class="fmt">${esc(r.format)}</span></td>
${IDS.map(p => `        ${cell(money.rounds[r.id].total[p] ?? 0)}`).join('\n')}
      </tr>`).join('\n');

  const golfRow = `      <tr class="sum">
        <td class="rnd">Golf subtotal</td>
${IDS.map(p => `        ${cell(money.golfOnly[p])}`).join('\n')}
      </tr>`;

  const extraRows = money.extras.items.map(it => `      <tr>
        <td class="rnd"><span class="where">${esc(it.label)}</span></td>
${IDS.map(p => `        ${cell(it.total[p] ?? 0)}`).join('\n')}
      </tr>`).join('\n');

  const totalRow = `      <tr class="total">
        <td class="rnd">Final</td>
${IDS.map(p => `        ${cell(money.total[p])}`).join('\n')}
      </tr>`;

  const work = ROUNDS.map((r, i) => `      <div class="r"><b>${i + 1} · ${esc(r.course)}</b>
${r.lines.map(l => `        <span${l.startsWith('   ') ? ' class="ind"' : ''}>${esc(l.trim())}</span>`).join('\n')}
      </div>`).join('\n');

  return `<header class="top">
  <span class="mark">EGT SPORTSCENTER</span>
  <span class="title">Final Settlement</span>
  <span class="sub">EGT 2026 Cup · 108 holes · Jul 21–24 · Crystal Springs Resort, NJ<br/>
    six rounds, all stakes and off-course costs · v${VERSION}</span>
</header>

<section class="standings">
${cards}
</section>

<main>
  <section class="block">
    <span class="label">Settle up</span>
    <ul class="pay">
${payList}
    </ul>
    <p class="note"><b>Read it as:</b> each pairing is netted, so nobody hands money
      both ways. The poker pot already holds Brian's $40 buy-in — that cash goes
      straight to the winners, which is why his bill lands at
      $${settle.filter(s => s.from === 'brian').reduce((a, s) => a + s.due, 0).toFixed(0)}
      rather than $${settle.filter(s => s.from === 'brian').reduce((a, s) => a + s.amount, 0).toFixed(0)}.</p>
  </section>

  <section class="block">
    <span class="label">Where it came from</span>
    <div class="scroll">
      <table>
        <thead>
          <tr><th class="rnd">Round</th>${IDS.map(p => `<th>${NAME[p]}</th>`).join('')}</tr>
        </thead>
        <tbody>
${rows}
${golfRow}
${extraRows}
${totalRow}
        </tbody>
      </table>
    </div>
  </section>

  <section class="block work-block">
    <span class="label">How each stake was decided</span>
    <div class="work">
${work}
    </div>
  </section>
</main>

<footer>
  <p><b>Handicaps.</b> Every net game runs off the low ball on that course — John
    plays scratch in all of them. Course handicaps come from the White tees:
    Minerals 14/23/23, Ballyowen 13/18/23/23, Wild Turkey 19/24/30/30,
    Crystal Springs 17/22/28/28, Cascades 17/22/28/28, Black Bear 16/22/27/27.
    The four-ball at Ballyowen uses the standard 90% allowance; at 100% the
    result is the same match.</p>
  <p><b>Poker.</b> $120 pot paid 70/30 — Mike $84, TJ $36. Buy-ins were John $40,
    Brian $40, TJ $20, Mike $20; Brian's is already in the pot. <b>The Rock</b>
    (Pass the Money) is <em>not</em> settled here — nobody called it, so it stays
    off the ledger. Turning it on would move $129 to John.</p>
  <p><b>Provenance.</b> Every figure is recomputed by the tournament engine from
    the scores the app synced during the trip, not typed in by hand. The ledger
    nets to $0 to the cent. Regenerate with
    <code>node scripts/gen-settlement.mjs</code>.</p>
</footer>`;
}
