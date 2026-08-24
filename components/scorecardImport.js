// scorecardImport.js — turning a photo of a scorecard into a course.
//
// There is no OCR here and the app does not pretend otherwise: nothing about a
// scorecard photo is uploaded, sent to a service, or guessed at. What the app
// does is put the picture on screen next to the entry grid and take the numbers
// in whatever shape they arrive — typed, pasted from a club's website, or read
// off the photo — so adding a course that isn't in the list takes a minute.
//
// The parser is deliberately forgiving. Real scorecard text arrives as:
//   "Par  4 5 3 4 4 5 3 4 4  36  4 4 3 4 5 4 4 3 5  36  72"
//   "HCP 11 7 13 17 9 3 15 1 5 2 10 12 8 4 14 16 6 18"
//   or three rows of nine, or one flat run of numbers with junk in between.

const ScorecardImport = (function () {

  // Every integer in a line, in order.
  function _nums(line) {
    const out = [];
    const re = /-?\d+/g;
    let m;
    while ((m = re.exec(line)) !== null) out.push(parseInt(m[0], 10));
    return out;
  }

  function _label(line) {
    return String(line || '').toLowerCase();
  }

  // OUT/IN/TOT subtotals sit inside a scorecard row and must not be mistaken
  // for hole values. Given a run that is 2 or 3 longer than the hole count,
  // drop the subtotal positions.
  function _stripSubtotals(vals, holeCount) {
    if (vals.length === holeCount) return vals;
    const half = Math.floor(holeCount / 2);
    // …9 holes, OUT, 9 holes, IN, TOTAL
    if (holeCount === 18 && vals.length === 21) {
      return vals.slice(0, 9).concat(vals.slice(10, 19));
    }
    // …9 holes, OUT, 9 holes, IN
    if (holeCount === 18 && vals.length === 20) {
      return vals.slice(0, 9).concat(vals.slice(10, 19));
    }
    // …holes, TOTAL
    if (vals.length === holeCount + 1) return vals.slice(0, holeCount);
    // …front nine + OUT on a nine-hole card
    if (vals.length === half + 1 && holeCount === 9) return vals.slice(0, holeCount);
    return vals;
  }

  const _isPar   = (vals) => vals.every(v => v >= 3 && v <= 6);
  const _isYards = (vals) => vals.every(v => v >= 60 && v <= 800) && vals.some(v => v >= 100);
  const _isIndex = (vals, n) => {
    if (!vals.every(v => v >= 1 && v <= n)) return false;
    return new Set(vals).size === vals.length;    // a stroke index is a permutation
  };

  // Reads whatever the golfer pasted and works out which row is which.
  //   text      — free-form; rows may be separated by newlines, tabs or commas
  //   holeCount — 9 or 18
  // Returns { par, yds, hdcp, notes } — any row it could not identify is null
  // and the notes say what happened, so the UI can be honest about it.
  function parseScorecard(text, holeCount) {
    const n = holeCount === 9 ? 9 : 18;
    const half = Math.floor(n / 2);
    const raw = String(text || '');
    const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

    const result = { par: null, yds: null, hdcp: null, notes: [] };

    // Pass 1 — labelled rows win outright, even if the numbers are ambiguous.
    const labelled = { par: /\bpar\b/, yds: /\b(yard|yds|yd|length|dist)/, hdcp: /\b(hcp|hdcp|handicap|index|s\.?i\.?|stroke)/ };
    const unlabelled = [];

    for (const line of lines) {
      const label = _label(line);
      const vals = _stripSubtotals(_nums(line), n);
      if (vals.length < 2) continue;
      let claimed = null;
      for (const key of ['par', 'yds', 'hdcp']) {
        if (labelled[key].test(label)) { claimed = key; break; }
      }
      if (claimed && !result[claimed] && vals.length === n) { result[claimed] = vals; continue; }
      if (claimed && !result[claimed] && vals.length === half) {
        unlabelled.push({ vals, claimed });   // half a card — pair it up below
        continue;
      }
      unlabelled.push({ vals, claimed: null });
    }

    // Pass 2 — stitch consecutive half-rows (front nine / back nine) together.
    const stitched = [];
    for (let i = 0; i < unlabelled.length; i++) {
      const a = unlabelled[i];
      const b = unlabelled[i + 1];
      if (n === 18 && a.vals.length === 9 && b && b.vals.length === 9 &&
          (a.claimed === b.claimed || !a.claimed || !b.claimed)) {
        stitched.push({ vals: a.vals.concat(b.vals), claimed: a.claimed || b.claimed });
        i++;
      } else {
        stitched.push(a);
      }
    }

    // Pass 3 — a single flat run of numbers, e.g. everything on one line.
    if (!stitched.some(x => x.vals.length === n)) {
      const flat = _nums(raw);
      for (const size of [n * 3, n * 2, n]) {
        if (flat.length === size) {
          for (let k = 0; k < size / n; k++) stitched.push({ vals: flat.slice(k * n, (k + 1) * n), claimed: null });
          break;
        }
      }
    }

    // Pass 4 — identify what is left by shape.
    for (const row of stitched) {
      if (row.vals.length !== n) continue;
      const key = row.claimed
        || (_isPar(row.vals)   ? 'par'
        :  _isIndex(row.vals, n) ? 'hdcp'
        :  _isYards(row.vals)  ? 'yds' : null);
      if (key && !result[key]) result[key] = row.vals;
    }

    // A par row and a stroke index can look alike on a nine-hole card
    // (3–6 vs 1–9). Par never repeats a full permutation, an index always does.
    if (result.par && !result.hdcp && _isIndex(result.par, n) && !_isPar(result.par)) {
      result.hdcp = result.par; result.par = null;
    }

    if (!result.par)  result.notes.push('No par row found — enter par below.');
    if (!result.hdcp) result.notes.push('No stroke-index row found — enter it below (it drives every handicap stroke).');
    if (!result.yds)  result.notes.push('No yardages found — they are optional.');
    return result;
  }

  // Validates a parsed card the way the course builder needs it.
  function validate(parsed, holeCount) {
    const n = holeCount === 9 ? 9 : 18;
    const problems = [];
    if (parsed.par) {
      if (parsed.par.length !== n) problems.push(`Par row has ${parsed.par.length} holes, expected ${n}.`);
      const total = parsed.par.reduce((a, b) => a + b, 0);
      const lo = n === 9 ? 31 : 62, hi = n === 9 ? 40 : 80;
      if (total < lo || total > hi) problems.push(`Total par of ${total} looks wrong for ${n} holes.`);
    }
    if (parsed.hdcp) {
      const sorted = parsed.hdcp.slice().sort((a, b) => a - b);
      const expected = Array.from({ length: n }, (_, i) => i + 1);
      if (sorted.join(',') !== expected.join(',')) {
        problems.push(`Stroke indexes must be 1–${n} with no repeats.`);
      }
    }
    return problems;
  }

  return { parseScorecard, validate };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { ScorecardImport });
}
