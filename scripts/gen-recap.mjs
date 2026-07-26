// gen-recap.mjs — the EGT 2026 Cup recap book: one standalone page per thing
// worth keeping. A page for every round (full scorecard, the games it decided,
// the pops, the points, the cash), a page for every match played, a page for
// every player, plus the standings, the awards and the money.
//
// Every figure on every page is recomputed by the tournament engine from
// fixtures/egt-2026-seed.json + fixtures/egt-2026-results.json (the scores the
// app actually synced during the trip), exactly as scripts/gen-settlement.mjs
// does — so the book can never drift from what the app and the SportsCenter
// say. Nothing here is typed in by hand.
//
// Each page is self-contained: styles inlined, no scripts, no fetches, nothing
// to load. Save one, mail one, print one — it still reads.
//
// Regenerate with:
//   node scripts/gen-recap.mjs            → writes recap/
//   node scripts/gen-recap.mjs --out=DIR  → writes somewhere else (tests)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlayPal } from '../tests/helpers/load.mjs';

// Resolve everything against the repo, not the shell's working directory, so the
// book builds identically from a script run, a test, or anywhere else.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUND_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// ── replay the trip ─────────────────────────────────────────────────────────
// The same six bridge-and-finalize steps the app performed on the trip, then
// one full engine pass with season awards on (final settlement).
function replay() {
  const SEED = JSON.parse(readFileSync(join(ROOT, 'fixtures/egt-2026-seed.json'), 'utf8'));
  const RESULTS = JSON.parse(readFileSync(join(ROOT, 'fixtures/egt-2026-results.json'), 'utf8')).rounds;
  const W = loadPlayPal();
  const model = W.EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const state = W.EgtStore.emptyState(model.trip.id);
  state.model = model;
  ROUND_IDS.forEach(rid => {
    const r = RESULTS[rid];
    W.EgtBridge.bridge(model, state, rid, {
      scores: r.scores, wolfData: r.wolfData || {}, bbbData: r.bbbData || {},
      putts: {}, firData: {}, girData: {}, extraStats: {},
    });
    state.finalized.push(rid);
  });
  const live = W.EgtEngine.liveUpdate(state, { noPersist: true, season: true });
  return { W, model, state, live };
}

// Standings as they stood after each round — "the climb". Each pass runs the
// engine over a truncated finalized list on a throwaway copy of the state, so
// the board is the real board of that night, not a subtraction.
function climbThrough(W, state) {
  return ROUND_IDS.map((rid, i) => {
    const sub = ROUND_IDS.slice(0, i + 1);
    const copy = Object.assign({}, state, {
      finalized: sub,
      events: JSON.parse(JSON.stringify(state.events)),
      snapshots: [],
    });
    const l = W.EgtEngine.liveUpdate(copy, { noPersist: true, season: i === ROUND_IDS.length - 1 });
    return { roundId: rid, night: l.night, board: l.standings };
  });
}

// ── formatting ──────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Whole dollars read cleaner, but a split bill can land on cents — show them
// when they exist rather than rounding real money away.
const plainAmt = n => Math.abs(Math.round((n || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '');
const cash = n => `${(n || 0) < 0 ? '−' : '+'}$${plainAmt(n)}`;
const tone = n => ((n || 0) > 0 ? 'up' : (n || 0) < 0 ? 'down' : 'flat');
const cashCell = n => (Math.round((n || 0) * 100) === 0 ? '<td class="flat">—</td>' : `<td class="${tone(n)}">${cash(n)}</td>`);
const ord = i => ['1st', '2nd', '3rd', '4th'][i] || `${i + 1}th`;
// "John", "John & TJ", "John, Brian & TJ" — a shared award should read like one.
const listOf = names => (names.length < 3 ? names.join(' & ')
  : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);

// Day labels and plain-English formats are board furniture, not engine output —
// the same strings the settlement board uses.
const DAY = { R1: 'Tue', R2: 'Wed AM', R3: 'Wed PM', R4: 'Thu AM', R5: 'Thu PM', R6: 'Fri' };
const FORMAT = {
  R1: 'Bingo Bango Bongo (front) + The Nines (back)',
  R2: '18-hole four-ball · John + TJ v Brian + Mike',
  R3: 'Wolf + a TJ v John $2 Nassau',
  R4: '2v2 aggregate Stableford over all 18',
  R5: 'Full-18 Bingo Bango Bongo + six-match round robin',
  R6: 'Individual Stableford + two $2 Nassaus',
};

// Which allocation the scorecard's dots and net column belong to, and how to
// say so. R5's two games are gross (BBB) or carry their own per-match pops, so
// its card is gross only.
const DOTS = {
  R1: { game: 'nines', label: 'The Nines', netHoles: [10, 18],
    note: 'Dots are the loop-2 Nines pops (9-hole handicaps, off the low ball). Loop 1 Bingo-Bango-Bongo is played gross, so the front nine carries no dots.' },
  R2: { game: 'fourBallMatch', label: 'four-ball (90%)', netHoles: [1, 18],
    note: 'Dots are the four-ball pops — 90% of the course handicap, off the low ball. Best net ball of each pair played the match.' },
  R3: { game: 'wolf', label: 'Wolf', netHoles: [1, 18],
    note: 'Dots are the Wolf pops — full course handicap off the low ball. Best net ball of each side won the hole.' },
  R4: { game: 'teamStableford', label: 'Stableford', netHoles: [1, 18],
    note: 'Dots are the Stableford pops — 100% of the course handicap off the low ball. Both partners’ net points counted every hole.' },
  R5: { game: null, label: null, netHoles: null,
    note: 'Bingo-Bango-Bongo was played gross, so the card carries no dots. Each round-robin match set its own pops off the course-handicap difference — see the match pages.' },
  R6: { game: 'stableford', label: 'Stableford', netHoles: [1, 18],
    note: 'Dots are the Stableford pops — full dots, 100% of the course handicap with no off-the-low adjustment. The singles matches used the course-handicap difference instead (see the match pages).' },
};

// Machine keys read badly on a page.
const GAME_LABELS = {
  'bingoBangoBongo+nines': 'Bingo-Bango-Bongo + The Nines',
  fourBallMatchPlay: 'Four-ball match play + Nassau',
  wolf: 'Wolf',
  fourBallAggregateStableford: 'Team Stableford (2v2)',
  'bingoBangoBongo+matchPlay': 'Bingo-Bango-Bongo + round-robin match play',
  'championshipSingles+stableford': 'Championship singles + Stableford',
};

const AWARD_META = [
  { key: 'grossBirdies', label: 'Birdie King', stat: 'most gross birdies', category: 'Birdie King (gross)', low: false },
  { key: 'pars', label: 'Par King', stat: 'most pars', category: 'Par King', low: false },
  { key: 'bogeys', label: 'Bogey God', stat: 'most bogeys', category: 'Bogey God', low: false },
  { key: 'putts', label: 'Flat Stick', stat: 'fewest putts', category: 'Flat Stick (fewest putts)', low: true },
  { key: 'ironman', label: 'Iron Man', stat: 'most fairways + greens in regulation', category: 'Iron Man (FIR+GIR)', low: false },
];

// ── page shell ──────────────────────────────────────────────────────────────
function styles() {
  return `
  /* The recap book is paper, not a TV: warm stock, deep-green ink, brass rules.
     It commits to the light world so a printed page and a phone screen show the
     same document. */
  :root {
    --paper: #FBFAF6;
    --card: #FFFFFF;
    --ink: #12241C;
    --deep: #0E2B20;
    --dim: #5B6B63;
    --faint: #93A29A;
    --line: #D8E2DB;
    --rule: #C8A15A;
    --brass: #8A6D24;
    --wash: #F1F6F2;
    --up: #137A3F;
    --down: #B3261E;
    --ui: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --num: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: var(--paper); -webkit-text-size-adjust: 100%; }
  body { background: var(--paper); color: var(--ink); font-family: var(--ui);
         -webkit-font-smoothing: antialiased; line-height: 1.5; }
  .wrap { max-width: 1060px; margin: 0 auto; padding: 20px 16px 56px; }

  /* masthead */
  .top { border-bottom: 2px solid var(--rule); padding-bottom: 10px; margin-bottom: 18px; }
  .mark { display: block; font-size: 11px; font-weight: 800; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--brass); }
  h1 { font-size: clamp(24px, 4vw, 38px); font-weight: 800; letter-spacing: -0.01em;
       line-height: 1.1; margin: 4px 0 2px; color: var(--deep); }
  .kicker { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
            color: var(--dim); }
  .sub { font-size: 13px; color: var(--dim); margin-top: 4px; }
  .crumbs { font-size: 12px; margin-bottom: 12px; color: var(--faint); }
  .crumbs a { color: var(--brass); text-decoration: none; font-weight: 700; }
  .crumbs a:hover { text-decoration: underline; }
  .crumbs span { padding: 0 6px; }

  h2 { font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
       color: var(--brass); margin: 0 0 8px; }
  h3 { font-size: 15px; font-weight: 800; color: var(--deep); margin: 0 0 4px; }
  section.block { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
                  padding: 14px 16px; margin-bottom: 14px; }
  p { font-size: 13.5px; color: var(--ink); }
  p + p { margin-top: 8px; }
  .note { font-size: 12.5px; color: var(--dim); line-height: 1.55; }
  .note b { color: var(--ink); }
  ul.plain { list-style: none; }
  ul.bul { padding-left: 18px; font-size: 13px; color: var(--ink); }
  ul.bul li { margin-bottom: 3px; }

  /* headline cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); gap: 10px; }
  .cards.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cd { background: var(--card); border: 1px solid var(--line); border-top: 3px solid var(--faint);
        border-radius: 10px; padding: 10px 12px; }
  .cd.up { border-top-color: var(--up); } .cd.down { border-top-color: var(--down); }
  .cd.win { border-top-color: var(--rule); background: var(--wash); }
  /* Cards and tiles stack their spans — each is its own line of the card. */
  .cd > span, a.tile > span { display: block; }
  .cd .who { font-size: 14px; font-weight: 800; letter-spacing: 0.03em; color: var(--deep); }
  .cd .big { font-family: var(--num); font-variant-numeric: tabular-nums; font-weight: 700;
             font-size: clamp(22px, 3.4vw, 32px); line-height: 1.05; }
  /* Match labels ("4&1", "1 up", "AS") are words, not figures — no monospace. */
  .cd .big.lbl { font-family: var(--ui); letter-spacing: -0.01em; }
  .cd .meta { font-size: 11.5px; color: var(--dim); }
  .up { color: var(--up); } .down { color: var(--down); } .flat { color: var(--faint); }

  .pill { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;
          text-transform: uppercase; padding: 2px 7px; border-radius: 999px;
          border: 1px solid var(--line); color: var(--dim); background: var(--paper); }
  .pill.gold { border-color: var(--rule); color: var(--brass); background: #FBF6EA; }
  .pill.win { border-color: var(--up); color: var(--up); background: #EEF6F0; }
  .pill.halve { border-color: var(--faint); color: var(--dim); }

  /* tables */
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { border: 1px solid var(--line); padding: 4px 7px; text-align: center; white-space: nowrap; }
  thead th { background: var(--deep); color: #fff; font-weight: 700; font-size: 11px;
             letter-spacing: 0.05em; }
  td.name, th.name { text-align: left; font-weight: 700; color: var(--deep); }
  td.txt, th.txt { text-align: left; white-space: normal; font-weight: 500; }
  /* Left-aligned header cells still live on the dark head — keep them legible. */
  thead th.name, thead th.txt { color: #fff; font-weight: 700; }
  tbody td { font-variant-numeric: tabular-nums; }
  tbody tr.lead td { background: var(--wash); }
  tbody tr.tot td { border-top: 2px solid var(--rule); font-weight: 800; }
  tr.sub td { background: var(--wash); font-weight: 700; }
  tfoot td { font-weight: 800; background: var(--wash); }
  caption { caption-side: bottom; font-size: 11.5px; color: var(--dim); text-align: left;
            padding-top: 6px; }

  /* scorecard */
  table.card { font-size: 11.5px; }
  table.card th, table.card td { padding: 3px 4px; min-width: 22px; }
  table.card tr.par td, table.card tr.si td { color: var(--dim); background: var(--paper); font-size: 10.5px; }
  /* Shaded cells: the nine subtotals on a card, and the leader's figure in any
     race or climb table. */
  td.seg, td.tot { background: var(--wash); font-weight: 800; }
  .mk { display: inline-flex; align-items: center; justify-content: center;
        min-width: 1.55em; height: 1.55em; line-height: 1; font-weight: 700; }
  .mk.cir { border: 1px solid var(--down); border-radius: 50%; }
  .mk.cir2 { border: 1px solid var(--down); border-radius: 50%; box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--down); }
  .mk.sq { border: 1px solid var(--deep); }
  .mk.sq2 { border: 1px solid var(--deep); box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--deep); }
  sup.pop { color: var(--brass); font-weight: 800; letter-spacing: -0.05em; padding-left: 1px; }
  .key { font-size: 11.5px; color: var(--dim); display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
  .key > span { display: inline-flex; align-items: center; gap: 4px; }

  /* bars (the climb, the stat races) */
  .bar { display: block; background: var(--wash); border: 1px solid var(--line); border-radius: 3px;
         height: 9px; position: relative; min-width: 60px; }
  .bar i { position: absolute; inset: 0 auto 0 0; background: var(--rule); border-radius: 2px; display: block; }
  td.barcell { width: 34%; }

  /* directory */
  .dir { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  a.tile { display: block; text-decoration: none; color: inherit; background: var(--card);
           border: 1px solid var(--line); border-left: 3px solid var(--rule); border-radius: 8px;
           padding: 9px 11px; }
  a.tile:hover { background: var(--wash); }
  a.tile .t { font-size: 13.5px; font-weight: 800; color: var(--deep); }
  a.tile .d { font-size: 11.5px; color: var(--dim); }

  a { color: var(--brass); }
  :focus-visible { outline: 2px solid var(--rule); outline-offset: 2px; border-radius: 4px; }
  footer { border-top: 1px solid var(--line); margin-top: 20px; padding-top: 10px;
           font-size: 11.5px; color: var(--faint); line-height: 1.6; }
  footer b { color: var(--dim); }
  footer code { font-family: var(--num); }

  @media (max-width: 620px) {
    .cards.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media print {
    :root { --paper: #fff; }
    .wrap { max-width: none; padding: 0; }
    .crumbs, .noprint { display: none; }
    section.block { break-inside: avoid; border-color: #ccc; }
    .sheet { break-after: page; }
    .sheet:last-child { break-after: auto; }
    thead th { background: #0E2B20 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }`;
}

// One standalone document. `depth` is how many directories deep the page sits,
// so relative links resolve from anywhere in the book.
function shell(page) {
  const up = '../'.repeat(page.depth || 0);      // to the book's root (recap/)
  const site = '../'.repeat((page.depth || 0) + 1); // to the site root (icons, app pages)
  const crumbs = page.path === 'index.html' ? '' : `<nav class="crumbs">
  <a href="${up}index.html">The 2026 Cup</a>${page.crumb ? `<span>·</span>${esc(page.crumb)}` : ''}
</nav>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="description" content="${esc(page.desc || page.title)}"/>
<meta name="theme-color" content="#FBFAF6"/>
<title>${esc(page.title)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="${site}icons/favicon-32.png"/>
<style>
${styles()}
</style>
</head>
<body>
<div class="wrap">
${crumbs}
<header class="top">
  <span class="mark">EGT 2026 Cup${page.kicker ? ` · ${esc(page.kicker)}` : ''}</span>
  <h1>${esc(page.h1)}</h1>
  ${page.sub ? `<p class="sub">${page.sub}</p>` : ''}
</header>

${page.body}

<footer>
  <p><b>EGT 2026 Cup</b> · ${esc(TRIP.venue)} · ${esc(TRIP.dates.start)} to ${esc(TRIP.dates.end)} · 108 holes.
    Every number on this page is recomputed by the tournament engine from the scores the app
    synced during the trip — not typed in by hand. Regenerate the book with
    <code>node scripts/gen-recap.mjs</code> · PlayPal v${esc(VERSION)}.</p>
</footer>
</div>
</body>
</html>
`;
}

// ── set-up ──────────────────────────────────────────────────────────────────
const { W, model, state, live } = replay();
const { EgtStandings, EgtPoints, EgtMoneySummary, EgtHandicap } = W;
const TRIP = model.trip;
const IDS = model.players.map(p => p.id);
const NAME = pid => (model.playersById[pid] || {}).name || pid;
const pts = v => EgtStandings.fmtPoints(v);
const summary = EgtMoneySummary.build(model, live);
const climb = climbThrough(W, state);

const roundOf = rid => model.rounds.find(r => r.id === rid);
const courseOf = rid => model.courses[roundOf(rid).courseId];
const holesOf = rid => courseOf(rid).holes.slice(0, 18);
const grossAt = (rid, pid, hole) => {
  const s = (state.scores[rid] || {})[pid];
  const v = s && s[hole];
  return v && (v.gross || v.gross === 0) ? v.gross : null;
};
const popsAt = (rid, pid, game, hole) => {
  const g = model.derived[rid].allocations[pid]?.games?.[game];
  return g && g.holes ? EgtHandicap.popsOnHole(g.holes, hole) : 0;
};

// Cup points earned in one round on its own, so a round page can show what that
// round paid and a player page can attribute every point to where it was won.
const roundPoints = {};
ROUND_IDS.forEach(rid => {
  roundPoints[rid] = EgtPoints.compute(model, { [rid]: live.resultsByRound[rid] }, null);
});
const awardPoints = (() => {
  const acc = {}; IDS.forEach(pid => { acc[pid] = { total: 0, breakdown: [] }; });
  EgtPoints.seasonAwards(model, live.tourneyStats, acc);
  return acc;
})();

// Self-check: the parts must add up to the whole the engine published, or one of
// these pages is lying. Fail the build rather than print a wrong book.
IDS.forEach(pid => {
  const parts = ROUND_IDS.reduce((a, rid) => a + roundPoints[rid][pid].total, 0) + awardPoints[pid].total;
  const whole = live.points[pid].total;
  if (Math.abs(parts - whole) > 1e-9) {
    throw new Error(`points attribution mismatch for ${pid}: parts ${parts} vs engine ${whole}`);
  }
});
if (!live.money.netsToZero) throw new Error('money does not net to zero — refusing to publish the book');

// ── the matches ─────────────────────────────────────────────────────────────
// One uniform record per match played on the trip, whatever engine produced it:
// R2's four-ball, R3's side Nassau, R5's six round-robin matches, and R6's two
// seeded singles (whose Nassau side bet rode the same 18 holes).
function matchMoneyLines(rid, label) {
  const bd = live.money.rounds[rid].breakdown || {};
  const prefix = `Match ${label} `;
  const out = [];
  IDS.forEach(pid => {
    (bd[pid] || []).forEach(li => {
      if (li.label.startsWith(prefix)) out.push({ pid, seg: li.label.slice(prefix.length), amount: li.amount });
    });
  });
  return out;
}
const overlayLabel = m => m.sides.map(s => s.map(pid => pid.slice(0, 2)).join('+')).join(' v ');

// The money engine names a side match by two-letter ids ("Match tj v jo front")
// — right for a ledger key, wrong on a page someone keeps. Rewrite those keys to
// full names, per round, leaving every other line item alone.
const prettyMoneyLabel = (() => {
  const map = {};
  ROUND_IDS.forEach(rid => {
    map[rid] = {};
    ((live.resultsByRound[rid] || {}).overlayMatchPlay?.matches || []).forEach(m => {
      const short = overlayLabel(m);
      const who = m.sides.map(s => s.map(NAME).join(' + ')).join(' v ');
      [['front', 'front nine'], ['back', 'back nine'], ['overall', 'the 18']].forEach(([seg, words]) => {
        map[rid][`Match ${short} ${seg}`] = `${who} — ${words}`;
      });
    });
  });
  return (rid, label) => (map[rid] && map[rid][label]) || label;
})();

function collectMatches() {
  const out = [];

  // R2 — the four-ball. One match, three segments, both partners' best net ball.
  const fb = live.resultsByRound.R2.fourBall;
  out.push({
    slug: 'r2-four-ball', roundId: 'R2', kind: '2v2',
    title: `${fb.teams[0].players.map(NAME).join(' + ')} v ${fb.teams[1].players.map(NAME).join(' + ')}`,
    blurb: 'Four-ball match play at Ballyowen — the Cup’s first team round',
    sides: [
      { label: fb.teams[0].players.map(NAME).join(' + '), players: fb.teams[0].players, name: fb.teams[0].name },
      { label: fb.teams[1].players.map(NAME).join(' + '), players: fb.teams[1].players, name: fb.teams[1].name },
    ],
    segs: { front: fb.segments.front, back: fb.segments.back, overall: fb.segments.overall },
    popGame: 'fourBallMatch', stake: null,
    stakeNote: `Flat $${model.moneyDefaults.fourballWinner} a man to the winning pair — no Nassau segments on the cash.`,
    moneyLines: null, moneyLabel: 'Four-ball (team)',
    pointsNote: 'Front, back and 18-hole matches each paid Cup points to both players on the winning side.',
  });

  // R3 / R5 / R6 — the configured 1v1 overlay matches, exactly as the engine
  // settled them. R6's two overlays share their 18 holes with the seeded
  // singles, so those are folded into the singles pages below instead.
  ['R3', 'R5'].forEach(rid => {
    (live.resultsByRound[rid].overlayMatchPlay.matches || []).forEach(m => {
      const a = m.sides[0][0], b = m.sides[1][0];
      out.push({
        slug: m.id.replace(/^egt-/, ''), roundId: rid, kind: '1v1',
        title: `${NAME(a)} v ${NAME(b)}`,
        blurb: rid === 'R3'
          ? 'A $2 Nassau riding alongside Wolf at Wild Turkey'
          : 'Round-robin match play at Cascades',
        sides: [{ label: NAME(a), players: [a] }, { label: NAME(b), players: [b] }],
        segs: { front: m.front, back: m.back, overall: m.overall },
        popGame: null, popFlags: m.popFlags, stake: m.stakes,
        stakeNote: `$${m.stakes} Nassau — $${m.stakes} front, $${m.stakes} back, $${m.stakes * 2} on the 18.`,
        moneyLines: matchMoneyLines(rid, overlayLabel(m)),
        pointsNote: rid === 'R5'
          ? 'The round robin decided R5’s match-play champion — 2 Cup points to the best record over the six matches.'
          : 'A side bet: cash only, no Cup points.',
      });
    });
  });

  // R6 — the two seeded singles. The Cup match is the singles; the money came
  // from the $2 Nassau on the same card.
  const singles = live.resultsByRound.R6.singles.results;
  singles.forEach(s => {
    const overlay = (live.resultsByRound.R6.overlayMatchPlay.matches || [])
      .find(m => [m.sides[0][0], m.sides[1][0]].sort().join() === [s.a, s.b].sort().join());
    out.push({
      slug: `r6-${(s.tier || 'singles').toLowerCase()}-${s.a}-${s.b}`, roundId: 'R6', kind: '1v1',
      title: `${NAME(s.a)} v ${NAME(s.b)}`,
      blurb: `${s.tier} singles at Black Bear — championship night`,
      sides: [{ label: NAME(s.a), players: [s.a] }, { label: NAME(s.b), players: [s.b] }],
      segs: { front: s.front, back: s.back, overall: s.match },
      popGame: null, popFlags: null, stake: overlay ? overlay.stakes : null,
      tier: s.tier, singles: s,
      stakeNote: overlay
        ? `Seeded ${s.tier.toLowerCase()} match. The cash was the $${overlay.stakes} Nassau on the same card — $${overlay.stakes} front, $${overlay.stakes} back, $${overlay.stakes * 2} on the 18.`
        : `Seeded ${s.tier.toLowerCase()} match — Cup points only.`,
      moneyLines: overlay ? matchMoneyLines('R6', overlayLabel(overlay)) : [],
      pointsNote: `${model.pointsConfig.R6.singlesWin} Cup points for the win, ${model.pointsConfig.R6.singlesHalve} each for a halve.`,
      popNote: `${NAME(s.receives)} received the ${s.diff}-stroke course-handicap difference (${NAME(s.a)} ${s.chA} · ${NAME(s.b)} ${s.chB}) on the lowest-index holes.`,
    });
  });

  return out;
}
const MATCHES = collectMatches();
const matchesOf = rid => MATCHES.filter(m => m.roundId === rid);
const matchPath = m => `matches/${m.slug}.html`;

// ── shared components ───────────────────────────────────────────────────────

// A full 18-hole scorecard: par, stroke index, then every player's gross with
// pop dots and score-to-par marks, OUT / IN / TOT and the round's net total.
function scorecard(rid) {
  const round = roundOf(rid);
  const course = courseOf(rid);
  const holes = holesOf(rid);
  const dots = DOTS[rid];
  const front = holes.filter(h => h.hole <= 9);
  const back = holes.filter(h => h.hole > 9);
  const sumPar = hs => hs.reduce((a, h) => a + h.par, 0);

  const mark = (gross, par) => {
    const d = gross - par;
    const cls = d <= -2 ? 'cir2' : d === -1 ? 'cir' : d === 1 ? 'sq' : d >= 2 ? 'sq2' : '';
    return `<span class="mk ${cls}">${gross}</span>`;
  };

  const head = `<tr><th class="name">Hole</th>${front.map(h => `<th>${h.hole}</th>`).join('')}<th>Out</th>${back.map(h => `<th>${h.hole}</th>`).join('')}<th>In</th><th>Tot</th>${dots.game ? '<th>Net</th>' : ''}</tr>`;
  const parRow = `<tr class="par"><td class="name">Par</td>${front.map(h => `<td>${h.par}</td>`).join('')}<td class="seg">${sumPar(front)}</td>${back.map(h => `<td>${h.par}</td>`).join('')}<td class="seg">${sumPar(back)}</td><td class="tot">${sumPar(holes)}</td>${dots.game ? '<td></td>' : ''}</tr>`;
  const siRow = `<tr class="si"><td class="name">SI</td>${front.map(h => `<td>${h.si == null ? '—' : h.si}</td>`).join('')}<td class="seg"></td>${back.map(h => `<td>${h.si == null ? '—' : h.si}</td>`).join('')}<td class="seg"></td><td class="tot"></td>${dots.game ? '<td></td>' : ''}</tr>`;

  const rows = round.players.map(pid => {
    const cell = h => {
      const g = grossAt(rid, pid, h.hole);
      if (g == null) return '<td>·</td>';
      const pop = dots.game ? popsAt(rid, pid, dots.game, h.hole) : 0;
      return `<td>${mark(g, h.par)}${pop ? `<sup class="pop">${'•'.repeat(pop)}</sup>` : ''}</td>`;
    };
    const sum = hs => hs.reduce((a, h) => a + (grossAt(rid, pid, h.hole) || 0), 0);
    let netCell = '';
    if (dots.game) {
      const [lo, hi] = dots.netHoles;
      const scope = holes.filter(h => h.hole >= lo && h.hole <= hi);
      const gr = scope.reduce((a, h) => a + (grossAt(rid, pid, h.hole) || 0), 0);
      const pp = scope.reduce((a, h) => a + popsAt(rid, pid, dots.game, h.hole), 0);
      netCell = `<td class="tot">${gr - pp}</td>`;
    }
    return `<tr><td class="name">${esc(NAME(pid))}</td>${front.map(cell).join('')}<td class="seg">${sum(front)}</td>${back.map(cell).join('')}<td class="seg">${sum(back)}</td><td class="tot">${sum(holes)}</td>${netCell}</tr>`;
  }).join('\n');

  const netHead = dots.game
    ? `Net = ${dots.netHoles[0] === 10 ? 'back nine ' : ''}gross less ${esc(dots.label)} pops.`
    : '';
  return `<div class="scroll"><table class="card">
  <thead>${head}${parRow}${siRow}</thead>
  <tbody>
${rows}
  </tbody>
  <caption>${esc(course.name)} · ${esc(round.playedTee)} tees · par ${course.par}${course.holesCount === 9 ? ` (a par-${sumPar(front)} nine played twice)` : ''}. ${netHead}</caption>
</table></div>
<p class="key"><span><span class="mk cir2">4</span> eagle or better</span><span><span class="mk cir">3</span> birdie</span><span>5 par</span><span><span class="mk sq">6</span> bogey</span><span><span class="mk sq2">7</span> double or worse</span><span><sup class="pop">•</sup> a pop on that hole</span></p>
<p class="note">${dots.note}</p>`;
}

// Course handicaps and every pop the round handed out, per game, with its basis.
function popsPanel(rid) {
  const round = roundOf(rid);
  const alloc = model.derived[rid].allocations;
  const games = Object.keys(alloc[round.players[0]].games);
  const rows = round.players.map(pid => {
    const a = alloc[pid];
    const cells = games.map(g => {
      const gm = a.games[g];
      const holes = (gm.holes || []).map(h => h.hole + (h.strokes > 1 ? `×${h.strokes}` : '')).join(', ');
      return `<td class="txt">${gm.strokes} ${gm.strokes === 1 ? 'pop' : 'pops'}${holes ? ` <span class="note">on ${esc(holes)}</span>` : ''}</td>`;
    }).join('');
    return `<tr><td class="name">${esc(NAME(pid))}</td><td>${a.courseHandicap}</td>${cells}</tr>`;
  }).join('\n');
  const bases = games.map(g => `<b>${esc(g)}</b> — ${esc(alloc[round.players[0]].games[g].basis)}`).join('; ');
  return `<div class="scroll"><table>
  <thead><tr><th class="name">Player</th><th>CH</th>${games.map(g => `<th>${esc(g)}</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>
<p class="note" style="margin-top:6px">Handicap index → course handicap at ${esc(courseOf(rid).name)} (${esc(roundOf(rid).playedTee)} tees), then pops distributed by stroke index. Bases: ${bases}.</p>`;
}

// The round's cash: every engine line item as a player-by-player matrix, then
// who handed what to whom.
function moneyPanel(rid) {
  const m = live.money.rounds[rid];
  const round = roundOf(rid);
  const labels = [];
  round.players.forEach(pid => (m.breakdown[pid] || []).forEach(li => {
    if (!labels.includes(li.label)) labels.push(li.label);
  }));
  const amountOf = (pid, label) => {
    const li = (m.breakdown[pid] || []).find(x => x.label === label);
    return li ? li.amount : 0;
  };
  const rows = labels.map(label => `<tr><td class="txt">${esc(prettyMoneyLabel(rid, label))}</td>${round.players.map(pid => cashCell(amountOf(pid, label))).join('')}</tr>`).join('\n');
  const totalRow = `<tr class="tot"><td class="txt">Round total</td>${round.players.map(pid => cashCell(m.total[pid])).join('')}</tr>`;
  const settle = m.settlements.length
    ? `<ul class="bul">${m.settlements.map(s => `<li>${esc(NAME(s.from))} → ${esc(NAME(s.to))} <b>$${plainAmt(s.amount)}</b></li>`).join('')}</ul>`
    : '<p class="note">Nothing changed hands — every game was halved or split.</p>';
  return `<div class="scroll"><table>
  <thead><tr><th class="txt">Stake</th>${round.players.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}</tr></thead>
  <tbody>
${rows || '<tr><td class="txt" colspan="' + (round.players.length + 1) + '">No money on this round.</td></tr>'}
${totalRow}
  </tbody>
  <caption>Nets to $0${m.netsToZero ? '' : ' (out of balance!)'} — a flat stake to the winner of each game, plus any side Nassau at its own stake.</caption>
</table></div>
<h3 style="margin-top:12px">Netted for the night</h3>
${settle}`;
}

// What the round paid in Cup points — the offer, then who collected.
function pointsPanel(rid) {
  const bd = EgtPoints.roundPointsBreakdown(model, rid);
  const earned = roundPoints[rid];
  const offer = bd.items.length
    ? `<div class="scroll"><table>
  <thead><tr><th class="txt">On offer</th><th>Points</th></tr></thead>
  <tbody>${bd.items.map(it => `<tr><td class="txt">${esc(it.label)}</td><td>${pts(it.pts)}</td></tr>`).join('')}
  <tr class="tot"><td class="txt">Most one player could take</td><td>${pts(bd.max)}</td></tr></tbody>
</table></div>`
    : '';
  const collected = roundOf(rid).players
    .map(pid => ({ pid, e: earned[pid] }))
    .sort((a, b) => b.e.total - a.e.total);
  const table = bd.mode === 'none'
    ? ''
    : `<div class="scroll"><table>
  <thead><tr><th class="name">Player</th><th class="txt">Earned</th><th>Points</th></tr></thead>
  <tbody>${collected.map(({ pid, e }) => `<tr${e.total > 0 && e.total === collected[0].e.total ? ' class="lead"' : ''}><td class="name">${esc(NAME(pid))}</td><td class="txt">${e.breakdown.length ? e.breakdown.map(b => `${esc(b.category)} ${pts(b.points)}`).join(' · ') : '<span class="note">nothing</span>'}</td><td>${pts(e.total)}</td></tr>`).join('')}</tbody>
</table></div>`;
  return `${offer}${table ? `<h3 style="margin-top:12px">Who collected</h3>${table}` : ''}
<p class="note" style="margin-top:8px">${esc(bd.note)}</p>`;
}

// Hole-by-hole match progression. `a`/`b` on each row are the side's best NET
// ball (the number the match was actually played on); the gross is shown beside
// it so the card and the match agree.
function matchProgress(m, seg, holes) {
  const rid = m.roundId;
  const netOf = (side, row) => (side === 0 ? row.a : row.b);
  const grossOf = side => hole => {
    const vals = m.sides[side].players.map(pid => grossAt(rid, pid, hole)).filter(v => v != null);
    return vals.length ? Math.min(...vals) : null;
  };
  const parAt = hole => (holes.find(h => h.hole === hole) || {}).par;
  const rows = seg.perHole.map(row => {
    const g0 = grossOf(0)(row.hole), g1 = grossOf(1)(row.hole);
    const w = row.winner === 'A' ? m.sides[0].label : row.winner === 'B' ? m.sides[1].label : 'halved';
    const running = row.up === 0 ? 'AS' : `${Math.abs(row.up)} up ${row.up > 0 ? m.sides[0].label : m.sides[1].label}`;
    const cell = (net, gross) => `<td>${net == null ? '·' : net}${gross != null && gross !== net ? ` <span class="note">(${gross})</span>` : ''}</td>`;
    return `<tr${row.winner !== 'halve' ? ' class="lead"' : ''}><td>${row.hole}</td><td>${parAt(row.hole)}</td>${cell(netOf(0, row), g0)}${cell(netOf(1, row), g1)}<td class="txt">${esc(w)}</td><td class="txt">${esc(running)}</td></tr>`;
  }).join('\n');
  return `<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th><th>${esc(m.sides[0].label)}</th><th>${esc(m.sides[1].label)}</th><th class="txt">Won by</th><th class="txt">Match stood</th></tr></thead>
  <tbody>
${rows}
  </tbody>
  <caption>Best net ball per side; the gross is in brackets where a pop applied. ${seg.decidedAt ? `Closed out on hole ${seg.decidedAt}.` : 'Went the distance.'}</caption>
</table></div>`;
}

function segCards(m) {
  const stakeUnits = { front: 1, back: 1, overall: 2 };
  return `<div class="cards">${['front', 'back', 'overall'].map(k => {
    const s = m.segs[k];
    const winLabel = s.winner === 'halve' ? 'Halved' : s.winner === 'A' ? m.sides[0].label : m.sides[1].label;
    const cls = s.winner === 'halve' ? '' : 'win';
    const cashNote = m.stake ? `$${m.stake * stakeUnits[k]} on the line` : '';
    return `<div class="cd ${cls}">
    <span class="meta">${k === 'overall' ? 'The 18' : `${k === 'front' ? 'Front' : 'Back'} nine`}</span>
    <span class="big lbl">${esc(s.label)}</span>
    <span class="who">${esc(winLabel)}</span>
    ${cashNote ? `<span class="meta">${cashNote}</span>` : ''}
  </div>`;
  }).join('\n')}</div>`;
}

// ── round pages ─────────────────────────────────────────────────────────────
function roundBody(rid) {
  const round = roundOf(rid);
  const course = courseOf(rid);
  const res = live.resultsByRound[rid];
  const parts = [];

  // What happened, in one strip.
  const headline = titlesFor(rid);
  parts.push(`<section class="block">
  <h2>The round</h2>
  <div class="cards">
    <div class="cd"><span class="meta">Course</span><span class="who">${esc(course.name)}</span><span class="meta">${esc(course.location)} · ${esc(round.playedTee)} tees · par ${course.par}</span></div>
    <div class="cd"><span class="meta">Played</span><span class="who">${esc(round.date)}</span><span class="meta">${esc(round.teeTimeTarget)}</span></div>
    <div class="cd"><span class="meta">Format</span><span class="who">${esc(GAME_LABELS[round.primaryGame] || round.primaryGame)}</span><span class="meta">${esc(FORMAT[rid])}</span></div>
    <div class="cd"><span class="meta">Field</span><span class="who">${round.players.map(NAME).map(esc).join(' · ')}</span><span class="meta">${round.teams.length ? round.teams.map(t => t.players.map(NAME).join(' + ')).join(' v ') : 'Individual'}</span></div>
  </div>
  ${headline.length ? `<h3 style="margin-top:12px">Won on the day</h3><ul class="bul">${headline.map(t => `<li>${titleLine(t)}</li>`).join('')}</ul>` : ''}
</section>`);

  parts.push(`<section class="block"><h2>The card</h2>
${scorecard(rid)}</section>`);

  // The games, in the order they were played.
  parts.push(...gameSections(rid, res));

  parts.push(`<section class="block"><h2>Cup points</h2>
${pointsPanel(rid)}</section>`);

  parts.push(`<section class="block"><h2>The money</h2>
${moneyPanel(rid)}</section>`);

  const ms = matchesOf(rid);
  if (ms.length) {
    parts.push(`<section class="block"><h2>Matches on this card</h2>
<div class="dir">${ms.map(m => `<a class="tile" href="../${matchPath(m)}"><span class="t">${esc(m.title)}</span><span class="d">${esc(m.segs.overall.winner === 'halve' ? 'Halved' : `${m.segs.overall.winner === 'A' ? m.sides[0].label : m.sides[1].label} ${m.segs.overall.label}`)}</span></a>`).join('\n')}</div></section>`);
  }

  parts.push(`<section class="block"><h2>Handicaps and pops</h2>
${popsPanel(rid)}</section>`);

  parts.push(`<section class="block"><h2>Carts and pairings</h2>
<p><b>${round.pairings.carts.map(c => c.map(NAME).join(' + ')).join(' · ')}</b></p>
<p class="note">${esc(round.pairings.rationale)}</p></section>`);

  return parts.join('\n\n');
}

// Per-round game detail — one section per calculator that ran.
function gameSections(rid, res) {
  const out = [];
  const holes = holesOf(rid);
  const parAt = hole => (holes.find(h => h.hole === hole) || {}).par;

  if (res.bbb) {
    const ph = res.bbb.perHole;
    const players = roundOf(rid).players;
    const rows = ph.map(h => `<tr><td>${h.hole}</td><td>${parAt(h.hole)}</td>${['bingo', 'bango', 'bongo'].map(k => {
      const a = h.awards.find(x => x.type === k);
      return `<td>${a ? esc(NAME(a.player)) : '—'}</td>`;
    }).join('')}</tr>`).join('\n');
    const tot = players.map(pid => `<tr${res.bbb.champions.includes(pid) ? ' class="lead"' : ''}><td class="name">${esc(NAME(pid))}</td><td>${res.bbb.totals[pid]}</td></tr>`).join('');
    out.push(`<section class="block"><h2>Bingo Bango Bongo${rid === 'R1' ? ' · loop 1 (holes 1–9)' : ' · all 18'}</h2>
<p class="note">Three points a hole, awarded gross: <b>bingo</b> first ball on the green, <b>bango</b> closest once everyone is on, <b>bongo</b> first in the hole. Nothing about it is derivable from a score — every award below is what was called on the tee box.</p>
<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th><th>Bingo</th><th>Bango</th><th>Bongo</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>
<h3 style="margin-top:12px">Points</h3>
<div class="scroll"><table><thead><tr><th class="name">Player</th><th>BBB points</th></tr></thead><tbody>${tot}</tbody>
<caption>Champion: ${esc(res.bbb.champions.map(NAME).join(' & ') || 'none')}.</caption></table></div>
</section>`);
  }

  if (res.nines) {
    const players = roundOf(rid).players;
    const rows = res.nines.perHole.map(h => `<tr><td>${h.hole}</td><td>${parAt(h.hole)}</td>${players.map(pid => {
      const g = grossAt(rid, pid, h.hole), p = popsAt(rid, pid, 'nines', h.hole);
      return `<td>${g == null ? '·' : `${g - p}${p ? `<sup class="pop">${'•'.repeat(p)}</sup>` : ''}`}</td>`;
    }).join('')}${players.map(pid => `<td class="seg">${h.points[pid] == null ? '·' : h.points[pid]}</td>`).join('')}</tr>`).join('\n');
    const tot = players.map(pid => `<tr${res.nines.champions.includes(pid) ? ' class="lead"' : ''}><td class="name">${esc(NAME(pid))}</td><td>${res.nines.totals[pid]}</td></tr>`).join('');
    out.push(`<section class="block"><h2>The Nines · loop 2 (holes 10–18)</h2>
<p class="note">Nine points a hole split three ways by <b>net</b> score — 5 to the low ball, 3, then 1. Ties pool their slots and share evenly, so a two-way tie for low takes 4 and 4. Pops come off the 9-hole handicaps for the loop.</p>
<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th>${players.map(pid => `<th>${esc(NAME(pid))} net</th>`).join('')}${players.map(pid => `<th>${esc(NAME(pid))} pts</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>
<h3 style="margin-top:12px">Points</h3>
<div class="scroll"><table><thead><tr><th class="name">Player</th><th>Nines points</th></tr></thead><tbody>${tot}</tbody>
<caption>Champion: ${esc(res.nines.champions.map(NAME).join(' & ') || 'none')}.</caption></table></div>
</section>`);
  }

  if (res.fourBall) {
    const m = MATCHES.find(x => x.slug === 'r2-four-ball');
    out.push(`<section class="block"><h2>Four-ball match play</h2>
${segCards(m)}
<p class="note" style="margin-top:10px">Each pair played its best net ball. Front, back and the 18 settled separately for Cup points; the cash was one flat stake on the overall result. Full hole-by-hole on the <a href="../${matchPath(m)}">match page</a>.</p>
</section>`);
  }

  if (res.wolf) {
    const cfg = model.formatConfigs[rid];
    const players = roundOf(rid).players;
    const rows = res.wolf.perHole.map(h => `<tr><td>${h.hole}</td><td>${parAt(h.hole)}</td><td class="txt">${esc(NAME(h.wolf))}</td><td class="txt">${h.mode === 'pair' ? `paired ${esc(NAME(h.partner))}` : h.mode === 'lone' ? 'lone wolf' : 'blind wolf'}</td><td>${h.wNet == null ? '·' : h.wNet}</td><td>${h.oNet == null ? '·' : h.oNet}</td><td class="txt">${h.outcome === 'wolf' ? 'Wolf side' : h.outcome === 'opponents' ? 'The pack' : 'push'}</td>${players.map(pid => {
      const d = h.delta[pid];
      return `<td class="${tone(d)}">${!d ? '—' : (d > 0 ? `+${d}` : d)}</td>`;
    }).join('')}</tr>`).join('\n');
    const tot = res.wolf.ranked.map((r, i) => `<tr${i === 0 ? ' class="lead"' : ''}><td>${ord(i)}</td><td class="name">${esc(NAME(r.player))}</td><td class="${tone(r.units)}">${r.units > 0 ? `+${r.units}` : r.units}</td><td>${pts(roundPoints[rid][r.player].total)}</td></tr>`).join('');
    out.push(`<section class="block"><h2>Wolf</h2>
<p class="note">The Wolf rotated ${esc(cfg.order.map(NAME).join(' → '))}. Partner up for ±${cfg.units.pack2v2} a head, go alone for ±${cfg.units.loneWolf}, call it blind before anyone tees for ±${cfg.units.blindWolf}. Best net ball per side, ties push. ${esc(cfg.holes17_18)}.</p>
<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th><th class="txt">Wolf</th><th class="txt">Choice</th><th>Wolf net</th><th>Pack net</th><th class="txt">Won by</th>${players.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  </tbody>
  <caption>The last four columns are the units that changed hands on the hole.</caption>
</table></div>
<h3 style="margin-top:12px">Final units</h3>
<div class="scroll"><table><thead><tr><th>Pos</th><th class="name">Player</th><th>Units</th><th>Cup points</th></tr></thead><tbody>${tot}</tbody>
<caption>The Wolf-units finish paid every position (${model.pointsConfig.R3.wolfFinish.join(' / ')}); the cash was a flat $${model.moneyDefaults.wolfWinner} a man to the leader, not per unit.</caption></table></div>
</section>`);
  }

  if (res.teamStableford) {
    const ts = res.teamStableford;
    const players = roundOf(rid).players;
    const rows = ts.perHole.map(h => `<tr><td>${h.hole}</td><td>${h.par}</td>${players.map(pid => `<td>${h.byPlayer[pid] == null ? '·' : h.byPlayer[pid]}</td>`).join('')}${ts.teams.map(t => `<td class="seg">${h.byTeam[t.name]}</td>`).join('')}</tr>`).join('\n');
    const segRows = ts.segments.map(s => `<tr><td class="txt">Holes ${s.range[0]}–${s.range[1]}</td>${ts.teams.map(t => `<td>${s[t.name]}</td>`).join('')}<td class="txt">${s.winner === 'halve' ? 'Halved' : esc(teamLabel(rid, s.winner))}</td></tr>`).join('');
    out.push(`<section class="block"><h2>Aggregate team Stableford</h2>
<p class="note">Both partners' net points counted on every hole — net eagle 4, birdie 3, par 2, bogey 1, net double or worse 0, pick up at net double. Three six-hole segment matches plus the 18-hole total.</p>
<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th>${players.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}${ts.teams.map(t => `<th>${esc(t.players.map(NAME).join('+'))}</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  <tr class="tot"><td class="txt" colspan="2">Total</td>${players.map(pid => `<td>${ts.playerPoints[pid]}</td>`).join('')}${ts.teams.map(t => `<td>${ts.teamTotals[t.name]}</td>`).join('')}</tr>
  </tbody>
</table></div>
<h3 style="margin-top:12px">Segments</h3>
<div class="scroll"><table>
  <thead><tr><th class="txt">Segment</th>${ts.teams.map(t => `<th>${esc(t.players.map(NAME).join('+'))}</th>`).join('')}<th class="txt">Winner</th></tr></thead>
  <tbody>${segRows}
  <tr class="tot"><td class="txt">All 18</td>${ts.teams.map(t => `<td>${ts.teamTotals[t.name]}</td>`).join('')}<td class="txt">${ts.overallWinner === 'halve' ? 'Halved' : esc(teamLabel(rid, ts.overallWinner))}</td></tr></tbody>
  <caption>Each segment paid ${model.pointsConfig.R4.segmentWin} Cup point to both players on the winning side; the 18-hole total paid ${model.pointsConfig.R4.overall18}. Cash was one flat $${model.moneyDefaults.teamStablefordWinner} a man on the overall.</caption>
</table></div>
</section>`);
  }

  if (rid === 'R5' && res.matchPlay) {
    const mp = res.matchPlay;
    const rows = mp.ranked.map((r, i) => `<tr${mp.champions.includes(r.player) ? ' class="lead"' : ''}><td>${ord(i)}</td><td class="name">${esc(NAME(r.player))}</td><td>${mp.record[r.player].w}–${mp.record[r.player].l}–${mp.record[r.player].h}</td><td>${pts(r.points)}</td></tr>`).join('');
    const cards = matchesOf('R5').map(m => `<a class="tile" href="../${matchPath(m)}"><span class="t">${esc(m.title)}</span><span class="d">${esc(m.segs.overall.winner === 'halve' ? 'Halved (AS)' : `${m.segs.overall.winner === 'A' ? m.sides[0].label : m.sides[1].label} ${m.segs.overall.label}`)}</span></a>`).join('\n');
    out.push(`<section class="block"><h2>Round-robin match play</h2>
<p class="note">All six 1v1 matches at once — everybody played everybody. Pops in each match came off the course-handicap difference between the two of them, on the lowest-index holes. Each match settled Nassau style: front, back, and double on the 18.</p>
<div class="dir">${cards}</div>
<h3 style="margin-top:12px">Records</h3>
<div class="scroll"><table><thead><tr><th>Pos</th><th class="name">Player</th><th>W–L–H</th><th>Match score</th></tr></thead><tbody>${rows}</tbody>
<caption>Halves count a half. Best record took the ${model.pointsConfig.R5.matchPlayChampion}-point match-play title: ${esc(mp.champions.map(NAME).join(' & ') || 'nobody')}.</caption></table></div>
</section>`);
  }

  if (res.singles) {
    const cards = matchesOf('R6').map(m => `<a class="tile" href="../${matchPath(m)}"><span class="t">${esc(m.tier)} · ${esc(m.title)}</span><span class="d">${esc(m.singles.winner === 'halve' ? 'Halved (AS)' : `${NAME(m.singles.winner)} ${m.segs.overall.label}`)}</span></a>`).join('\n');
    out.push(`<section class="block"><h2>Championship singles</h2>
<p class="note">Seeded off the Cup standings through R5 — 1 v 2 for the Cup, 3 v 4 for bronze. The higher course handicap received the difference on the lowest-index holes; ${model.pointsConfig.R6.singlesWin} points for the win, ${model.pointsConfig.R6.singlesHalve} each for a halve.</p>
<div class="dir">${cards}</div>
<div class="scroll" style="margin-top:12px"><table>
  <thead><tr><th class="txt">Match</th><th class="txt">Tier</th><th>Handicaps</th><th class="txt">Strokes</th><th class="txt">Result</th></tr></thead>
  <tbody>${res.singles.results.map(s => `<tr><td class="txt">${esc(NAME(s.a))} v ${esc(NAME(s.b))}</td><td class="txt">${esc(s.tier)}</td><td>${s.chA} v ${s.chB}</td><td class="txt">${s.diff ? `${esc(NAME(s.receives))} +${s.diff}` : 'level'}</td><td class="txt">${s.winner === 'halve' ? 'Halved (AS)' : `${esc(NAME(s.winner))} ${esc(s.match.label)}`}</td></tr>`).join('')}</tbody>
</table></div>
</section>`);
  }

  if (res.stableford) {
    const players = roundOf(rid).players;
    const st = res.stableford;
    const rows = st.perHole.map(h => `<tr><td>${h.hole}</td><td>${h.par}</td>${players.map(pid => {
      const g = grossAt(rid, pid, h.hole), p = popsAt(rid, pid, 'stableford', h.hole);
      return `<td>${g == null ? '·' : `${g - p}${p ? `<sup class="pop">${'•'.repeat(p)}</sup>` : ''}`}</td>`;
    }).join('')}${players.map(pid => `<td class="seg">${h.points[pid] == null ? '·' : h.points[pid]}</td>`).join('')}</tr>`).join('\n');
    const tot = st.ranked.map((r, i) => `<tr${i === 0 ? ' class="lead"' : ''}><td>${ord(i)}</td><td class="name">${esc(NAME(r.player))}</td><td>${r.points}</td><td>${pts(EgtPoints.rankedFinishPoints(st.ranked.map(x => ({ player: x.player, value: x.points })), model.pointsConfig.R6.stablefordFinish)[r.player])}</td></tr>`).join('');
    out.push(`<section class="block"><h2>Individual Stableford</h2>
<p class="note">Full dots — every player's whole course handicap, no off-the-low adjustment. Net eagle 4, birdie 3, par 2, bogey 1, net double or worse 0.</p>
<div class="scroll"><table>
  <thead><tr><th>Hole</th><th>Par</th>${players.map(pid => `<th>${esc(NAME(pid))} net</th>`).join('')}${players.map(pid => `<th>${esc(NAME(pid))} pts</th>`).join('')}</tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>
<h3 style="margin-top:12px">Finish</h3>
<div class="scroll"><table><thead><tr><th>Pos</th><th class="name">Player</th><th>Stableford</th><th>Cup points</th></tr></thead><tbody>${tot}</tbody>
<caption>Every position paid (${model.pointsConfig.R6.stablefordFinish.join(' / ')}); ties pool and split. The medal also took a flat $${model.moneyDefaults.stablefordWinner} a man.</caption></table></div>
</section>`);
  }

  return out;
}

const teamLabel = (rid, teamName) => {
  const t = (roundOf(rid).teams || []).find(x => x.name === teamName);
  return t ? t.players.map(NAME).join(' + ') : teamName;
};

// Every title a round handed out, read off the calculators.
function titlesFor(rid) {
  const res = live.resultsByRound[rid];
  const out = [];
  if (rid === 'R1') {
    out.push({ title: 'Bingo Bango Bongo', winners: res.bbb.champions, detail: `${res.bbb.totals[res.bbb.champions[0]]} points` });
    out.push({ title: 'The Nines', winners: res.nines.champions, detail: `${res.nines.totals[res.nines.champions[0]]} points` });
  }
  if (rid === 'R2') {
    const seg = res.fourBall.segments;
    ['front', 'back', 'overall'].forEach(k => {
      const s = seg[k];
      out.push({
        title: k === 'overall' ? 'The 18-hole match' : `The ${k} nine`,
        winners: s.winnerTeam === 'halve' ? [] : (roundOf(rid).teams.find(t => t.name === s.winnerTeam) || {}).players || [],
        detail: s.winnerTeam === 'halve' ? 'halved' : s.label,
      });
    });
  }
  if (rid === 'R3') {
    const top = res.wolf.ranked[0];
    out.push({ title: 'Wolf', winners: [top.player], detail: `${top.units > 0 ? '+' : ''}${top.units} units` });
    (res.overlayMatchPlay.matches || []).forEach(m => {
      out.push({
        title: `Side Nassau · ${NAME(m.sides[0][0])} v ${NAME(m.sides[1][0])}`,
        winners: m.winnerIds,
        detail: m.winner === 'halve' ? 'overall halved' : m.overall.label,
      });
    });
  }
  if (rid === 'R4') {
    const ts = res.teamStableford;
    ts.segments.forEach(s => out.push({
      title: `Holes ${s.range[0]}–${s.range[1]}`,
      winners: s.winner === 'halve' ? [] : (roundOf(rid).teams.find(t => t.name === s.winner) || {}).players || [],
      detail: s.winner === 'halve' ? 'halved' : `${s[s.winner]} points`,
    }));
    out.push({
      title: 'The 18-hole total',
      winners: ts.overallWinner === 'halve' ? [] : (roundOf(rid).teams.find(t => t.name === ts.overallWinner) || {}).players || [],
      detail: `${ts.teamTotals[ts.teams[0].name]}–${ts.teamTotals[ts.teams[1].name]}`,
    });
  }
  if (rid === 'R5') {
    out.push({ title: 'Bingo Bango Bongo (18 holes)', winners: res.bbb.champions, detail: `${res.bbb.totals[res.bbb.champions[0]]} points` });
    const mp = res.matchPlay;
    out.push({
      title: 'Round-robin match play',
      winners: mp.champions,
      detail: mp.champions.length ? `${mp.record[mp.champions[0]].w}–${mp.record[mp.champions[0]].l}–${mp.record[mp.champions[0]].h}` : '',
    });
  }
  if (rid === 'R6') {
    res.singles.results.forEach(s => out.push({
      title: `${s.tier} singles`,
      winners: s.winner === 'halve' ? [] : [s.winner],
      detail: s.winner === 'halve' ? 'halved' : s.match.label,
    }));
    const top = res.stableford.ranked[0];
    out.push({ title: 'Stableford medal', winners: [top.player], detail: `${top.points} points` });
  }
  return out;
}

// "Wolf — Mike (+10 units)", "Bronze singles — halved". A halved match has no
// winner and no margin, so it says so once rather than twice.
const titleLine = t => {
  const who = t.winners.length ? listOf(t.winners.map(NAME)) : 'halved';
  const detail = t.detail && t.detail !== 'halved' ? ` <span class="note">(${esc(t.detail)})</span>` : '';
  return `${esc(t.title)} — <b>${esc(who)}</b>${detail}`;
};

// ── match pages ─────────────────────────────────────────────────────────────
function matchBody(m) {
  const holes = holesOf(m.roundId);
  const round = roundOf(m.roundId);
  const course = courseOf(m.roundId);
  const parts = [];

  const ov = m.segs.overall;
  const verdict = ov.winner === 'halve'
    ? 'All square'
    : `${ov.winner === 'A' ? m.sides[0].label : m.sides[1].label} won ${ov.label}`;

  parts.push(`<section class="block">
  <h2>Result</h2>
  <p style="font-size:20px;font-weight:800;color:var(--deep)">${esc(verdict)}</p>
  <p class="note">${esc(course.name)} · ${esc(round.date)} · ${esc(m.blurb)}.</p>
  <div style="margin-top:10px">${segCards(m)}</div>
  ${m.popNote ? `<p class="note" style="margin-top:10px">${esc(m.popNote)}</p>` : ''}
  ${m.popFlags ? `<p class="note" style="margin-top:10px">${popFlagNote(m)}</p>` : ''}
</section>`);

  parts.push(`<section class="block"><h2>Hole by hole · the 18</h2>
${matchProgress(m, m.segs.overall, holes)}</section>`);

  // Money and points, side by side in prose so a single figure is traceable.
  const lines = m.moneyLines || [];
  const net = {};
  lines.forEach(l => { net[l.pid] = (net[l.pid] || 0) + l.amount; });
  const moneyBody = m.moneyLabel
    ? (() => {
      const bd = live.money.rounds[m.roundId].breakdown;
      const rows = round.players.map(pid => {
        const li = (bd[pid] || []).find(x => x.label === m.moneyLabel);
        return `<tr><td class="name">${esc(NAME(pid))}</td>${cashCell(li ? li.amount : 0)}</tr>`;
      }).join('');
      return `<div class="scroll"><table><thead><tr><th class="name">Player</th><th>${esc(m.moneyLabel)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })()
    : lines.length
      ? `<div class="scroll"><table>
  <thead><tr><th class="txt">Segment</th>${m.sides.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
  <tbody>${['front', 'back', 'overall'].map(seg => {
        const rowLines = lines.filter(l => l.seg === seg);
        if (!rowLines.length) return `<tr><td class="txt">${seg === 'overall' ? 'The 18' : `${seg[0].toUpperCase()}${seg.slice(1)} nine`}</td>${m.sides.map(() => '<td class="flat">halved</td>').join('')}</tr>`;
        return `<tr><td class="txt">${seg === 'overall' ? 'The 18' : `${seg[0].toUpperCase()}${seg.slice(1)} nine`}</td>${m.sides.map(s => {
          const l = rowLines.find(x => x.pid === s.players[0]);
          return cashCell(l ? l.amount : 0);
        }).join('')}</tr>`;
      }).join('')}
  <tr class="tot"><td class="txt">Match total</td>${m.sides.map(s => cashCell(net[s.players[0]] || 0)).join('')}</tr></tbody>
</table></div>`
      : '<p class="note">No money changed hands — every segment was halved.</p>';

  parts.push(`<section class="block"><h2>The cash</h2>
<p class="note">${esc(m.stakeNote)}</p>
<div style="margin-top:10px">${moneyBody}</div></section>`);

  // Cup points from this match, where the match carried any.
  const cupRows = matchCupPoints(m);
  parts.push(`<section class="block"><h2>Cup points</h2>
${cupRows}
<p class="note" style="margin-top:8px">${esc(m.pointsNote)}</p></section>`);

  parts.push(`<section class="block"><h2>Both nines, separately</h2>
<h3>Front nine — ${esc(m.segs.front.winner === 'halve' ? 'halved' : `${m.segs.front.winner === 'A' ? m.sides[0].label : m.sides[1].label} ${m.segs.front.label}`)}</h3>
${matchProgress(m, m.segs.front, holes)}
<h3 style="margin-top:14px">Back nine — ${esc(m.segs.back.winner === 'halve' ? 'halved' : `${m.segs.back.winner === 'A' ? m.sides[0].label : m.sides[1].label} ${m.segs.back.label}`)}</h3>
${matchProgress(m, m.segs.back, holes)}
</section>`);

  parts.push(`<section class="block noprint"><h2>Also on this card</h2>
<div class="dir"><a class="tile" href="../rounds/${m.roundId.toLowerCase()}.html"><span class="t">${esc(m.roundId)} · ${esc(course.name)}</span><span class="d">The full round — card, games, points, money</span></a>
${m.sides.flatMap(s => s.players).map(pid => `<a class="tile" href="../players/${pid}.html"><span class="t">${esc(NAME(pid))}</span><span class="d">His whole week</span></a>`).join('\n')}</div></section>`);

  return parts.join('\n\n');
}

function popFlagNote(m) {
  const given = Object.entries(m.popFlags || {})
    .map(([pid, flags]) => {
      const holes = flags.map((f, i) => (f ? i + 1 : null)).filter(Boolean);
      return holes.length ? `${NAME(pid)} received ${holes.length} ${holes.length === 1 ? 'pop' : 'pops'} — holes ${holes.join(', ')}` : null;
    })
    .filter(Boolean);
  return given.length ? esc(given.join('; ')) + '.' : 'Played level — no pops in this match.';
}

// Which Cup points this particular match produced, by name.
function matchCupPoints(m) {
  const rid = m.roundId;
  const cfg = model.pointsConfig[rid] || {};
  if (m.slug === 'r2-four-ball') {
    const seg = live.resultsByRound.R2.fourBall.segments;
    const rows = [['front', 'Nassau front', cfg.nassauFront], ['back', 'Nassau back', cfg.nassauBack], ['overall', 'Nassau overall', cfg.nassauOverall]]
      .map(([k, label, v]) => {
        const s = seg[k];
        const who = s.winnerTeam === 'halve' ? '—' : teamLabel(rid, s.winnerTeam);
        return `<tr><td class="txt">${esc(label)}</td><td class="txt">${esc(who)}</td><td>${s.winnerTeam === 'halve' ? '0' : `${pts(v)} each`}</td></tr>`;
      }).join('');
    return `<div class="scroll"><table><thead><tr><th class="txt">Match</th><th class="txt">Winner</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  if (m.singles) {
    const s = m.singles;
    const rows = s.winner === 'halve'
      ? [s.a, s.b].map(pid => `<tr><td class="name">${esc(NAME(pid))}</td><td class="txt">Singles halve</td><td>${pts(cfg.singlesHalve)}</td></tr>`).join('')
      : `<tr class="lead"><td class="name">${esc(NAME(s.winner))}</td><td class="txt">Singles win</td><td>${pts(cfg.singlesWin)}</td></tr>`;
    return `<div class="scroll"><table><thead><tr><th class="name">Player</th><th class="txt">Earned</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  if (rid === 'R5') {
    const mp = live.resultsByRound.R5.matchPlay;
    const rows = m.sides.map(s => {
      const pid = s.players[0];
      const r = mp.record[pid];
      return `<tr${mp.champions.includes(pid) ? ' class="lead"' : ''}><td class="name">${esc(NAME(pid))}</td><td>${r.w}–${r.l}–${r.h}</td><td class="txt">${mp.champions.includes(pid) ? `match-play champion · ${pts(cfg.matchPlayChampion)} points` : 'no title'}</td></tr>`;
    }).join('');
    return `<p class="note">No points ride on a single round-robin match — the ${pts(cfg.matchPlayChampion)}-point title went to the best record across all six.</p>
<div class="scroll" style="margin-top:8px"><table><thead><tr><th class="name">Player</th><th>Round-robin record</th><th class="txt">Title</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return '<p class="note">None — this one was played for the cash.</p>';
}

// ── standings page ──────────────────────────────────────────────────────────
function standingsBody() {
  const board = live.standings;
  const max = Math.max(...board.map(r => r.points));
  const champion = board[0];

  const cards = board.map((r, i) => `<div class="cd ${i === 0 ? 'win' : ''}">
    <span class="meta">${ord(i)}${i === 0 ? ' · Cup' : ''}</span>
    <span class="who">${esc(r.name)}</span>
    <span class="big">${pts(r.points)}</span>
    <span class="meta">of ${r.maxPossible} possible</span>
  </div>`).join('\n');

  const boardRows = board.map((r, i) => `<tr${i === 0 ? ' class="lead"' : ''}>
    <td>${r.rank}</td><td class="name">${esc(r.name)}</td><td>${pts(r.points)}</td>
    <td class="barcell"><span class="bar"><i style="width:${Math.round((r.points / max) * 100)}%"></i></span></td>
    <td>${r.maxPossible}</td><td>${r.r6Stableford ?? '—'}</td><td>${r.headToHead}</td>
  </tr>`).join('\n');

  const climbRows = climb.map(c => {
    const by = {}; c.board.forEach(r => { by[r.player] = r; });
    // Shade whoever actually led that night — never on a night when nobody has
    // scored yet (R1 awards no Cup points, so Tuesday is a four-way 0).
    const best = Math.max(...c.board.map(r => r.points));
    return `<tr><td class="txt">${esc(c.roundId)} · ${esc(courseOf(c.roundId).name)}</td>${IDS.map(pid => {
      const r = by[pid];
      const lead = r && best > 0 && r.points === best;
      return `<td${lead ? ' class="seg"' : ''}>${r ? pts(r.points) : '—'}</td>`;
    }).join('')}</tr>`;
  }).join('\n');

  const ledger = board.map(r => {
    const rows = ROUND_IDS.filter(rid => roundPoints[rid][r.player].breakdown.length)
      .map(rid => `<tr><td class="txt">${esc(rid)} · ${esc(courseOf(rid).name)}</td><td class="txt">${roundPoints[rid][r.player].breakdown.map(b => `${esc(b.category)} ${pts(b.points)}`).join(' · ')}</td><td>${pts(roundPoints[rid][r.player].total)}</td></tr>`).join('');
    const awards = awardPoints[r.player].breakdown.length
      ? `<tr><td class="txt">Season awards</td><td class="txt">${awardPoints[r.player].breakdown.map(b => `${esc(b.category)} ${pts(b.points)}`).join(' · ')}</td><td>${pts(awardPoints[r.player].total)}</td></tr>`
      : '<tr><td class="txt">Season awards</td><td class="txt"><span class="note">none</span></td><td>0</td></tr>';
    return `<h3 style="margin-top:14px">${esc(r.name)} — ${pts(r.points)} points</h3>
<div class="scroll"><table><thead><tr><th class="txt">Where</th><th class="txt">What</th><th>Points</th></tr></thead>
<tbody>${rows}${awards}<tr class="tot"><td class="txt">Total</td><td class="txt"></td><td>${pts(r.points)}</td></tr></tbody></table></div>`;
  }).join('\n');

  const offerRows = ROUND_IDS.map(rid => {
    const bd = EgtPoints.roundPointsBreakdown(model, rid);
    return `<tr><td class="txt">${esc(rid)} · ${esc(courseOf(rid).name)}</td><td class="txt">${esc(bd.summary)}</td><td>${pts(bd.max)}</td></tr>`;
  }).join('');
  const awardBd = EgtPoints.seasonAwardsBreakdown(model);

  return `<section class="block">
  <h2>Final standings</h2>
  <div class="cards four">
${cards}
  </div>
  <p class="note" style="margin-top:10px"><b>${esc(champion.name)} takes the 2026 Cup</b> with ${pts(champion.points)} of a possible ${champion.maxPossible} points, ${pts(champion.points - board[1].points)} clear of ${esc(board[1].name)}.</p>
</section>

<section class="block"><h2>The board</h2>
<div class="scroll"><table>
  <thead><tr><th>Pos</th><th class="name">Player</th><th>Points</th><th></th><th>Max</th><th>R6 Stableford</th><th>Match wins</th></tr></thead>
  <tbody>
${boardRows}
  </tbody>
  <caption>Ties break on R6 Stableford points first, then head-to-head match wins, then a chip-off at Black Bear. Neither was needed.</caption>
</table></div></section>

<section class="block"><h2>The climb</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">After</th>${IDS.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}</tr></thead>
  <tbody>
${climbRows}
  </tbody>
  <caption>Cup points standing after each round, recomputed from scratch each night. The shaded cell is the leader. R1 at Minerals was flat / stakes-only — cash, no Cup points — so nobody moved on Tuesday.</caption>
</table></div></section>

<section class="block"><h2>Where 33 points come from</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Round</th><th class="txt">On offer</th><th>Max to one player</th></tr></thead>
  <tbody>${offerRows}
  <tr class="sub"><td class="txt">Season awards</td><td class="txt">${esc(awardBd.summary)}</td><td>${pts(awardBd.max)}</td></tr>
  <tr class="tot"><td class="txt">Ceiling</td><td class="txt"></td><td>${pts(24 + awardBd.max)}</td></tr></tbody>
  <caption>R1 is excluded from the Cup, so the 24 available across R2–R6 plus ${pts(awardBd.max)} in season awards caps every player at ${pts(24 + awardBd.max)}.</caption>
</table></div></section>

<section class="block"><h2>Every point, traced</h2>
${ledger}</section>`;
}

// ── awards page ─────────────────────────────────────────────────────────────
function awardsBody() {
  const stats = live.tourneyStats;
  const statVal = (pid, key) => {
    if (key === 'ironman') return (stats[pid]?.fairwaysHit || 0) + (stats[pid]?.greensInReg || 0);
    return stats[pid]?.[key] || 0;
  };
  const winnersOfCategory = category => {
    const out = [];
    IDS.forEach(pid => {
      const b = awardPoints[pid].breakdown.find(x => x.category === category);
      if (b) out.push({ pid, points: b.points });
    });
    return out;
  };

  const awardCards = AWARD_META.map(a => {
    const won = winnersOfCategory(a.category);
    const who = won.length ? listOf(won.map(w => NAME(w.pid))) : 'Not awarded';
    // The figure shown is what a winner actually banked, so a shared award reads
    // as the quarter-point it was rather than the point it was worth.
    const face = won.length ? won[0].points * won.length : 0;
    const detail = won.length
      ? `${statVal(won[0].pid, a.key)} ${a.stat.replace(/^most |^fewest /, '')}${won.length > 1 ? ` · ${pts(face)} ${face === 1 ? 'pt' : 'pts'} split ${won.length} ways` : ''}`
      : 'nobody qualified';
    return `<div class="cd ${won.length ? 'win' : ''}">
    <span class="meta">${esc(a.stat)}</span>
    <span class="who">${esc(a.label)}</span>
    <span class="big">${pts(won.length ? won[0].points : 0)}<span style="font-size:12px;font-weight:600"> pts</span></span>
    <span class="meta">${esc(who)} · ${esc(detail)}</span>
  </div>`;
  }).join('\n');

  const raceRows = AWARD_META.map(a => {
    const ranked = IDS.map(pid => ({ pid, v: statVal(pid, a.key) }))
      .sort((x, y) => (a.low ? x.v - y.v : y.v - x.v));
    const won = winnersOfCategory(a.category).map(w => w.pid);
    return `<tr><td class="txt">${esc(a.label)}</td>${IDS.map(pid => {
      const v = statVal(pid, a.key);
      return `<td${won.includes(pid) ? ' class="seg"' : ''}>${v}</td>`;
    }).join('')}<td class="txt">${won.length ? esc(listOf(won.map(NAME))) : '<span class="note">not awarded</span>'}</td></tr>`;
  }).join('\n');

  const titles = ROUND_IDS.map(rid => `<tr><td class="txt"><b>${esc(rid)}</b> · ${esc(courseOf(rid).name)}<br/><span class="note">${esc(DAY[rid])}</span></td><td class="txt">${titlesFor(rid).map(titleLine).join('<br/>')}</td></tr>`).join('\n');

  const ptm = live.ptm;
  const ptmRows = ptm.ledger.map(l => `<tr><td>${esc(l.round)}</td><td>${l.hole}</td><td class="name">${esc(NAME(l.to))}</td><td class="txt">took it from ${esc(NAME(l.from))} with a ${esc(l.reason)}</td></tr>`).join('\n');

  const statTable = `<div class="scroll"><table>
  <thead><tr><th class="txt">Statistic</th>${IDS.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}</tr></thead>
  <tbody>
    <tr><td class="txt">Gross birdies</td>${IDS.map(pid => `<td>${stats[pid].grossBirdies}</td>`).join('')}</tr>
    <tr><td class="txt">Net birdies</td>${IDS.map(pid => `<td>${stats[pid].netBirdies}</td>`).join('')}</tr>
    <tr><td class="txt">Pars</td>${IDS.map(pid => `<td>${stats[pid].pars}</td>`).join('')}</tr>
    <tr><td class="txt">Bogeys</td>${IDS.map(pid => `<td>${stats[pid].bogeys}</td>`).join('')}</tr>
    <tr><td class="txt">Rounds counted</td>${IDS.map(pid => `<td>${stats[pid].rounds}</td>`).join('')}</tr>
    <tr><td class="txt">Putts recorded</td>${IDS.map(pid => `<td>${stats[pid].puttHoles ? stats[pid].putts : '—'}</td>`).join('')}</tr>
    <tr><td class="txt">Fairways + greens in reg</td>${IDS.map(pid => `<td>${stats[pid].fairwaysHit + stats[pid].greensInReg || '—'}</td>`).join('')}</tr>
  </tbody>
  <caption>R2–R6 only — R1 at Minerals is flat / stakes-only and never feeds an award.</caption>
</table></div>`;

  return `<section class="block">
  <h2>The season awards</h2>
  <p class="note">Settled once R6 closed, off R2–R6 play only. Ties split the award.</p>
  <div class="cards" style="margin-top:10px">
${awardCards}
  </div>
</section>

<section class="block"><h2>The races</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Award</th>${IDS.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}<th class="txt">Winner</th></tr></thead>
  <tbody>
${raceRows}
  </tbody>
  <caption>The shaded cell is the winning figure. Putts, fairways and greens went untracked on this trip: with no putt recorded, nobody was eligible for the Flat Stick, and the Iron Man ended a four-way tie at zero — a quarter point each.</caption>
</table></div></section>

<section class="block"><h2>The book of stats</h2>
${statTable}</section>

<section class="block"><h2>Every title on the trip</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Round</th><th class="txt">Won</th></tr></thead>
  <tbody>
${titles}
  </tbody>
</table></div></section>

<section class="block"><h2>The Rock</h2>
<p class="note">Pass the Money: ${esc(model.sideGames.passTheMoney.token)}, starting in ${esc(NAME(ptm.startHolder))}'s pocket at ${esc(model.sideGames.passTheMoney.startsAt)}, stolen by any net birdie, every three-putt adding a dollar to the pot. Whoever holds it after R6 hole 18 keeps the bill and the pot.</p>
<div class="scroll" style="margin-top:10px"><table>
  <thead><tr><th>Round</th><th>Hole</th><th class="name">Took it</th><th class="txt">How</th></tr></thead>
  <tbody>
${ptmRows}
  </tbody>
  <caption>The bill changed hands ${ptm.ledger.length} times and finished where it started, with ${esc(NAME(ptm.finalHolder))}. Nobody actually called the game on this trip, so it stays off the ledger — turning it on would move $${plainAmt(ptm.bill + ptm.potTotal)} plus the pot.</caption>
</table></div></section>`;
}

// ── money page ──────────────────────────────────────────────────────────────
function moneyBody() {
  const money = live.money;
  const cards = summary.standings.map(s => `<div class="cd ${s.tone}">
    <span class="who">${esc(s.name)}</span>
    <span class="big ${s.tone}">${cash(s.total)}</span>
    <span class="meta">${esc(s.verdict)} · golf ${cash(s.golf)} · off-course ${cash(s.extras)}</span>
  </div>`).join('\n');

  const rows = summary.rounds.map((r, i) => `<tr>
    <td class="txt"><b>${i + 1}. ${esc(r.course)}</b> <span class="note">${esc(DAY[r.id] || r.date)}</span><br/><span class="note">${esc(FORMAT[r.id] || '')}</span></td>
${IDS.map(pid => `    ${cashCell(r.by[pid])}`).join('\n')}
  </tr>`).join('\n');
  const golfRow = `<tr class="sub"><td class="txt">Golf subtotal</td>${IDS.map(pid => cashCell(money.golfOnly[pid])).join('')}</tr>`;
  const extraRows = summary.extras.map(it => `<tr><td class="txt"><b>${esc(it.label)}</b><br/><span class="note">${esc(it.note || '')}</span></td>${IDS.map(pid => cashCell(it.by[pid])).join('')}</tr>`).join('\n');
  const totalRow = `<tr class="tot"><td class="txt">Final</td>${IDS.map(pid => cashCell(money.total[pid])).join('')}</tr>`;

  const pay = summary.settle.map(s => `<li>${esc(NAME(s.from))} → ${esc(NAME(s.to))} <b>${s.due > 0 ? `$${plainAmt(s.due)}` : 'settled from the pot'}</b>${s.credit ? ` <span class="note">($${plainAmt(s.amount)} owed, less $${plainAmt(s.credit)} already in the poker pot)</span>` : ''}</li>`).join('\n');

  const work = summary.rounds.map((r, i) => `<h3 style="margin-top:12px">${i + 1} · ${esc(r.course)}</h3>
<ul class="bul">${r.work.map(l => `<li${l.startsWith('   ') ? ' style="list-style:none;margin-left:-8px"' : ''}>${esc(l.trim())}</li>`).join('')}</ul>`).join('\n');

  return `<section class="block">
  <h2>The bankroll</h2>
  <div class="cards four">
${cards}
  </div>
  <p class="note" style="margin-top:10px">Golf and off-course costs together — what a man actually owed at the end of the week. The ledger nets to $0 to the cent.</p>
</section>

<section class="block"><h2>Settle up</h2>
<ul class="bul">
${pay}
</ul>
<p class="note">Each pairing is netted, so nobody hands money both ways.</p></section>

<section class="block"><h2>Where it came from</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Round</th>${IDS.map(pid => `<th>${esc(NAME(pid))}</th>`).join('')}</tr></thead>
  <tbody>
${rows}
${golfRow}
${extraRows}
${totalRow}
  </tbody>
</table></div></section>

<section class="block"><h2>How each stake was decided</h2>
${work}</section>

<section class="block noprint"><h2>Also</h2>
<div class="dir"><a class="tile" href="../settlement.html"><span class="t">The settlement board</span><span class="d">The same money as a one-screen broadcast card</span></a></div>
<p class="note" style="margin-top:8px">The Rock (Pass the Money) is not settled here — nobody called it. See the <a href="awards.html">awards page</a> for the ledger it would have produced.</p></section>`;
}

// ── player pages ────────────────────────────────────────────────────────────
function playerBody(pid) {
  const p = model.playersById[pid];
  const board = live.standings.find(r => r.player === pid);
  const stats = live.tourneyStats[pid];
  const playedRounds = ROUND_IDS.filter(rid => roundOf(rid).players.includes(pid));

  const grossOf = rid => holesOf(rid).reduce((a, h) => a + (grossAt(rid, pid, h.hole) || 0), 0);
  const bestRound = playedRounds.slice().sort((a, b) => (grossOf(a) - courseOf(a).par) - (grossOf(b) - courseOf(b).par))[0];

  const roundRows = playedRounds.map(rid => {
    const course = courseOf(rid);
    const g = grossOf(rid);
    const front = holesOf(rid).filter(h => h.hole <= 9).reduce((a, h) => a + (grossAt(rid, pid, h.hole) || 0), 0);
    const earned = roundPoints[rid][pid];
    return `<tr><td class="txt"><a href="../rounds/${rid.toLowerCase()}.html">${esc(rid)} · ${esc(course.name)}</a><br/><span class="note">${esc(DAY[rid])}</span></td>
    <td>${model.derived[rid].courseHandicaps[pid]}</td>
    <td>${front}</td><td>${g - front}</td><td><b>${g}</b></td>
    <td>${g - course.par > 0 ? `+${g - course.par}` : g - course.par}</td>
    <td>${pts(earned.total)}</td>
    ${cashCell(live.money.rounds[rid].total[pid])}</tr>`;
  }).join('\n');

  const myMatches = MATCHES.filter(m => m.sides.some(s => s.players.includes(pid)));
  const matchRows = myMatches.map(m => {
    const mine = m.sides.findIndex(s => s.players.includes(pid));
    const ov = m.segs.overall;
    const result = ov.winner === 'halve' ? 'Halved' : (ov.winner === 'A') === (mine === 0) ? `Won ${ov.label}` : `Lost ${ov.label}`;
    const cls = ov.winner === 'halve' ? 'halve' : (ov.winner === 'A') === (mine === 0) ? 'win' : '';
    const netCash = (m.moneyLines || []).filter(l => l.pid === pid).reduce((a, l) => a + l.amount, 0);
    return `<tr><td class="txt"><a href="../${matchPath(m)}">${esc(m.title)}</a><br/><span class="note">${esc(m.roundId)} · ${esc(m.blurb)}</span></td>
    <td class="txt"><span class="pill ${cls}">${esc(result)}</span></td>
    ${m.moneyLabel ? '<td class="flat">—</td>' : cashCell(netCash)}</tr>`;
  }).join('\n');

  const wl = myMatches.reduce((a, m) => {
    const mine = m.sides.findIndex(s => s.players.includes(pid));
    const ov = m.segs.overall;
    if (ov.winner === 'halve') a.h++;
    else if ((ov.winner === 'A') === (mine === 0)) a.w++;
    else a.l++;
    return a;
  }, { w: 0, l: 0, h: 0 });

  const ledgerRows = playedRounds.filter(rid => roundPoints[rid][pid].breakdown.length)
    .map(rid => `<tr><td class="txt">${esc(rid)} · ${esc(courseOf(rid).name)}</td><td class="txt">${roundPoints[rid][pid].breakdown.map(b => `${esc(b.category)} ${pts(b.points)}`).join(' · ')}</td><td>${pts(roundPoints[rid][pid].total)}</td></tr>`).join('\n');
  const awardRow = awardPoints[pid].breakdown.length
    ? `<tr><td class="txt">Season awards</td><td class="txt">${awardPoints[pid].breakdown.map(b => `${esc(b.category)} ${pts(b.points)}`).join(' · ')}</td><td>${pts(awardPoints[pid].total)}</td></tr>`
    : '<tr><td class="txt">Season awards</td><td class="txt"><span class="note">none</span></td><td>0</td></tr>';

  const moneyRows = playedRounds.map(rid => `<tr><td class="txt">${esc(rid)} · ${esc(courseOf(rid).name)}</td><td class="txt">${(live.money.rounds[rid].breakdown[pid] || []).map(l => `${esc(prettyMoneyLabel(rid, l.label))} ${cash(l.amount)}`).join(' · ') || '<span class="note">nothing</span>'}</td>${cashCell(live.money.rounds[rid].total[pid])}</tr>`).join('\n');
  const extraRows = summary.extras.map(it => `<tr><td class="txt">${esc(it.label)}</td><td class="txt"><span class="note">${esc(it.note || '')}</span></td>${cashCell(it.by[pid])}</tr>`).join('\n');

  const awardsWon = awardPoints[pid].breakdown.map(b => b.category);

  return `<section class="block">
  <h2>The week</h2>
  <div class="cards four">
    <div class="cd ${board.rank === 1 ? 'win' : ''}"><span class="meta">Cup finish</span><span class="big">${ord(board.rank - 1)}</span><span class="meta">${pts(board.points)} of ${board.maxPossible} points</span></div>
    <div class="cd ${tone(live.money.total[pid])}"><span class="meta">Bankroll</span><span class="big ${tone(live.money.total[pid])}">${cash(live.money.total[pid])}</span><span class="meta">golf ${cash(live.money.golfOnly[pid])} · off-course ${cash(live.money.extras.total[pid])}</span></div>
    <div class="cd"><span class="meta">Matches</span><span class="big">${wl.w}–${wl.l}–${wl.h}</span><span class="meta">won · lost · halved</span></div>
    <div class="cd"><span class="meta">Best round</span><span class="big">${grossOf(bestRound)}</span><span class="meta">${esc(courseOf(bestRound).name)} · ${grossOf(bestRound) - courseOf(bestRound).par > 0 ? '+' : ''}${grossOf(bestRound) - courseOf(bestRound).par}</span></div>
  </div>
  <p class="note" style="margin-top:10px">Handicap index ${p.handicapIndex}. ${awardsWon.length ? `Took the ${awardsWon.map(a => a.replace(/ \(.*\)$/, '')).join(', ')}.` : 'No season award.'}
    ${board.rank === 1 ? 'Champion of the 2026 EGT Cup.' : ''}</p>
</section>

<section class="block"><h2>Round by round</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Round</th><th>CH</th><th>Out</th><th>In</th><th>Gross</th><th>To par</th><th>Cup pts</th><th>Money</th></tr></thead>
  <tbody>
${roundRows}
  <tr class="tot"><td class="txt">Trip</td><td></td><td></td><td></td><td>${playedRounds.reduce((a, rid) => a + grossOf(rid), 0)}</td><td></td><td>${pts(board.points)}</td>${cashCell(live.money.golfOnly[pid])}</tr>
  </tbody>
  <caption>Gross scores. CH is the course handicap at that course from the tees played.</caption>
</table></div></section>

<section class="block"><h2>His matches</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Match</th><th class="txt">Result</th><th>Money</th></tr></thead>
  <tbody>
${matchRows}
  </tbody>
  <caption>The four-ball's cash was a flat team stake rather than a per-segment Nassau, so no match figure is shown for it — see the round page.</caption>
</table></div></section>

<section class="block"><h2>Every Cup point</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Where</th><th class="txt">What</th><th>Points</th></tr></thead>
  <tbody>
${ledgerRows}
${awardRow}
  <tr class="tot"><td class="txt">Total</td><td class="txt"></td><td>${pts(board.points)}</td></tr>
  </tbody>
</table></div></section>

<section class="block"><h2>Every dollar</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Where</th><th class="txt">What</th><th>Net</th></tr></thead>
  <tbody>
${moneyRows}
  <tr class="sub"><td class="txt">Golf subtotal</td><td class="txt"></td>${cashCell(live.money.golfOnly[pid])}</tr>
${extraRows}
  <tr class="tot"><td class="txt">Final</td><td class="txt"></td>${cashCell(live.money.total[pid])}</tr>
  </tbody>
</table></div></section>

<section class="block"><h2>His numbers</h2>
<div class="scroll"><table>
  <thead><tr><th class="txt">Statistic</th><th>${esc(p.name)}</th><th class="txt">Field</th></tr></thead>
  <tbody>
    ${[['Gross birdies', 'grossBirdies'], ['Net birdies', 'netBirdies'], ['Pars', 'pars'], ['Bogeys', 'bogeys']]
      .map(([label, key]) => `<tr><td class="txt">${label}</td><td><b>${stats[key]}</b></td><td class="txt"><span class="note">${IDS.filter(x => x !== pid).map(x => `${NAME(x)} ${live.tourneyStats[x][key]}`).join(' · ')}</span></td></tr>`).join('\n    ')}
  </tbody>
  <caption>R2–R6 only. Putts, fairways and greens went untracked on this trip.</caption>
</table></div></section>`;
}

// ── the cover ───────────────────────────────────────────────────────────────
function indexBody(pageList) {
  const board = live.standings;
  const champ = board[0];
  const cards = board.map((r, i) => `<div class="cd ${i === 0 ? 'win' : ''}">
    <span class="meta">${ord(i)}${i === 0 ? ' · Cup' : ''}</span>
    <span class="who"><a href="players/${r.player}.html" style="text-decoration:none;color:inherit">${esc(r.name)}</a></span>
    <span class="big">${pts(r.points)}</span>
    <span class="meta">${cash(live.money.total[r.player])} on the week</span>
  </div>`).join('\n');

  const group = (heading, blurb, items) => `<section class="block">
  <h2>${esc(heading)}</h2>
  ${blurb ? `<p class="note" style="margin-bottom:8px">${blurb}</p>` : ''}
  <div class="dir">
${items.map(it => `    <a class="tile" href="${it.href}"><span class="t">${esc(it.t)}</span><span class="d">${esc(it.d)}</span></a>`).join('\n')}
  </div>
</section>`;

  const bookItems = [
    { href: 'standings.html', t: 'Final standings', d: 'The board, the climb, and every point traced' },
    { href: 'awards.html', t: 'Awards & titles', d: 'Season awards, every title won, The Rock' },
    { href: 'money.html', t: 'The money', d: 'Round by round, the off-course ledger, who paid whom' },
    { href: 'print.html', t: 'The whole book', d: 'Every page on one sheet — for printing or PDF' },
  ];
  const roundItems = ROUND_IDS.map(rid => {
    const t = titlesFor(rid).filter(x => x.winners.length);
    return {
      href: `rounds/${rid.toLowerCase()}.html`,
      t: `${rid} · ${courseOf(rid).name}`,
      d: `${DAY[rid]} — ${t.length ? `${t[0].title} to ${t[0].winners.map(NAME).join(' & ')}` : 'all square'}`,
    };
  });
  const matchItems = MATCHES.map(m => ({
    href: matchPath(m),
    t: m.title,
    d: `${m.roundId} — ${m.segs.overall.winner === 'halve' ? 'halved' : `${m.segs.overall.winner === 'A' ? m.sides[0].label : m.sides[1].label} ${m.segs.overall.label}`}`,
  }));
  const playerItems = board.map(r => ({
    href: `players/${r.player}.html`,
    t: r.name,
    d: `${ord(r.rank - 1)} · ${pts(r.points)} pts · ${cash(live.money.total[r.player])}`,
  }));

  // What actually built the winning total, biggest sources first — read off the
  // champion's own points ledger rather than asserted.
  const built = champ.breakdown.slice().sort((a, b) => b.points - a.points).slice(0, 3)
    .map(b => `${b.category.replace(/ \(.*\)$/, '')} (${pts(b.points)})`).join(', ');
  const title = live.resultsByRound.R6.singles.results.find(s => s.tier === 'Championship');
  const singlesLine = title.winner === 'halve'
    ? 'The championship singles at Black Bear was halved.'
    : `${NAME(title.winner)} took the championship singles at Black Bear on Friday${title.winner === champ.player ? ' to close it out' : ', but the arithmetic was already done'}.`;

  return `<section class="block">
  <h2>Champion</h2>
  <p style="font-size:clamp(20px,3.4vw,30px);font-weight:800;color:var(--deep);line-height:1.15">${esc(champ.name)} takes the 2026 EGT Cup.</p>
  <p class="note" style="margin-top:6px">${pts(champ.points)} points of a possible ${champ.maxPossible}, ${pts(champ.points - board[1].points)} clear of ${esc(board[1].name)} — built on ${esc(built)}.
    ${esc(singlesLine)}</p>
  <div class="cards four" style="margin-top:12px">
${cards}
  </div>
</section>

<section class="block">
  <h2>The trip</h2>
  <div class="cards">
    <div class="cd"><span class="meta">Where</span><span class="who">Crystal Springs Resort</span><span class="meta">Hamburg · Vernon · Hardyston · Franklin, NJ</span></div>
    <div class="cd"><span class="meta">When</span><span class="who">Jul 21–24, 2026</span><span class="meta">Four days, six rounds</span></div>
    <div class="cd"><span class="meta">Golf</span><span class="who">108 holes</span><span class="meta">Six courses, ${MATCHES.length} matches</span></div>
    <div class="cd"><span class="meta">Field</span><span class="who">${IDS.map(NAME).join(' · ')}</span><span class="meta">Indexes ${IDS.map(pid => model.playersById[pid].handicapIndex).join(' · ')}</span></div>
  </div>
  <p class="note" style="margin-top:10px">Lodging: ${esc(TRIP.lodging)}.</p>
</section>

${group('The rounds', 'One page each: the full scorecard, every game it decided, the pops, the points, the cash.', roundItems)}

${group('The matches', 'Every match played on the trip, hole by hole, with what it paid.', matchItems)}

${group('The players', 'A week in one page — round by round, every match, every point, every dollar.', playerItems)}

${group('The books', '', bookItems)}`;
}

// ── the whole book on one sheet ─────────────────────────────────────────────
function printBody(pages) {
  // Page bodies are written for where their own page lives. This sheet sits at
  // the book's root, so a depth-1 page's links into rounds/ matches/ players/
  // lose one level; links that already leave the book (../settlement.html) are
  // correct from here and stay untouched.
  const rebase = html => html.replace(/href="\.\.\/(rounds|matches|players)\//g, 'href="$1/');
  const sheets = pages
    .filter(p => p.path !== 'index.html' && p.path !== 'print.html')
    .map(p => `<section class="sheet">
  <header class="top"><span class="mark">EGT 2026 Cup${p.kicker ? ` · ${esc(p.kicker)}` : ''}</span>
    <h1>${esc(p.h1)}</h1>${p.sub ? `<p class="sub">${p.sub}</p>` : ''}</header>
${rebase(p.body)}
</section>`).join('\n\n');
  return `<section class="block noprint">
  <h2>Print or save</h2>
  <p>Everything in the book, in order, on one page: the standings, the awards, the money, all six rounds and all ${MATCHES.length} matches, then a page for each player. Print it, or save it as a PDF — each part starts on its own sheet.</p>
  <p class="note">Links still work and open the individual page they point at. <a href="index.html">The cover</a> is the shorter way round.</p>
</section>

${sheets}`;
}

// ── assemble ────────────────────────────────────────────────────────────────
export function buildPages() {
  const subline = `${esc(TRIP.venue.split(' — ')[0])} · Jul 21–24, 2026 · 108 holes`;
  const pages = [];

  pages.push({
    path: 'standings.html', depth: 0, crumb: 'Standings',
    title: 'EGT 2026 Cup · Final Standings', kicker: 'Standings',
    h1: 'The Cup', sub: `Every point, where it was won · ${subline}`,
    desc: 'EGT 2026 Cup final standings — the board, the round-by-round climb, and every Cup point traced to the hole it was won on.',
    body: standingsBody(),
  });
  pages.push({
    path: 'awards.html', depth: 0, crumb: 'Awards',
    title: 'EGT 2026 Cup · Awards & Titles', kicker: 'Awards',
    h1: 'Awards & titles', sub: `The season awards, every title on the trip, and The Rock · ${subline}`,
    desc: 'EGT 2026 Cup awards — Birdie King, Par King, Bogey God, Flat Stick, Iron Man, every round title, and the Pass-the-Money ledger.',
    body: awardsBody(),
  });
  pages.push({
    path: 'money.html', depth: 0, crumb: 'Money',
    title: 'EGT 2026 Cup · The Money', kicker: 'Money',
    h1: 'The money', sub: `Every stake, the off-course ledger, and who paid whom · ${subline}`,
    desc: 'EGT 2026 Cup money — every round’s stakes, the shared trip costs and poker, and the netted settle-up.',
    body: moneyBody(),
  });

  ROUND_IDS.forEach(rid => {
    const course = courseOf(rid);
    pages.push({
      path: `rounds/${rid.toLowerCase()}.html`, depth: 1, crumb: `${rid} · ${esc(course.name)}`,
      title: `EGT 2026 · ${rid} ${course.name}`, kicker: `Round ${roundOf(rid).seq} of 6`,
      h1: course.name, sub: `${esc(roundOf(rid).date)} · ${esc(FORMAT[rid])}`,
      desc: `EGT 2026 Cup ${rid} at ${course.name} — full scorecard, every game decided, the pops, the Cup points and the money.`,
      body: roundBody(rid),
    });
  });

  MATCHES.forEach(m => {
    pages.push({
      path: matchPath(m), depth: 1, crumb: esc(m.title),
      title: `EGT 2026 · ${m.title} (${m.roundId})`, kicker: `${m.roundId} match`,
      h1: m.title, sub: `${esc(m.blurb)} · ${esc(courseOf(m.roundId).name)}`,
      desc: `EGT 2026 Cup match: ${m.title} at ${courseOf(m.roundId).name} — hole by hole, front, back and the 18, with the cash and the Cup points.`,
      body: matchBody(m),
    });
  });

  live.standings.forEach(r => {
    pages.push({
      path: `players/${r.player}.html`, depth: 1, crumb: esc(r.name),
      title: `EGT 2026 · ${r.name}`, kicker: `${ord(r.rank - 1)} · ${pts(r.points)} points`,
      h1: r.name, sub: `A week at Crystal Springs · ${esc(subline)}`,
      desc: `${r.name} at the EGT 2026 Cup — round by round, every match, every Cup point and every dollar.`,
      body: playerBody(r.player),
    });
  });

  pages.push({
    path: 'index.html', depth: 0,
    title: 'EGT 2026 Cup · The Recap', kicker: null,
    h1: 'The 2026 Cup', sub: `Crystal Springs Resort, New Jersey · July 21–24, 2026 · six rounds, 108 holes`,
    desc: 'The EGT 2026 Cup recap book — a page for every round, every match and every player, plus the standings, the awards and the money.',
    body: indexBody(pages),
  });

  pages.push({
    path: 'print.html', depth: 0, crumb: 'The whole book',
    title: 'EGT 2026 Cup · The Whole Book', kicker: 'Everything',
    h1: 'The whole book', sub: `Every page, in order, on one sheet · ${subline}`,
    desc: 'The complete EGT 2026 Cup recap on a single page — standings, awards, money, all six rounds, all matches and every player.',
    body: printBody(pages),
  });

  return pages.map(p => ({ path: p.path, html: shell(p) }));
}

function main() {
  const outArg = process.argv.find(a => a.startsWith('--out='));
  const out = outArg ? outArg.slice('--out='.length) : join(ROOT, 'recap');
  const pages = buildPages();
  pages.forEach(p => {
    const file = join(out, p.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, p.html);
  });
  const bytes = pages.reduce((a, p) => a + p.html.length, 0);
  console.log(`Wrote ${pages.length} pages to ${out}/ (${Math.round(bytes / 1024)} KB)`);
  console.log(`  champion: ${live.standings[0].name} ${pts(live.standings[0].points)} pts`);
  console.log(`  rounds: ${ROUND_IDS.length}  matches: ${MATCHES.length}  players: ${IDS.length}`);
  console.log(`  money nets to zero: ${live.money.netsToZero}`);
}

if (process.argv[1] && process.argv[1].endsWith('gen-recap.mjs')) main();
