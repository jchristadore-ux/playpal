# EGT 2026 Cup — Official Pairings & Schedule

Single source of truth: [`fixtures/egt-2026-seed.json`](../fixtures/egt-2026-seed.json)
(`rounds[].teeTimes`, `rounds[].teams`, `rounds[].pairings`). Regenerate the
embedded copy with `node scripts/gen-seed.mjs`. The Rounds page, the **Pairings**
tab, EGT SportsCenter, the Bottom Line ticker and the printable packet all read
from this file, so nothing here is entered twice.

Players (handicap index): **John** 18.0 · **Brian** 23.0 · **TJ** 28.0 · **Mike** 28.0.

## Master schedule & tee times

| Round | Day | Course | Tee time(s) | Format |
|------|-----|--------|-------------|--------|
| R1 | Tue Jul 21 | Minerals | Loop 1 **10:00 AM** · Loop 2 **12:36 PM** | Bingo-Bango-Bongo + The Nines (flat / stakes only) |
| R2 | Wed Jul 22 AM | Ballyowen | **7:30 AM** | Four-ball match play (90%) + Nassau |
| R3 | Wed Jul 22 PM | Wild Turkey | **1:45 PM** | Wolf |
| R4 | Thu Jul 23 AM | Crystal Springs | **7:30 AM** | 2-v-2 aggregate net Stableford (85%) |
| R5 | Thu Jul 23 PM | Cascades | Loop 1 **2:02 PM** · Loop 2 **4:08 PM** | Bingo-Bango-Bongo + round-robin 1v1 match play |
| R6 | Fri Jul 24 | Black Bear | **8:36 AM** | Championship singles + net Stableford |

## Pairings by round

Each round is a single foursome (R1 is a threesome — Brian arrives for R2). "Cart
pairs" are the riding partners; "teams" are the competitive sides where the
format has fixed teams.

### R1 · Minerals — 10:00 AM / 12:36 PM
- **Foursome:** John, TJ, Mike (threesome)
- **Cart pairs:** John + TJ · Mike (solo)
- **Format:** Bingo-Bango-Bongo (loop 1, gross) + The Nines (loop 2, net) — flat, no Cup points.
- **Why:** Opening threesome before Brian arrives. R1 awards no Cup points, so carts are set purely for pace of play, spreading the field's low man (John) across carts.

### R2 · Ballyowen — 7:30 AM
- **Foursome:** John, Brian, TJ, Mike
- **Teams:** John + Mike vs Brian + TJ
- **Cart pairs:** John + Mike · Brian + TJ (carts follow teams)
- **Format:** Four-ball best-ball match play (90%) + Nassau (front · back · overall).
- **Why:** First team round, deliberately balanced to avoid a super-team. Rather than pairing the two lowest handicaps together, John (low) partners Mike (high) against Brian + TJ — **36 vs 41** combined course handicap, a raw gap of just 5 that the 90% allowance and best-ball scoring tighten further. Because R5 is now individual, R2 and R4 are the only team rounds, so both use a balanced split and the lopsided low-low pairing is never used.

### R3 · Wild Turkey — 1:45 PM
- **Foursome:** John, Brian, TJ, Mike
- **Teams:** none (Wolf is individual; the Wolf rotates partners hole by hole)
- **Cart pairs:** John + Brian · TJ + Mike
- **Format:** Wolf (100% off the low, best net ball; ±units per opponent, ties push).
- **Why:** Carts rotate to the one pairing not used as R2 carts, so after two rounds every player has ridden with two different people. Wolf order (TJ, Mike, Brian, John) is independent of cart assignment.

### R4 · Crystal Springs — 7:30 AM
- **Foursome:** John, Brian, TJ, Mike
- **Teams:** John + TJ vs Brian + Mike
- **Cart pairs:** John + TJ · Brian + Mike (carts follow teams)
- **Format:** 2-v-2 aggregate net Stableford (85%) — both partners' points count.
- **Why:** New balanced teams — pairing the low man with a high man on each side (**45 vs 50** combined course handicap, Δ5). These are the last two cart pairings not yet used, so after R4 every pair has shared a cart exactly once.

### R5 · Cascades — 2:02 PM / 4:08 PM
- **Foursome:** John, Brian, TJ, Mike
- **Teams:** none (individual — full-18 Bingo-Bango-Bongo + round-robin 1v1 match play)
- **Cart pairs:** John + Mike · Brian + TJ
- **Format:** Bingo-Bango-Bongo (gross) + round-robin 1v1 match play (Nassau front/back/overall).
- **Why:** Every player faces every other head-to-head (all six 1v1s), which evens out the opponent matrix. Carts keep the rotation flat so everyone has still ridden with all three others.

### R6 · Black Bear — 8:36 AM
- **Foursome:** John, Brian, TJ, Mike
- **Teams:** seeded singles off the R5 standings — 1v2 (Championship), 3v4 (Bronze)
- **Cart pairs:** John + Brian · TJ + Mike
- **Format:** Championship singles + individual net Stableford (full dots).
- **Why:** Match opponents are only known Friday morning (seeded off standings), so carts are set for riding balance. Across all five riding rounds every player has shared a cart with each of the other three, and no pair rides together more than twice.

## Fairness analysis

Computed live on the **Pairings** tab from the schedule above.

- **Teammate spread 0–1.** Team rounds R2 (John+Mike / Brian+TJ) and R4
  (John+TJ / Brian+Mike) give four of the six pairs exactly one round together;
  John+Brian and TJ+Mike are never teammates (unavoidable with two team rounds).
- **Opponent spread 3–5.** Team-round cross-matchups plus the all-play-all
  individual rounds (R1, R3 Wolf, R5 round-robin) spread head-to-head play
  evenly. R6 singles are seeded off the standings and excluded (TBD pre-trip).
- **Cart coverage: complete.** Every player rides with all three others at least
  once; no pair shares a cart more than twice (spread 1–2).
- **Team balance: avg Δ 5 course-handicap strokes.** Both team rounds split
  36 vs 41 (R2) and 45 vs 50 (R4) — before the 90% / 85% allowances and
  best-ball / aggregate scoring compress them further. No super-teams.

The schedule is optimized globally (across the whole trip), not one round at a
time: the two team rounds take the two balanced partitions, and the individual
rounds' cart assignments fill in the remaining pairings so the riding rotation
covers everyone.
