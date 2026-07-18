// egtPrintable.js — build print-ready HTML (standings + scorecards) purely from
// stored model/state/results. Every printed field maps to a stored value, so
// the packet regenerates identically after each round (seed §5, §9.5).

const EgtPrintable = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${(n || 0).toFixed(2)}`);
  const arrow = d => (d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'new' ? '•' : '–');

  // Friendly headings for the scorecard pages — the model's primaryGame values
  // are machine keys (e.g. "bingoBangoBongo+matchPlay") and read badly printed.
  const GAME_LABELS = {
    'bingoBangoBongo+nines': 'Bingo-Bango-Bongo + The Nines',
    'fourBallMatchPlay': 'Four-Ball Match Play + Nassau',
    'wolf': 'Wolf',
    'fourBallAggregateStableford': 'Team Stableford (2v2)',
    'bingoBangoBongo+matchPlay': 'Bingo-Bango-Bongo + Match Play',
    'championshipSingles+stableford': 'Championship Singles + Stableford',
  };
  const gameLabel = key => GAME_LABELS[key] || String(key || '');

  const STYLE = `
    .egt-print{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#12241c;max-width:900px;margin:0 auto;padding:16px}
    .egt-print h1{font-size:22px;margin:0 0 2px} .egt-print h2{font-size:16px;margin:18px 0 6px;color:#0E2B20}
    .egt-print .sub{color:#5b6b63;font-size:12px;margin-bottom:12px}
    .egt-print table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:8px}
    .egt-print th,.egt-print td{border:1px solid #cddbd3;padding:4px 6px;text-align:center}
    .egt-print th{background:#0E2B20;color:#fff;font-weight:600}
    .egt-print td.name{text-align:left;font-weight:600}
    .egt-print .up{color:#137a3f} .egt-print .down{color:#b3261e}
    .egt-print tr.lead td{background:#eef6f0}
    .egt-print .pend{color:#9a6a00;font-style:italic}
    @media print{.egt-print{max-width:none} .egt-noprint{display:none}}
  `;

  function standingsTable(standings) {
    const ST = (typeof window !== 'undefined' && window.EgtStandings) || (typeof EgtStandings !== 'undefined' ? EgtStandings : null);
    const pts = v => (ST && ST.fmtPoints ? ST.fmtPoints(v) : v);
    const rows = standings.map(r => `
      <tr class="${r.rank === 1 ? 'lead' : ''}">
        <td>${r.rank}</td>
        <td class="name">${esc(r.name)}</td>
        <td>${pts(r.points)}</td>
        <td class="${r.direction}">${arrow(r.direction)}${r.move ? Math.abs(r.move) : ''}</td>
        <td>${r.maxPossible ?? '—'}</td>
      </tr>`).join('');
    return `<table><thead><tr><th>Pos</th><th>Player</th><th>EGT Pts</th><th>Move</th><th>Max</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function moneyTable(model, moneyTotal) {
    const rows = model.players.map(p => `
      <tr><td class="name">${esc(p.name)}</td><td class="${(moneyTotal?.[p.id] || 0) < 0 ? 'down' : 'up'}">${money(moneyTotal?.[p.id] || 0)}</td></tr>`).join('');
    const sum = model.players.reduce((a, p) => a + (moneyTotal?.[p.id] || 0), 0);
    return `<table><thead><tr><th>Player</th><th>Net $</th></tr></thead><tbody>${rows}
      <tr><td class="name">Balance</td><td>${money(sum)}</td></tr></tbody></table>`;
  }

  // Per-round scorecard grid: gross / pops / net for each player, hole by hole.
  function roundScorecard(model, state, roundId, game) {
    const round = model.rounds.find(r => r.id === roundId);
    const course = model.courses[round.courseId];
    const alloc = model.derived[roundId].allocations;
    const scores = state.scores?.[roundId] || {};
    const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;
    const holes = course.holes.slice(0, 18);
    const head = ['Hole', ...holes.map(h => h.hole), 'Tot'];
    const parRow = ['Par', ...holes.map(h => h.par), holes.reduce((a, h) => a + h.par, 0)];
    const siRow = ['SI', ...holes.map(h => (h.si == null ? '—' : h.si)), ''];
    const netGame = game || (roundId === 'R6' ? 'stableford' : roundId === 'R4' ? 'teamStableford' : roundId === 'R2' ? 'fourBallMatch' : roundId === 'R3' ? 'wolf' : 'skinsNet');
    const body = round.players.map(pid => {
      const name = model.playersById[pid].name;
      let tot = 0;
      const cells = holes.map(h => {
        const s = scores[pid]?.[h.hole];
        if (!s || s.gross == null) return '·';
        tot += s.gross;
        const pop = H.popsOnHole(alloc[pid]?.games?.[netGame]?.holes || [], h.hole);
        return pop ? `${s.gross}<sup>${'•'.repeat(pop)}</sup>` : `${s.gross}`;
      });
      return `<tr><td class="name">${esc(name)}</td>${cells.map(c => `<td>${c}</td>`).join('')}<td>${tot || ''}</td></tr>`;
    }).join('');
    const pendNote = course.strokeIndexVerified ? '' : `<div class="pend">Stroke index pending for ${esc(course.name)} — pops shown once SI is entered.</div>`;
    return `<h2>${esc(round.id)} · ${esc(course.name)} — ${esc(gameLabel(round.primaryGame))}</h2>
      <div class="sub">${esc(round.date)} · ${esc(round.playedTee)} tees</div>${pendNote}
      <table><thead>
        <tr>${['Player', ...holes.map(h => h.hole), 'Tot'].map(x => `<th>${x}</th>`).join('')}</tr>
        <tr>${parRow.map(x => `<td>${x}</td>`).join('')}</tr>
        <tr>${siRow.map(x => `<td>${x}</td>`).join('')}</tr>
      </thead><tbody>${body}</tbody></table>`;
  }

  // Cumulative R2-R6 stat table (putts / FIR / GIR) — mirrors the standings tab.
  function statsTable(model, tourneyStats) {
    const rows = model.players.map(p => {
      const st = tourneyStats?.[p.id] || {};
      return `<tr><td class="name">${esc(p.name)}</td><td>${st.putts ?? 0}</td><td>${st.fairwaysHit ?? 0}</td><td>${st.greensInReg ?? 0}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>Player</th><th>Putts</th><th>FIR</th><th>GIR</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Full packet: header + standings + tourney stats + money + scorecards.
  function packet(model, state, live) {
    const parts = [`<div class="egt-print"><style>${STYLE}</style>`];
    parts.push(`<h1>${esc(model.trip.name)}</h1>`);
    parts.push(`<div class="sub">${esc(model.trip.venue)} · ${esc(model.trip.dates.start)}–${esc(model.trip.dates.end)} · updated ${esc(live?.night || '')}</div>`);
    parts.push(`<h2>EGT Cup Standings</h2>`);
    parts.push(standingsTable(live?.standings || []));
    parts.push(`<h2>Tourney Stats (R2–R6)</h2>`);
    parts.push(statsTable(model, live?.tourneyStats));
    parts.push(`<h2>Money (nets to $0)</h2>`);
    parts.push(moneyTable(model, live?.money?.total || {}));
    (state.finalized || []).forEach(rid => { parts.push(roundScorecard(model, state, rid)); });
    parts.push('</div>');
    return parts.join('\n');
  }

  return { STYLE, standingsTable, moneyTable, statsTable, roundScorecard, packet };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtPrintable });
}
