// tripUtils.js — Golf Trip aggregation helpers.
// All statistics delegate to existing window.* functions from gameUtils.js; no new engines.

(function () {

  function _playerFromRounds(pid, tripRounds) {
    for (var i = 0; i < tripRounds.length; i++) {
      var r = tripRounds[i].round || tripRounds[i];
      if (r && r.players) {
        for (var j = 0; j < r.players.length; j++) {
          if (r.players[j].id === pid) return r.players[j];
        }
      }
    }
    return { id: pid, name: 'Unknown', color: '#8A9E8A', initials: '?' };
  }

  // Returns a map of playerId → stats object.
  // tripRounds: array of Firestore round docs { syncCode, round: {...}, savedAt }
  function aggregateTripPlayerStats(tripRounds) {
    var stats = {};

    tripRounds.forEach(function (rd) {
      var round = rd.round || rd;
      if (!round || !round.holeScores || !round.course) return;
      var hs      = round.holeScores;
      var course  = round.course;
      var payouts = round.payouts || {};

      Object.keys(hs).forEach(function (pid) {
        if (!stats[pid]) {
          stats[pid] = {
            player:           _playerFromRounds(pid, tripRounds),
            rounds:           0,
            totalStrokes:     0,
            totalVsPar:       0,
            totalEarnings:    0,
            birdies:          0,
            eagles:           0,
            pars:             0,
            bogeys:           0,
            doubles:          0,
            roundScores:      [],
            totalPutts:       0,
            fairwaysHit:      0,
            fairwaysEligible: 0,
            girsHit:          0,
            girsEligible:     0,
          };
        }

        var s          = stats[pid];
        var holes      = hs[pid];
        var rStrokes   = 0;
        var rVsPar     = 0;
        var played     = 0;

        (holes || []).forEach(function (h, i) {
          var par = ((course.holes || [])[i] || {}).par || 4;

          if (h.strokes) {
            var diff = h.strokes - par;
            rStrokes += h.strokes;
            rVsPar   += diff;
            played++;
            if (diff <= -2)       s.eagles++;
            else if (diff === -1) s.birdies++;
            else if (diff ===  0) s.pars++;
            else if (diff ===  1) s.bogeys++;
            else                  s.doubles++;

            // FIR: par 4/5 holes only; only counted when fir field is explicitly boolean
            if (par !== 3) {
              s.fairwaysEligible++;
              if (h.fir === true) s.fairwaysHit++;
            }

            // GIR: derived from strokes and putts (requires both to be set)
            if (h.putts > 0) {
              s.girsEligible++;
              if ((h.strokes - h.putts) <= (par - 2)) s.girsHit++;
            }
          }

          // Putts (independent of strokes guard — count all recorded putts)
          if (h.putts > 0) s.totalPutts += h.putts;
        });

        if (played > 0) {
          s.rounds++;
          s.totalStrokes  += rStrokes;
          s.totalVsPar    += rVsPar;
          s.totalEarnings += (payouts[pid] || 0);
          s.roundScores.push(rStrokes);
        }
      });
    });

    return stats;
  }

  // Returns leaderboard array sorted by avg vsPar (ascending).
  function buildTripLeaderboard(tripRounds) {
    var stats = aggregateTripPlayerStats(tripRounds);
    return Object.values(stats)
      .filter(function (s) { return s.rounds > 0; })
      .map(function (s) {
        var mean     = s.totalStrokes / s.rounds;
        var variance = s.roundScores.length > 1
          ? s.roundScores.reduce(function (a, v) { return a + Math.pow(v - mean, 2); }, 0) / s.roundScores.length
          : 0;
        return Object.assign({}, s.player, {
          rounds:           s.rounds,
          totalStrokes:     s.totalStrokes,
          totalVsPar:       s.totalVsPar,
          avgVsPar:         s.totalVsPar  / s.rounds,
          avgStrokes:       s.totalStrokes / s.rounds,
          totalEarnings:    s.totalEarnings,
          birdies:          s.birdies,
          eagles:           s.eagles,
          pars:             s.pars,
          bogeys:           s.bogeys,
          doubles:          s.doubles,
          stdDev:           Math.sqrt(variance),
          roundScores:      s.roundScores,
          totalPutts:       s.totalPutts,
          avgPuttsPerRound: s.rounds > 0 ? s.totalPutts / s.rounds : 0,
          firPct:           s.fairwaysEligible > 0 ? s.fairwaysHit / s.fairwaysEligible : null,
          girPct:           s.girsEligible   > 0 ? s.girsHit   / s.girsEligible   : null,
        });
      })
      .sort(function (a, b) { return a.avgVsPar - b.avgVsPar; });
  }

  // Returns array of award objects generated from aggregated trip data.
  function calculateTripAwards(tripRounds) {
    var lb = buildTripLeaderboard(tripRounds);
    if (!lb.length) return [];
    var awards = [];

    awards.push({
      id: 'champion', emoji: '🏆', title: 'Trip Champion',
      winner: lb[0],
      detail: (lb[0].avgVsPar >= 0 ? '+' : '') + lb[0].avgVsPar.toFixed(1) + ' avg',
    });

    var byBirdies = lb.slice().sort(function (a, b) { return b.birdies - a.birdies; });
    if (byBirdies[0] && byBirdies[0].birdies > 0) {
      awards.push({
        id: 'birdies', emoji: '🐦', title: 'Most Birdies',
        winner: byBirdies[0],
        detail: byBirdies[0].birdies + ' birdie' + (byBirdies[0].birdies !== 1 ? 's' : ''),
      });
    }

    var byEagles = lb.slice().sort(function (a, b) { return b.eagles - a.eagles; });
    if (byEagles[0] && byEagles[0].eagles > 0) {
      awards.push({
        id: 'eagles', emoji: '🦅', title: 'Most Eagles',
        winner: byEagles[0],
        detail: byEagles[0].eagles + ' eagle' + (byEagles[0].eagles !== 1 ? 's' : ''),
      });
    }

    var byEarnings = lb.slice().sort(function (a, b) { return b.totalEarnings - a.totalEarnings; });
    if (byEarnings[0] && byEarnings[0].totalEarnings > 0) {
      awards.push({
        id: 'money', emoji: '💰', title: 'Most Money Won',
        winner: byEarnings[0],
        detail: '+$' + byEarnings[0].totalEarnings.toFixed(0),
      });
    }

    var eligible = lb.filter(function (p) { return p.rounds >= 2; });
    if (eligible.length > 0) {
      var most = eligible.slice().sort(function (a, b) { return a.stdDev - b.stdDev; })[0];
      awards.push({
        id: 'consistent', emoji: '🎯', title: 'Most Consistent',
        winner: most,
        detail: '±' + most.stdDev.toFixed(1) + ' strokes',
      });
    }

    var bestRound = null;
    var bestVsPar = Infinity;
    tripRounds.forEach(function (rd) {
      var round = rd.round || rd;
      if (!round || !round.holeScores || !round.course) return;
      lb.forEach(function (p) {
        var hs = round.holeScores[p.id];
        if (!hs) return;
        var vsPar = hs.reduce(function (a, h, i) {
          return h.strokes ? a + h.strokes - (((round.course.holes || [])[i] || {}).par || 4) : a;
        }, 0);
        if (vsPar < bestVsPar) {
          bestVsPar = vsPar;
          bestRound = { player: p, vsPar: vsPar, course: round.course.name };
        }
      });
    });

    if (bestRound) {
      awards.push({
        id: 'bestround', emoji: '⭐', title: 'Best Single Round',
        winner: bestRound.player,
        detail: (bestRound.vsPar >= 0 ? '+' : '') + bestRound.vsPar + ' · ' + bestRound.course,
      });
    }

    var byPutts = lb.filter(function (p) { return p.avgPuttsPerRound > 0; })
                   .sort(function (a, b) { return a.avgPuttsPerRound - b.avgPuttsPerRound; });
    if (byPutts.length > 0) {
      awards.push({
        id: 'putting', emoji: '🕳️', title: 'Fewest Putts',
        winner: byPutts[0],
        detail: byPutts[0].avgPuttsPerRound.toFixed(1) + ' avg / round',
      });
    }

    var byFir = lb.filter(function (p) { return p.firPct !== null; })
                  .sort(function (a, b) { return b.firPct - a.firPct; });
    if (byFir.length > 0) {
      awards.push({
        id: 'fairways', emoji: '🌿', title: 'Best Fairways',
        winner: byFir[0],
        detail: Math.round(byFir[0].firPct * 100) + '% FIR',
      });
    }

    var byGir = lb.filter(function (p) { return p.girPct !== null; })
                  .sort(function (a, b) { return b.girPct - a.girPct; });
    if (byGir.length > 0) {
      awards.push({
        id: 'gir', emoji: '🟢', title: 'Best Greens in Regulation',
        winner: byGir[0],
        detail: Math.round(byGir[0].girPct * 100) + '% GIR',
      });
    }

    return awards;
  }

  Object.assign(window, {
    aggregateTripPlayerStats: aggregateTripPlayerStats,
    buildTripLeaderboard:     buildTripLeaderboard,
    calculateTripAwards:      calculateTripAwards,
  });

})();
