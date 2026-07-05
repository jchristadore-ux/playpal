// egtHandicap.js — EGT tournament handicap + stroke-allocation core.
//
// Pure, deterministic math (no storage, no DOM) so it runs identically in the
// browser and under `node --test`. This is the module every scoring calculator
// leans on: it turns a Handicap Index + tee + allowance into a Course Handicap,
// a Playing Handicap, and — critically — the exact list of holes a player pops.
//
// Glossary
//   HI  Handicap Index      — player.handicapIndex (portable)
//   CH  Course Handicap     — round(HI*Slope/113 + (CR - Par))
//   PH  Playing Handicap    — round(CH * allowance)
//   pop a received stroke landed on a specific hole by stroke index (SI)
//
// The allocation rule (seed §2) is the whole ballgame: it must reproduce every
// strokeAllocations[*].holes array in egt-2026-seed.json byte-for-byte.

const EgtHandicap = (function () {

  // Standard golf rounding: half up. floor(x + 0.5). -0.5 -> 0, 2.5 -> 3.
  function roundHalfUp(x) {
    return Math.floor(x + 0.5);
  }

  // CH = round( HI*Slope/113 + (CR - Par) ).
  // For a 9-hole course played as two loops, pass the 18-hole-equivalent CR and
  // Par (i.e. nineCR*2, ninePar*2) — the caller decides; this stays a pure fn.
  function courseHandicap(hi, slope, cr, par) {
    return roundHalfUp((hi * slope) / 113 + (cr - par));
  }

  // 9-hole Course Handicap for a single loop: half the index against the
  // 9-hole rating/par (WHS 9-hole treatment). Used by the loop-2 Nines game.
  function nineHoleCourseHandicap(hi, nineSlope, nineCr, ninePar) {
    return roundHalfUp((hi * 0.5 * nineSlope) / 113 + (nineCr - ninePar));
  }

  // PH = round(CH * allowance). allowance is a fraction (0.9 = 90%).
  function playingHandicap(ch, allowance) {
    const a = (typeof allowance === 'number' && allowance >= 0) ? allowance : 1;
    return roundHalfUp(ch * a);
  }

  // Distribute N strokes across a set of holes by stroke index.
  //   holes: [{ hole, si }] where si runs 1..holes.length (1 = hardest).
  //   N:     stroke count (may exceed holes.length → a 2nd stroke on the
  //          lowest-SI holes; may be negative for a plus player → strokes come
  //          off the highest-SI holes first).
  // Returns [{ hole, strokes }] for holes with strokes !== 0, in hole order,
  // matching the seed's shape exactly. Holes with a null/undefined si are
  // treated as "pending" and this returns null to signal SI isn't verified.
  function allocatePops(n, holes) {
    if (!Array.isArray(holes) || holes.length === 0) return [];
    if (holes.some(h => h.si === null || h.si === undefined)) return null; // pending SI
    const m = holes.length;
    const count = Math.trunc(n) || 0;
    if (count === 0) return [];
    const sign = count < 0 ? -1 : 1;
    const mag = Math.abs(count);
    const base = Math.floor(mag / m);
    const extra = mag % m;
    // For positive strokes, the extra lands on si 1..extra (hardest).
    // For negative (plus) strokes, it comes off the EASIEST holes first,
    // i.e. si m, m-1, ... so a hole qualifies when si > m - extra.
    const out = [];
    holes
      .slice()
      .sort((a, b) => a.hole - b.hole)
      .forEach(h => {
        const gets = sign > 0
          ? (h.si <= extra ? 1 : 0)
          : (h.si > m - extra ? 1 : 0);
        const strokes = (base + gets) * sign;
        if (strokes !== 0) out.push({ hole: h.hole, strokes });
      });
    return out;
  }

  // Total received strokes represented by a pops array (sum of per-hole strokes).
  function popsTotal(pops) {
    if (!Array.isArray(pops)) return 0;
    return pops.reduce((a, p) => a + (p.strokes || 0), 0);
  }

  // Net score on a hole given gross and the pops the player has there.
  function netOnHole(gross, popsOnHole) {
    if (!gross && gross !== 0) return null;
    return gross - (popsOnHole || 0);
  }

  // How many pops a player has on a specific hole, from a pops array.
  function popsOnHole(pops, hole) {
    if (!Array.isArray(pops)) return 0;
    const found = pops.find(p => p.hole === hole);
    return found ? found.strokes : 0;
  }

  // ── Stroke-index verification / entry (seed §6) ──────────────────────────
  // Validate that `arr` is a permutation of 1..n (every index exactly once).
  function isPermutation(arr, n) {
    if (!Array.isArray(arr) || arr.length !== n) return false;
    const seen = new Set();
    for (const v of arr) {
      const num = Number(v);
      if (!Number.isInteger(num) || num < 1 || num > n) return false;
      if (seen.has(num)) return false;
      seen.add(num);
    }
    return true;
  }

  // Derive an 18-hole stroke index from a 9-hole card SI (values 1..9) for a
  // course played as two loops: loop 1 takes the odd 18-slots, loop 2 the even.
  // nineSi is the per-hole 9-hole SI for holes 1..9 (index 0 = hole 1).
  // Returns an array of 18 values (index 0 = hole 1 .. index 17 = hole 18).
  function eighteenFromNine(nineSi) {
    if (!isPermutation(nineSi, 9)) {
      throw new Error('9-hole stroke index must be a permutation of 1..9');
    }
    const out = new Array(18);
    for (let i = 0; i < 9; i++) {
      out[i] = nineSi[i] * 2 - 1;        // loop 1 → odd 18-hole SI
      out[i + 9] = nineSi[i] * 2;        // loop 2 → even 18-hole SI
    }
    return out;
  }

  // Convert an 18-hole SI to the 9-hole SI for the loop that hole sits in
  // (ceil(si/2)). Used to score loop-only games (Nines, per-loop scramble/alt).
  function nineHoleSi(si18) {
    return Math.ceil(si18 / 2);
  }

  return {
    roundHalfUp,
    courseHandicap,
    nineHoleCourseHandicap,
    playingHandicap,
    allocatePops,
    popsTotal,
    netOnHole,
    popsOnHole,
    isPermutation,
    eighteenFromNine,
    nineHoleSi,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtHandicap });
}
