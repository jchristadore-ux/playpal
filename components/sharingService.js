// sharingService.js — scorecard text/CSV generation + Web Share / clipboard.
//
// Text and CSV builders are pure (Node-testable); share/download wrappers are
// browser-only and degrade gracefully (share → clipboard → failure callback).

const SharingService = (function () {

  function _toParLabel(diff) {
    if (diff === 0) return 'E';
    return diff > 0 ? '+' + diff : String(diff);
  }

  // Compact, message-friendly round summary.
  //   round: { course, players, date? }   scores: { pid: [gross] }
  //   opts:  { gameResults: [{ name, status }], payouts: { pid: amount } }
  function scorecardText(round, scores, opts) {
    const o = opts || {};
    const course = round.course;
    const holes = course.holes || [];
    const par = holes.reduce((a, h) => a + (h.par || 0), 0);
    const lines = [];
    lines.push('⛳ ' + course.name + (round.date ? ' — ' + round.date : ''));
    lines.push('Par ' + par + ' · ' + holes.length + ' holes');
    lines.push('');

    const ranked = round.players.map(p => {
      const arr = scores[p.id] || [];
      let gross = 0, parPlayed = 0, played = 0, front = 0, back = 0;
      holes.forEach((h, i) => {
        const s = arr[i];
        if (!s) return;
        gross += s; parPlayed += h.par; played++;
        if (i < 9) front += s; else back += s;
      });
      return { p, gross, toPar: gross - parPlayed, played, front, back };
    }).filter(r => r.played > 0).sort((a, b) => a.toPar - b.toPar);

    ranked.forEach((r, i) => {
      const nine = holes.length === 18 && r.played === 18
        ? '  (out ' + r.front + ' · in ' + r.back + ')'
        : (r.played < holes.length ? '  thru ' + r.played : '');
      lines.push((i + 1) + '. ' + r.p.name + ' — ' + r.gross + ' (' + _toParLabel(r.toPar) + ')' + nine);
    });

    if (o.gameResults && o.gameResults.length) {
      lines.push('');
      lines.push('🏆 Games');
      o.gameResults.forEach(g => lines.push('• ' + g.name + ': ' + g.status));
    }

    if (o.payouts) {
      const owed = round.players
        .map(p => ({ p, v: o.payouts[p.id] || 0 }))
        .filter(x => Math.abs(x.v) >= 0.005)
        .sort((a, b) => b.v - a.v);
      if (owed.length) {
        lines.push('');
        lines.push('💵 Money');
        owed.forEach(x => lines.push('• ' + x.p.name + ': ' + (x.v > 0 ? '+' : '−') + '$' + Math.abs(x.v).toFixed(2).replace(/\.00$/, '')));
      }
    }

    lines.push('');
    lines.push('Scored with PlayPal 🏌️');
    return lines.join('\n');
  }

  function _csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Hole-by-hole CSV: one row per hole, strokes (and putts) per player, totals.
  // A chip-in exports as a real 0, an untracked hole as an empty cell.
  function scorecardCSV(round, scores, putts) {
    const W = (typeof window !== 'undefined') ? window : globalThis;
    const holes = round.course.holes || [];
    const players = round.players;
    const head = ['Hole', 'Par', 'Hdcp', 'Yds']
      .concat(players.map(p => p.name))
      .concat(putts ? players.map(p => p.name + ' putts') : []);
    const rows = [head];
    holes.forEach((h, i) => {
      rows.push(
        [h.num, h.par, h.hdcp, h.yds || '']
          .concat(players.map(p => (scores[p.id] && scores[p.id][i]) || ''))
          .concat(putts ? players.map(p => W.puttCellText(putts[p.id] && putts[p.id][i], '')) : [])
      );
    });
    const totalPar = holes.reduce((a, h) => a + h.par, 0);
    rows.push(
      ['TOTAL', totalPar, '', '']
        .concat(players.map(p => (scores[p.id] || []).reduce((a, s) => a + (s || 0), 0) || ''))
        .concat(putts ? players.map(p => W.sumPutts(putts[p.id]) || '') : [])
    );
    return rows.map(r => r.map(_csvCell).join(',')).join('\n');
  }

  // navigator.share when available, clipboard otherwise.
  // cb receives 'shared' | 'copied' | 'failed'.
  function share(payload, cb) {
    const done = (how) => { cb && cb(how); };
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: payload.title || 'PlayPal Round', text: payload.text })
        .then(() => done('shared'))
        .catch((e) => {
          if (e && e.name === 'AbortError') { done('failed'); return; }
          _copy(payload.text, done);
        });
      return;
    }
    _copy(payload.text, done);
  }

  function _copy(text, done) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done('copied')).catch(() => done('failed'));
    } else {
      done('failed');
    }
  }

  // ── Settlement ─────────────────────────────────────────────────────────────
  // Turns a payout ledger into the shortest list of "A pays B" transfers.
  // Greedy: each creditor's credit is consumed before moving on, so debtors are
  // not all routed to the same winner.
  function settleDebts(players, payouts) {
    const ledger = Object.fromEntries(players.map(p => [p.id, payouts[p.id] || 0]));
    const out = [];
    players
      .filter(p => ledger[p.id] < -0.005)
      .sort((a, b) => ledger[a.id] - ledger[b.id])
      .forEach(debtor => {
        let owed = Math.abs(ledger[debtor.id]);
        const creditors = players
          .filter(p => ledger[p.id] > 0.005)
          .sort((a, b) => ledger[b.id] - ledger[a.id]);
        for (const creditor of creditors) {
          if (owed <= 0.005) break;
          const transfer = Math.min(owed, ledger[creditor.id]);
          if (transfer > 0.005) {
            out.push({ from: debtor, to: creditor, amount: Math.round(transfer * 100) / 100 });
            ledger[creditor.id] -= transfer;
            owed -= transfer;
          }
        }
        ledger[debtor.id] = -owed;
      });
    return out;
  }

  // A Venmo charge link for one debt. Returns both the app deep link and the
  // web fallback; the caller decides which to open. `null` when the payer has
  // no handle on file — there is nothing honest to link to.
  function venmoRequest(debt, note) {
    const handle = String((debt.from && debt.from.venmo) || '').trim().replace(/^@/, '');
    if (!handle) return null;
    const amount = Math.abs(Math.round((debt.amount || 0) * 100) / 100).toFixed(2);
    const q = 'txn=charge&amount=' + amount + '&note=' + encodeURIComponent(note || 'PlayPal golf');
    return {
      handle,
      amount,
      deepLink: 'venmo://paycharge?recipients=' + encodeURIComponent(handle) + '&' + q,
      webLink:  'https://venmo.com/' + encodeURIComponent(handle) + '?' + q,
    };
  }

  // ── Round report ───────────────────────────────────────────────────────────
  // One place that knows what "everything about this round" means, so the
  // on-screen summary, the email and the share sheet can never disagree.
  //
  //   round: { players, course, formats, games, date?, teeId?, startingTee?, tripName? }
  //   data:  { scores, putts, popFlags, wolfData, bbbData, teeBallData, firData, girData }
  //
  // Returns { subject, short, full, payouts, debts, gameLines }.
  //   short — compact, safe to hand to a mailto: URL
  //   full  — everything, including the hole-by-hole grid (share sheet / clipboard)
  function roundReport(round, data) {
    const W = (typeof window !== 'undefined') ? window : globalThis;
    const d = data || {};
    const players = round.players || [];
    const course  = round.course || { holes: [], name: 'Course' };
    const holes   = course.holes || [];
    const scores  = d.scores || {};
    const dropouts = d.dropouts || round.dropouts || {};
    const money   = (v) => W.fmtMoney(v);
    const signed  = (v) => W.fmtMoney(v, { signed: true });

    const payouts = W.calcRoundPayouts ? W.calcRoundPayouts(round, d) : {};
    const debts   = settleDebts(players, payouts);
    const anyMoney = players.some(p => Math.abs(payouts[p.id] || 0) > 0.005);

    const parTotal = holes.reduce((a, h) => a + (h.par || 0), 0);
    const dateStr  = round.date || new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    const subject  = 'Scorecard — ' + course.name + ' — ' + (round.date || new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }));

    // ── Leaderboard ──────────────────────────────────────────────────────────
    const ranked = players.map(p => {
      const arr = scores[p.id] || [];
      let gross = 0, parPlayed = 0, played = 0;
      holes.forEach((h, i) => { const s = arr[i]; if (s) { gross += s; parPlayed += h.par; played++; } });
      return { p, gross, toPar: gross - parPlayed, played, wd: W.isDropped(dropouts, p.id) };
    }).sort((a, b) => (a.played === 0) - (b.played === 0) || a.toPar - b.toPar || a.gross - b.gross);

    // ── Per-game results (money games + engine games), with money ────────────
    const gameLines = [];
    (round.formats || []).forEach(f => {
      const info = (W.FORMAT_INFO || {})[f.type] || { label: f.type };
      let pay = {};
      try {
        const ptm = f.type === 'passmoney' && players.length
          ? W.computePTMState(scores, d.putts || {}, players, course, players[0].id, dropouts) : { holderId:null };
        pay = W.calcAllPayouts(scores, d.wolfData || {}, players, course, [f], [], ptm.holderId,
                               d.popFlags || {}, null, d.bbbData || {}, d.teeBallData || {}, { dropouts });
      } catch (e) { pay = {}; }
      gameLines.push({
        name: info.label,
        detail: _formatDetail(W, f, round, d, players, course),
        rows: players.map(p => ({ name: p.name, amount: pay[p.id] || 0 })),
        hasMoney: players.some(p => Math.abs(pay[p.id] || 0) > 0.005),
      });
    });
    (round.games || []).forEach(g => {
      let res = null, pay = {};
      const raw = { course, players, scores, startingTee: round.startingTee,
                    stats: { putts: d.putts || {}, fir: d.firData || {}, gir: d.girData || {} },
                    dropouts,
                    gameState: { wolf: d.wolfData || {}, bbb: d.bbbData || {} } };
      try { res = W.MatchEngine.compute(g, raw); pay = W.MatchEngine.payouts(g, raw, res); }
      catch (e) { return; }
      gameLines.push({
        name: res.name,
        detail: res.status + (res.basis ? ' (' + res.basis + ')' : ''),
        entries: (res.entries || []).map(e => e.label + ' ' + e.totalLabel + (e.detail ? ' — ' + e.detail : '')),
        rows: players.filter(p => pay[p.id] !== undefined).map(p => ({ name: p.name, amount: pay[p.id] || 0 })),
        hasMoney: Number(g.config && g.config.stake) > 0,
      });
    });

    // ── Body assembly ────────────────────────────────────────────────────────
    // `opts` drops optional detail. A mailto: URL has a hard practical ceiling
    // (iOS Mail silently truncates past roughly 2KB of ENCODED body), so the
    // mail version is assembled at the richest level that actually fits and the
    // full card goes on the clipboard instead of being silently cut in half.
    const netLines  = _netLines(W, round, scores, players, course);
    const statLines = _statLines(players, holes, d);

    function body(opts) {
      const o = opts || {};
      const s = [];
      s.push(course.name + (round.tripName ? ' · ' + round.tripName : ''));
      s.push(dateStr + ' · par ' + parTotal + ' · ' + holes.length + ' holes');
      s.push('');
      s.push('LEADERBOARD');
      ranked.forEach((r, i) => {
        if (!r.played) { s.push('  ' + r.p.name + ' — no scores'); return; }
        s.push('  ' + (i + 1) + '. ' + r.p.name + ' — ' + r.gross + ' (' + _toParLabel(r.toPar) + ')'
               + (r.wd ? ' — walked in after ' + r.played
                       : (r.played < holes.length ? ' thru ' + r.played : '')));
      });

      if (o.net !== false && netLines.length) { s.push(''); s.push('NET'); netLines.forEach(l => s.push('  ' + l)); }

      if (gameLines.length) {
        s.push('');
        s.push('GAMES');
        gameLines.forEach(g => {
          s.push('  ' + g.name + (g.detail ? ' — ' + g.detail : ''));
          if (o.entries !== false) (g.entries || []).forEach(e => s.push('     ' + e));
          if (g.hasMoney) {
            g.rows.filter(r => Math.abs(r.amount) > 0.005)
                  .sort((a, b) => b.amount - a.amount)
                  .forEach(r => s.push('     ' + r.name + ': ' + signed(r.amount)));
          }
        });
      }

      if (o.stats !== false && statLines.length) { s.push(''); s.push('STATS'); statLines.forEach(l => s.push('  ' + l)); }

      s.push('');
      s.push('MONEY');
      if (!anyMoney) {
        s.push('  Nothing on this round.');
      } else {
        players.map(p => ({ p, v: payouts[p.id] || 0 }))
               .filter(x => Math.abs(x.v) > 0.005)
               .sort((a, b) => b.v - a.v)
               .forEach(x => s.push('  ' + x.p.name + ': ' + signed(x.v)));
        s.push('');
        s.push('  SETTLE UP');
        if (!debts.length) s.push('    All square — nothing changes hands.');
        debts.forEach(t => {
          const v = o.venmoLinks === false ? null : venmoRequest(t, 'PlayPal · ' + course.name);
          s.push('    ' + t.from.name + ' pays ' + t.to.name + ' ' + money(t.amount)
                 + (v ? '  ' + v.webLink : (o.venmoLinks === false ? '' : '  (no Venmo handle on file)')));
        });
      }
      s.push('');
      s.push('Scored with PlayPal');
      return s.join('\n');
    }

    const short = body({});
    const full  = short.replace('\nScored with PlayPal',
      '\nSCORECARD\n' + _grid(players, holes, scores, d.putts) + '\nScored with PlayPal');

    // Progressively shed detail until the encoded body clears the mail budget.
    const limit = (d.mailLimit || 1800);
    const steps = [{}, { entries:false }, { entries:false, stats:false }, { entries:false, stats:false, net:false },
                   { entries:false, stats:false, net:false, venmoLinks:false }];
    let mail = short, trimmed = false;
    for (const step of steps) {
      mail = body(step);
      trimmed = Object.keys(step).length > 0;
      if (encodeURIComponent(mail).length <= limit) break;
    }
    const mailTruncated = encodeURIComponent(mail).length > limit;
    if (mailTruncated) {
      // Nothing left to shed (a very large field). Cut on a line boundary
      // rather than mid-word, and say so instead of pretending it is complete.
      while (encodeURIComponent(mail).length > limit && mail.indexOf('\n') !== -1) {
        mail = mail.slice(0, mail.lastIndexOf('\n'));
      }
      mail += '\n\n[Summary shortened to fit — the full card is on the sender\'s clipboard.]';
    }

    return { subject, short, full, mail, mailTrimmed: trimmed || mailTruncated, payouts, debts, gameLines, ranked, anyMoney };
  }

  // Per-format one-liner for the money games the engine doesn't describe.
  function _formatDetail(W, f, round, d, players, course) {
    const scores = d.scores || {};
    try {
      if (f.type === 'skins') {
        const { skins } = W.calcSkins(scores, players, course, f.stakes, d.popFlags || {});
        return players.map(p => p.name.split(' ')[0] + ' ' + (skins[p.id] || 0)).join(' · ');
      }
      if (f.type === 'wolf') {
        const pts = W.calcWolfStandings(scores, d.wolfData || {}, players, course);
        return players.map(p => p.name.split(' ')[0] + ' ' + (pts[p.id] || 0) + 'pt').join(' · ');
      }
      if (f.type === 'stableford') {
        return players.map(p => p.name.split(' ')[0] + ' ' + (course.holes || []).reduce((a, h, i) =>
          a + W.calcStablefordPoints(W.getAdjustedHoleScore(scores, d.popFlags || {}, p.id, i), h.par), 0) + 'pt').join(' · ');
      }
      if (f.type === 'bingobangobongo') {
        const st = W.calcBBBStandings(d.bbbData || {}, players);
        return players.map(p => p.name.split(' ')[0] + ' ' + ((st[p.id] || {}).total || 0) + 'pt').join(' · ');
      }
      if (f.type === 'teeball') {
        const st = W.calcTeeBallStandings(d.teeBallData || {}, players);
        return players.map(p => p.name.split(' ')[0] + ' ' + (st[p.id] || 0) + 'pt').join(' · ');
      }
      if (f.type === 'passmoney' && players.length) {
        const ptm = W.computePTMState(scores, d.putts || {}, players, course, players[0].id);
        const holder = players.find(p => p.id === ptm.holderId);
        return (holder ? holder.name + ' holds it' : '') + ' · ' + (ptm.log || []).length + ' passes';
      }
      if (f.type === 'nassau') {
        const matches = (f.nassauMatches && f.nassauMatches.length) ? f.nassauMatches : [f.nassauConfig].filter(Boolean);
        return matches.map(m => (m.playersInMatch || [])
          .map(id => (players.find(p => p.id === id) || {}).name || '?')
          .map(n => n.split(' ')[0]).join(' v ')).join(' · ');
      }
      if (f.type === 'markeymatch' && f.markeyMatchConfig) {
        const cfg = f.markeyMatchConfig;
        const nm = ids => (ids || []).map(id => ((players.find(p => p.id === id) || {}).name || '?').split(' ')[0]).join(' & ');
        const states = W.calcMarkeyMatchState(scores, cfg.markeyPopStrokes, players, f, (course.holes || []).length);
        return nm(cfg.team1) + ' v ' + nm(cfg.team2) + ' · ' + states.length + ' match' + (states.length === 1 ? '' : 'es');
      }
    } catch (e) { /* a detail line is never worth failing the report over */ }
    return '';
  }

  function _netLines(W, round, scores, players, course) {
    if (!W.HandicapService || !players.some(p => (p.handicap || 0) !== 0)) return [];
    try {
      const tee = W.CourseService ? W.CourseService.getTee(course, round.teeId)
                                  : { rating: course.rating, slope: course.slope };
      const hcp = W.HandicapService.playingHandicaps(players, course.holes, tee, { allowancePct: 100 });
      return players.map(p => {
        let net = 0;
        (course.holes || []).forEach((h, i) => {
          const s = scores[p.id] && scores[p.id][i];
          if (s) net += Math.max(1, s - hcp[p.id].strokes[i]);
        });
        return p.name + ' — net ' + (net || '—') + ' (CH ' + hcp[p.id].rounded + ')';
      });
    } catch (e) { return []; }
  }

  function _statLines(players, holes, d) {
    const W = (typeof window !== 'undefined') ? window : globalThis;
    const putts = d.putts || {}, fir = d.firData || {}, gir = d.girData || {}, extra = d.extraStats || {};
    const lines = [];
    players.forEach(p => {
      const bits = [];
      const tp = W.sumPutts(putts[p.id]);
      if (tp) bits.push(tp + ' putts');
      const chipIns = W.countZeroPutts(putts[p.id]);
      if (chipIns) bits.push(chipIns + ' chip-in' + (chipIns === 1 ? '' : 's'));
      const fa = fir[p.id] || [];
      const fElig = fa.filter((v, i) => (holes[i] || {}).par > 3 && v !== null).length;
      if (fElig) bits.push('FIR ' + fa.filter((v, i) => (holes[i] || {}).par > 3 && v === true).length + '/' + fElig);
      const ga = gir[p.id] || [];
      const gPlayed = ga.filter(v => v !== null).length;
      if (gPlayed) bits.push('GIR ' + ga.filter(v => v === true).length + '/' + gPlayed);
      const pen = Object.values(extra[p.id] || {}).reduce((a, h) => a + ((h && h.pen) || 0), 0);
      if (pen) bits.push(pen + ' penalt' + (pen === 1 ? 'y' : 'ies'));
      const ud = Object.values(extra[p.id] || {}).filter(h => h && h.ud === true).length;
      if (ud) bits.push(ud + ' up-and-down');
      if (bits.length) lines.push(p.name + ' — ' + bits.join(' · '));
    });
    return lines;
  }

  // Fixed-width hole-by-hole grid. Sized off the layout, so a nine-hole card
  // is nine columns wide.
  function _grid(players, holes, scores, putts) {
    const nameW = Math.max(6, ...players.map(p => p.name.length));
    const pad  = (s, w) => String(s).padStart(w);
    const lpad = (s, w) => String(s).padEnd(w);
    let out = lpad('HOLE', nameW + 2);
    holes.forEach(h => { out += pad(h.num, 4); });
    out += pad('TOT', 6) + pad('+/-', 6) + '\n';
    out += lpad('PAR', nameW + 2);
    holes.forEach(h => { out += pad(h.par, 4); });
    out += pad(holes.reduce((a, h) => a + h.par, 0), 6) + pad('—', 6) + '\n';
    out += '-'.repeat(nameW + 2 + holes.length * 4 + 12) + '\n';
    players.forEach(p => {
      out += lpad(p.name, nameW + 2);
      let tot = 0, par = 0;
      holes.forEach((h, i) => {
        const s = scores[p.id] && scores[p.id][i];
        out += pad(s || '·', 4);
        if (s) { tot += s; par += h.par; }
      });
      out += pad(tot || '—', 6) + pad(tot ? _toParLabel(tot - par) : '—', 6) + '\n';
    });
    const W = (typeof window !== 'undefined') ? window : globalThis;
    if (putts && W.hasAnyPutts(putts, players)) {
      players.forEach(p => {
        const arr = putts[p.id] || [];
        if (!W.countPuttHoles(arr)) return;
        out += lpad(p.name.split(' ')[0] + ' putts', nameW + 2);
        holes.forEach((_h, i) => { out += pad(W.puttCellText(arr[i], '·'), 4); });
        out += pad(W.sumPutts(arr), 6) + pad('', 6) + '\n';
      });
    }
    return out;
  }

  function downloadCSV(filename, csv) {
    if (typeof document === 'undefined') return false;
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) { return false; }
  }

  return {
    scorecardText,
    scorecardCSV,
    settleDebts,
    venmoRequest,
    roundReport,
    share,
    downloadCSV,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { SharingService });
}
