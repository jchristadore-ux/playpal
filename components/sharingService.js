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
  function scorecardCSV(round, scores, putts) {
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
          .concat(putts ? players.map(p => (putts[p.id] && putts[p.id][i]) || '') : [])
      );
    });
    const totalPar = holes.reduce((a, h) => a + h.par, 0);
    rows.push(
      ['TOTAL', totalPar, '', '']
        .concat(players.map(p => (scores[p.id] || []).reduce((a, s) => a + (s || 0), 0) || ''))
        .concat(putts ? players.map(p => (putts[p.id] || []).reduce((a, s) => a + (s || 0), 0) || '') : [])
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
    share,
    downloadCSV,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { SharingService });
}
