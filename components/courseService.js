// courseService.js — course catalog, normalization, tees, favorites, recents,
// and a provider interface so external course databases can plug in later.
//
// Normalized course shape (backward compatible — legacy fields are kept):
//   {
//     id, name, location, custom?,
//     holeCount: 9 | 18,
//     holes: [{ num, par, yds, hdcp }],          // yds = default tee yardage
//     tees:  [{ id, name, rating, slope, yds: [..] | null }],
//     rating, slope,                              // default tee (legacy mirror)
//   }

const CourseService = (function () {

  const FAV_KEY    = 'pp_fav_courses';
  const RECENT_KEY = 'pp_recent_courses';
  const RECENT_MAX = 10;

  function _storageGet(key, fallback) {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full / private mode — non-fatal */ }
  }

  // ── Normalization ──────────────────────────────────────────────────────────
  function normalizeCourse(course) {
    if (!course) return null;
    const holes = (course.holes || []).map((h, i) => ({
      num:  h.num || (i + 1),
      par:  h.par || 4,
      yds:  h.yds || 0,
      hdcp: h.hdcp || (i + 1),
    }));
    const holeCount = course.holeCount === 9 || holes.length === 9 ? 9 : 18;
    let tees = Array.isArray(course.tees) && course.tees.length
      ? course.tees.map((t, i) => ({
          id:     t.id || ('tee_' + i),
          name:   t.name || 'Tee ' + (i + 1),
          rating: parseFloat(t.rating) || course.rating || 72,
          slope:  parseInt(t.slope)   || course.slope  || 113,
          yds:    Array.isArray(t.yds) && t.yds.length === holes.length ? t.yds.map(y => parseInt(y) || 0) : null,
        }))
      : [{
          id:     'default',
          name:   'Standard',
          rating: course.rating || 72,
          slope:  course.slope  || 113,
          yds:    null,
        }];
    return {
      ...course,
      holes,
      holeCount,
      tees,
      rating: tees[0].rating,
      slope:  tees[0].slope,
    };
  }

  function getTee(course, teeId) {
    const c = course && course.tees ? course : normalizeCourse(course);
    if (!c) return { id: 'default', name: 'Standard', rating: 72, slope: 113, yds: null };
    return c.tees.find(t => t.id === teeId) || c.tees[0];
  }

  // Holes with yardages substituted from the chosen tee (when it has its own).
  function holesForTee(course, teeId) {
    const c = normalizeCourse(course);
    const tee = getTee(c, teeId);
    if (!tee.yds) return c.holes;
    return c.holes.map((h, i) => ({ ...h, yds: tee.yds[i] || h.yds }));
  }

  function coursePar(course) {
    return (course?.holes || []).reduce((a, h) => a + (h.par || 0), 0);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function searchLocal(query, courses) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return courses.slice();
    return courses.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q));
  }

  // ── Provider registry ─────────────────────────────────────────────────────
  // A provider implements:
  //   { id, label, search(query, cb(courses[])), getCourse(providerCourseId, cb(course|null)) }
  // Remote results are normalized before being handed back, so swapping or
  // adding providers never changes calling code.
  const _providers = [];

  function registerProvider(provider) {
    if (!provider || !provider.id || typeof provider.search !== 'function') {
      throw new Error('CourseService provider needs { id, search }');
    }
    if (!_providers.some(p => p.id === provider.id)) _providers.push(provider);
  }

  function providerAvailable() { return _providers.length > 0; }

  // Searches every registered provider and aggregates results (local list is
  // the caller's responsibility — UI merges searchLocal + this).
  function searchProviders(query, cb) {
    if (!_providers.length) { cb && cb([]); return; }
    let pending = _providers.length;
    const all = [];
    _providers.forEach(p => {
      let done = false;
      const finish = (courses) => {
        if (done) return;
        done = true;
        (courses || []).forEach(c => all.push(normalizeCourse({ ...c, providerId: p.id })));
        if (--pending === 0) cb && cb(all);
      };
      try { p.search(query, finish); } catch (e) { finish([]); }
    });
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  function getFavoriteIds() { return _storageGet(FAV_KEY, []); }

  function isFavorite(courseId) { return getFavoriteIds().includes(courseId); }

  function toggleFavorite(courseId) {
    const ids = getFavoriteIds();
    const next = ids.includes(courseId) ? ids.filter(id => id !== courseId) : [...ids, courseId];
    _storageSet(FAV_KEY, next);
    return next;
  }

  // ── Recently played ───────────────────────────────────────────────────────
  // Stores full (normalized) course objects so a recently used course loads
  // instantly even when it came from a remote provider that is now offline.
  function getRecents() { return _storageGet(RECENT_KEY, []); }

  function recordRecent(course) {
    if (!course || !course.id) return getRecents();
    const normalized = normalizeCourse(course);
    const next = [
      { ...normalized, lastPlayedAt: Date.now() },
      ...getRecents().filter(c => c.id !== course.id),
    ].slice(0, RECENT_MAX);
    _storageSet(RECENT_KEY, next);
    return next;
  }

  return {
    normalizeCourse,
    getTee,
    holesForTee,
    coursePar,
    searchLocal,
    registerProvider,
    providerAvailable,
    searchProviders,
    getFavoriteIds,
    isFavorite,
    toggleFavorite,
    getRecents,
    recordRecent,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { CourseService });
}
