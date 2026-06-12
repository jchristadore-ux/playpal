// profileService.js — player profile model + derived career stats.
//
// Profiles extend the existing player object (so they keep syncing through the
// established `players` RTDB path with zero server-side changes):
//
//   { id, name, initials, color, handicap, ghin, ghinLogin, email, venmo,   // existing
//     preferredTee, dominantHand, homeCourseId, homeCourseName,             // new
//     favoriteFormats: [formatId], handicapSource: 'manual'|'provider',
//     handicapUpdatedAt }
//
// Career numbers are derived on demand from round history via StatsService —
// nothing is double-stored.

const ProfileService = (function () {

  const PROFILE_DEFAULTS = {
    preferredTee: '',
    dominantHand: 'R',          // 'R' | 'L'
    homeCourseId: '',
    homeCourseName: '',
    favoriteFormats: [],
    handicapSource: 'manual',
    handicapUpdatedAt: null,
  };

  function normalizePlayer(p) {
    if (!p) return p;
    const out = { ...PROFILE_DEFAULTS, ...p };
    if (!Array.isArray(out.favoriteFormats)) out.favoriteFormats = [];
    if (out.dominantHand !== 'L') out.dominantHand = 'R';
    return out;
  }

  function normalizeAll(players) {
    return (players || []).map(normalizePlayer);
  }

  // Career summary for one player from saved round data records
  // (StatsService.roundDataFromSnapshot output).
  function career(pid, dataList) {
    const SS = (typeof window !== 'undefined' && window.StatsService) || StatsService;
    const agg = SS.aggregatePlayer(dataList, pid);

    const courseCounts = {};
    const formatCounts = {};
    dataList.forEach(d => {
      if (!d || !d.scores || !d.scores[pid] || !(d.scores[pid] || []).some(s => s > 0)) return;
      const cn = d.course && d.course.name;
      if (cn) courseCounts[cn] = (courseCounts[cn] || 0) + 1;
      (d.games || []).forEach(g => { formatCounts[g.formatId] = (formatCounts[g.formatId] || 0) + 1; });
      (d.formats || []).forEach(f => { formatCounts[f.type] = (formatCounts[f.type] || 0) + 1; });
    });
    const top = (counts) => {
      const keys = Object.keys(counts);
      if (!keys.length) return null;
      keys.sort((a, b) => counts[b] - counts[a]);
      return { name: keys[0], count: counts[keys[0]] };
    };

    return {
      ...agg,
      mostPlayedCourse: top(courseCounts),
      mostPlayedFormat: top(formatCounts),
    };
  }

  return {
    PROFILE_DEFAULTS,
    normalizePlayer,
    normalizeAll,
    career,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { ProfileService });
}
