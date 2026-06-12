// matchEngine.js — modular, registry-based scoring engine.
//
// Every format is a self-contained definition registered with the engine:
//
//   MatchEngine.register({
//     id, label, icon, desc, category,
//     players: { min, max },            // null → any number
//     teams:   { count, size } | null,  // size: [min, max] players per team
//     basis:   'gross' | 'net' | 'choice',
//     defaultAllowance, defaultRelative,
//     teamEntry: bool,                  // true → one score per team per hole
//     teamWeights(size) → [pct,…]       // team-entry handicap weights (low CH first)
//     needsInput: 'wolf' | 'bbb' | null // formats that need extra per-hole input
//     compute(ctx) → result
//   })
//
// Adding a future format means registering one new definition (plus tests) —
// no engine, UI, or existing-format changes.
//
// compute(ctx) returns a normalized result every UI surface can render:
//   {
//     kind: 'leaderboard' | 'match' | 'segments',
//     entries: [{ id, label, playerIds, color, total, totalLabel, detail, perHole }],
//     leaderIds, thru, complete, status, winner: { ids, label, text } | null
//   }
//
// Depends on HandicapService + CourseService (loaded first).

const MatchEngine = (function () {

  const _formats = new Map();
  const TEAM_COLORS = ['#C8A15A', '#7B9FE0', '#E07BE0', '#15803D', '#DC2626', '#2563EB'];

  function register(def) {
    if (!def || !def.id || !def.label) throw new Error('MatchEngine format needs { id, label }');
    if (!def.aliasOf && typeof def.compute !== 'function') {
      throw new Error('MatchEngine format "' + def.id + '" needs compute()');
    }
    if (_formats.has(def.id)) throw new Error('MatchEngine format "' + def.id + '" already registered');
    _formats.set(def.id, def);
  }

  function resolve(formatId) {
    let def = _formats.get(formatId);
    let guard = 0;
    while (def && def.aliasOf && guard++ < 5) {
      const target = _formats.get(def.aliasOf);
      def = target ? { ...target, ...def, compute: target.compute, aliasOf: def.aliasOf } : null;
    }
    return def || null;
  }

  function get(formatId) { return resolve(formatId); }

  function list() {
    return Array.from(_formats.values()).map(d => {
      const r = resolve(d.id);
      return {
        id: d.id, label: d.label, icon: d.icon || '🎯', desc: d.desc || '',
        category: r.category || 'individual',
        players: r.players || null,
        teams: r.teams || null,
        basis: r.basis || 'choice',
        defaultAllowance: r.defaultAllowance !== undefined ? r.defaultAllowance : 100,
        teamEntry: !!r.teamEntry,
        needsInput: r.needsInput || null,
        aliasOf: d.aliasOf || null,
      };
    });
  }

  const CATEGORY_INFO = {
    individual: { label: 'Individual',      order: 1 },
    match:      { label: 'Head-to-Head',    order: 2 },
    team:       { label: 'Team',            order: 3 },
    points:     { label: 'Points Games',    order: 4 },
  };

  // ── Shared helpers ──────────────────────────────────────────────────────────

  function _playOrder(holeCount, startingTee) {
    if (holeCount === 18 && startingTee === 10) {
      return [9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8];
    }
    return Array.from({ length: holeCount }, (_, i) => i);
  }

  function buildCtx(def, config, raw) {
    const HS = (typeof window !== 'undefined' && window.HandicapService) || HandicapService;
    const CS = (typeof window !== 'undefined' && window.CourseService)   || CourseService;
    const course = CS.normalizeCourse(raw.course);
    const holes = course.holes;
    const holeCount = course.holeCount;
    const allPlayers = raw.players || [];
    const cfg = config || {};

    const participantIds = (cfg.teams && cfg.teams.length)
      ? cfg.teams.reduce((a, t) => a.concat(t.playerIds || []), [])
      : (cfg.playerIds && cfg.playerIds.length ? cfg.playerIds : allPlayers.map(p => p.id));
    const players = allPlayers.filter(p => participantIds.includes(p.id));
    const playersById = Object.fromEntries(players.map(p => [p.id, p]));

    const basis = def.basis === 'choice' ? (cfg.scoringBasis || 'net') : def.basis;
    const tee = CS.getTee(course, cfg.teeId);
    const allowance = cfg.allowancePct !== undefined && cfg.allowancePct !== null
      ? cfg.allowancePct
      : (def.defaultAllowance !== undefined ? def.defaultAllowance : 100);
    const relative = cfg.relative !== undefined ? !!cfg.relative : !!def.defaultRelative;

    // Handicap details are computed even for gross games (Quota needs targets);
    // strokes only modify scores when the basis is net.
    const hcp = HS.playingHandicaps(players, holes, tee, {
      allowancePct: allowance,
      relative,
      overrides: cfg.handicapOverrides || {},
    });

    const scores = raw.scores || {};
    const gross = (pid, i) => {
      const g = scores[pid] && scores[pid][i];
      return (g && g > 0) ? g : 0;
    };
    const net = (pid, i) => {
      const g = gross(pid, i);
      if (!g) return 0;
      return HS.netScore(g, hcp[pid] ? hcp[pid].strokes[i] : 0);
    };
    const score = basis === 'net' ? net : gross;

    const teams = (cfg.teams || []).map((t, i) => ({
      id: t.id || ('t' + (i + 1)),
      name: t.name || 'Team ' + String.fromCharCode(65 + i),
      playerIds: (t.playerIds || []).filter(id => playersById[id]),
      color: t.color || TEAM_COLORS[i % TEAM_COLORS.length],
    }));

    // Team-entry formats: the hole score is one ball per team — entered on any
    // member's card (lowest entered value wins, so duplicates are harmless).
    const teamStrokesCache = {};
    const teamStrokes = (team) => {
      if (basis !== 'net') return holes.map(() => 0);
      if (teamStrokesCache[team.id]) return teamStrokesCache[team.id];
      const weights = (typeof def.teamWeights === 'function')
        ? def.teamWeights(team.playerIds.length)
        : (cfg.teamWeights || [100]);
      const chs = team.playerIds.map(pid => hcp[pid] ? hcp[pid].courseHcp : 0);
      const ph = HS.teamPlayingHandicap(chs, weights);
      const arr = HS.allocateStrokes(HS.roundHandicap(ph), holes);
      teamStrokesCache[team.id] = arr;
      return arr;
    };

    const teamEntered = (team, i) => {
      const vals = team.playerIds.map(pid => gross(pid, i)).filter(v => v > 0);
      if (!vals.length) return 0;
      const raw_ = Math.min(...vals);
      if (basis !== 'net') return raw_;
      return Math.max(1, raw_ - teamStrokes(team)[i]);
    };

    // Sum of the lowest `count` basis scores among members on a hole; 0 when
    // fewer than `count` members have a score.
    const teamBest = (team, i, count) => {
      const n = count || 1;
      const vals = team.playerIds.map(pid => score(pid, i)).filter(v => v > 0).sort((a, b) => a - b);
      if (vals.length < n) return 0;
      return vals.slice(0, n).reduce((a, b) => a + b, 0);
    };

    return {
      course, holes, holeCount,
      par: (i) => holes[i] ? holes[i].par : 4,
      playOrder: raw.playOrder || _playOrder(holeCount, raw.startingTee),
      players, playersById,
      teams,
      config: cfg,
      basis, allowance, relative,
      handicaps: hcp,
      gross, net, score,
      teamEntered, teamBest, teamStrokes,
      gameState: raw.gameState || {},
    };
  }

  function _firstName(p) { return p && p.name ? p.name.split(' ')[0] : '?'; }

  // Holes (in play order) where every listed participant/team has a score.
  function _thruCount(ctx, scoreFns) {
    let thru = 0;
    for (const i of ctx.playOrder) {
      if (scoreFns.every(fn => fn(i) > 0)) thru++;
    }
    return thru;
  }

  // Finalizes a leaderboard-style result: sorts, finds leaders, builds status.
  function finishLeaderboard(entries, opts) {
    const o = opts || {};
    const lower = !!o.lowerIsBetter;
    const scored = entries.filter(e => e.played > 0);
    const sorted = entries.slice().sort((a, b) => {
      if ((a.played > 0) !== (b.played > 0)) return a.played > 0 ? -1 : 1;
      return lower ? a.total - b.total : b.total - a.total;
    });
    let leaderIds = [];
    if (scored.length) {
      const best = lower
        ? Math.min(...scored.map(e => e.total))
        : Math.max(...scored.map(e => e.total));
      leaderIds = scored.filter(e => e.total === best).map(e => e.id);
    }
    const thru = o.thru || 0;
    let status = 'No scores yet';
    let winner = null;
    if (scored.length) {
      const leaders = sorted.filter(e => leaderIds.includes(e.id));
      const label = leaders.map(e => e.label).join(' & ');
      if (o.complete) {
        let winText;
        if (leaderIds.length > 1) {
          winText = label + ' tie' + (o.unit ? ' on ' + o.unit : '');
        } else {
          const runnerUp = sorted.find(e => !leaderIds.includes(e.id) && e.played > 0);
          const margin = runnerUp ? Math.abs(runnerUp.total - sorted[0].total) : 0;
          winText = label + ' wins' + (margin ? ' by ' + _fmtNum(margin) : '');
        }
        winner = { ids: leaderIds, label, text: winText };
        status = winner.text;
      } else if (leaderIds.length === scored.length && scored.length > 1) {
        status = 'All square thru ' + thru;
      } else {
        const runnerUp = sorted.find(e => !leaderIds.includes(e.id) && e.played > 0);
        const margin = runnerUp ? Math.abs(runnerUp.total - sorted[0].total) : 0;
        status = label + ' leads' + (margin ? ' by ' + _fmtNum(margin) : '') + ' thru ' + thru;
      }
    }
    return { entries: sorted, leaderIds, thru, complete: !!o.complete, status, winner };
  }

  function _fmtNum(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }

  function _toParLabel(diff) {
    if (diff === 0) return 'E';
    return diff > 0 ? '+' + diff : String(diff);
  }

  // ── Individual stroke-total compute (stroke play / net / team aggregates) ──
  function _strokeLeaderboard(ctx, scoreOf, units) {
    const entries = units.map(u => {
      let total = 0, par = 0, played = 0;
      const perHole = ctx.holes.map((h, i) => {
        const s = scoreOf(u, i);
        if (s > 0) { total += s; par += h.par; played++; return s; }
        return null;
      });
      return {
        id: u.id, label: u.label, playerIds: u.playerIds, color: u.color,
        total, played, perHole,
        totalLabel: played ? String(total) : '—',
        detail: played ? _toParLabel(total - par) + ' · thru ' + played : 'No scores',
      };
    });
    const complete = entries.every(e => e.played === ctx.holeCount);
    const thru = Math.min(...entries.map(e => e.played));
    return finishLeaderboard(entries, { lowerIsBetter: true, complete, thru });
  }

  function _playerUnits(ctx) {
    return ctx.players.map(p => ({
      id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
    }));
  }

  function _teamUnits(ctx) {
    return ctx.teams.map(t => ({
      id: t.id, label: t.name, playerIds: t.playerIds, color: t.color, team: t,
    }));
  }

  // ── Match-play core (singles or team best-ball) ────────────────────────────
  function _matchCompute(ctx, sideScore, sides) {
    let upA = 0, played = 0, closed = null;
    const perHole = ctx.holes.map(() => null);
    for (let k = 0; k < ctx.playOrder.length; k++) {
      const i = ctx.playOrder[k];
      const a = sideScore(sides[0], i);
      const b = sideScore(sides[1], i);
      if (!a || !b) continue;
      played++;
      if (a < b) { upA++; perHole[i] = sides[0].id; }
      else if (b < a) { upA--; perHole[i] = sides[1].id; }
      else perHole[i] = 'halved';
      const remaining = ctx.holeCount - played;
      if (!closed && Math.abs(upA) > remaining) {
        closed = { winnerIdx: upA > 0 ? 0 : 1, result: Math.abs(upA) + '&' + remaining };
        break;
      }
    }
    const complete = !!closed || played === ctx.holeCount;
    const lead = upA === 0 ? null : (upA > 0 ? 0 : 1);
    const margin = Math.abs(upA);

    const entries = sides.map((s, idx) => ({
      id: s.id, label: s.label, playerIds: s.playerIds, color: s.color,
      total: idx === lead ? margin : 0,
      played,
      totalLabel: lead === null ? 'AS' : (idx === lead ? margin + ' UP' : margin + ' DN'),
      detail: closed && closed.winnerIdx === idx ? 'Won ' + closed.result : 'thru ' + played,
      perHole,
    }));

    let status, winner = null;
    if (!played) status = 'No scores yet';
    else if (closed) {
      winner = { ids: [sides[closed.winnerIdx].id], label: sides[closed.winnerIdx].label, text: sides[closed.winnerIdx].label + ' wins ' + closed.result };
      status = winner.text;
    } else if (complete) {
      if (lead === null) { winner = { ids: sides.map(s => s.id), label: 'Halved', text: 'Match halved' }; status = 'Match halved'; }
      else { winner = { ids: [sides[lead].id], label: sides[lead].label, text: sides[lead].label + ' wins ' + margin + ' UP' }; status = winner.text; }
    } else {
      const dormie = margin > 0 && margin === ctx.holeCount - played ? ' · dormie' : '';
      status = lead === null ? 'All square thru ' + played : sides[lead].label + ' ' + margin + ' UP thru ' + played + dormie;
    }
    const ordered = lead === 1 ? [entries[1], entries[0]] : entries;
    return {
      kind: 'match', entries: ordered,
      leaderIds: lead === null ? entries.map(e => e.id) : [sides[lead].id],
      thru: played, complete, status, winner,
    };
  }

  function _matchSides(ctx) {
    if (ctx.teams.length >= 2) {
      return ctx.teams.slice(0, 2).map(t => ({
        id: t.id, label: t.name, playerIds: t.playerIds, color: t.color, team: t,
      }));
    }
    return ctx.players.slice(0, 2).map(p => ({
      id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
    }));
  }

  function _sideScoreFn(ctx) {
    return (side, i) => side.team ? ctx.teamBest(side.team, i, 1) : ctx.score(side.playerIds[0], i);
  }

  // ── Points-table compute (stableford / quota) ──────────────────────────────
  function _pointsLeaderboard(ctx, ptsForHole, opts) {
    const o = opts || {};
    const entries = ctx.players.map(p => {
      let pts = 0, played = 0;
      const perHole = ctx.holes.map((h, i) => {
        const s = ctx.score(p.id, i);
        if (!s) return null;
        played++;
        const v = ptsForHole(s, h.par, p);
        pts += v;
        return v;
      });
      const base = o.baseline ? o.baseline(p) : 0;
      return {
        id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
        total: pts - base, played, perHole,
        totalLabel: played ? (o.signed ? (pts - base > 0 ? '+' : '') + (pts - base) : String(pts)) : '—',
        detail: played
          ? (o.baseline ? pts + ' pts vs quota ' + base : played + ' holes')
          : 'No scores',
      };
    });
    const complete = entries.every(e => e.played === ctx.holeCount);
    const thru = Math.min(...entries.map(e => e.played));
    return finishLeaderboard(entries, { lowerIsBetter: false, complete, thru, unit: 'points' });
  }

  const STABLEFORD_MAX = 6;
  function stablefordPoints(score, par, pointsTable) {
    if (!score) return 0;
    const diff = score - par;
    if (pointsTable && pointsTable[diff] !== undefined) return pointsTable[diff];
    return Math.max(0, Math.min(STABLEFORD_MAX, 2 - diff));
  }

  const QUOTA_POINTS = { '-3': 16, '-2': 8, '-1': 4, '0': 2, '1': 1 };
  function quotaPoints(score, par) {
    if (!score) return 0;
    const diff = score - par;
    if (diff <= -3) return QUOTA_POINTS['-3'];
    return QUOTA_POINTS[String(diff)] || 0;
  }

  // ── compute() entry point ───────────────────────────────────────────────────
  function compute(game, raw) {
    const def = resolve(game.formatId);
    if (!def) {
      return { kind: 'leaderboard', entries: [], leaderIds: [], thru: 0, complete: false, status: 'Unknown format', winner: null, formatId: game.formatId, name: game.name || game.formatId, icon: '🎯' };
    }
    const ctx = buildCtx(def, game.config, raw);
    const res = def.compute(ctx);
    return {
      formatId: game.formatId,
      name: game.name || def.label,
      icon: def.icon || '🎯',
      basis: ctx.basis,
      ...res,
    };
  }

  // Builds a sensible starting config for a format: serpentine team assignment
  // by handicap so sides start balanced.
  function defaultConfig(formatId, players) {
    const def = resolve(formatId);
    if (!def) return {};
    const cfg = {};
    if (def.basis === 'choice') cfg.scoringBasis = 'net';
    if (def.defaultAllowance !== undefined) cfg.allowancePct = def.defaultAllowance;
    if (def.defaultRelative) cfg.relative = true;
    if (def.teams) {
      const count = def.teams.count || 2;
      const sorted = players.slice().sort((a, b) => (a.handicap || 0) - (b.handicap || 0));
      const teams = Array.from({ length: count }, (_, i) => ({
        id: 't' + (i + 1),
        name: 'Team ' + String.fromCharCode(65 + i),
        playerIds: [],
      }));
      sorted.forEach((p, i) => {
        const pass = Math.floor(i / count);
        const pos = i % count;
        const idx = pass % 2 === 0 ? pos : count - 1 - pos;
        teams[idx].playerIds.push(p.id);
      });
      cfg.teams = teams;
    }
    return cfg;
  }

  function validateGame(game, players) {
    const def = resolve(game.formatId);
    if (!def) return { ok: false, error: 'Unknown format' };
    const cfg = game.config || {};
    const n = players.length;
    if (def.players) {
      if (def.players.min && n < def.players.min) return { ok: false, error: def.label + ' needs at least ' + def.players.min + ' players' };
      if (def.players.max && n > def.players.max) return { ok: false, error: def.label + ' allows at most ' + def.players.max + ' players' };
    }
    if (def.teams) {
      const teams = cfg.teams || [];
      if (teams.length < (def.teams.count || 2)) return { ok: false, error: 'Set up ' + (def.teams.count || 2) + ' teams' };
      const [minSize, maxSize] = def.teams.size || [1, 4];
      for (const t of teams) {
        const size = (t.playerIds || []).length;
        if (size < minSize || size > maxSize) {
          return { ok: false, error: (t.name || 'Each team') + ' needs ' + (minSize === maxSize ? minSize : minSize + '–' + maxSize) + ' players' };
        }
      }
      const seen = new Set();
      for (const t of teams) for (const id of t.playerIds || []) {
        if (seen.has(id)) return { ok: false, error: 'A player is on two teams' };
        seen.add(id);
      }
    }
    return { ok: true, error: null };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORMAT DEFINITIONS
  // ════════════════════════════════════════════════════════════════════════════

  register({
    id: 'strokePlay', label: 'Stroke Play', icon: '⛳',
    desc: 'Classic medal play — lowest gross total wins.',
    category: 'individual', basis: 'gross', players: { min: 1, max: 8 },
    compute(ctx) {
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.score(u.playerIds[0], i), _playerUnits(ctx)) };
    },
  });

  register({
    id: 'individualGross', label: 'Individual Gross', icon: '🎯',
    desc: 'Lowest gross total wins — same as stroke play.',
    aliasOf: 'strokePlay', category: 'individual',
  });

  register({
    id: 'individualNet', label: 'Individual Net', icon: '🧮',
    desc: 'Stroke play with full playing handicaps — lowest net total wins.',
    category: 'individual', basis: 'net', defaultAllowance: 100, players: { min: 1, max: 8 },
    compute(ctx) {
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.score(u.playerIds[0], i), _playerUnits(ctx)) };
    },
  });

  register({
    id: 'stableford', label: 'Stableford', icon: '⭐',
    desc: 'Points per hole vs par (net): birdie 3, par 2, bogey 1 — highest total wins.',
    category: 'points', basis: 'choice', defaultAllowance: 95, players: { min: 1, max: 8 },
    compute(ctx) {
      const table = ctx.config.pointsTable || null;
      const res = _pointsLeaderboard(ctx, (s, par) => stablefordPoints(s, par, table));
      return { kind: 'leaderboard', ...res };
    },
  });

  register({
    id: 'quota', label: 'Quota', icon: '📈',
    desc: 'Beat your points quota (36 − playing handicap). Bogey 1 · Par 2 · Birdie 4 · Eagle 8.',
    category: 'points', basis: 'gross', defaultAllowance: 100, players: { min: 1, max: 8 },
    compute(ctx) {
      const base = ctx.config.quotaBase !== undefined ? ctx.config.quotaBase : 36;
      const res = _pointsLeaderboard(ctx, (s, par) => quotaPoints(s, par), {
        signed: true,
        baseline: (p) => base - (ctx.handicaps[p.id] ? ctx.handicaps[p.id].rounded : 0),
      });
      return { kind: 'leaderboard', ...res };
    },
  });

  register({
    id: 'matchPlay', label: 'Match Play', icon: '⚔️',
    desc: 'Hole-by-hole duel — most holes won takes the match. Singles or 2v2.',
    category: 'match', basis: 'choice', defaultAllowance: 100, defaultRelative: true,
    players: { min: 2, max: 8 }, teams: { count: 2, size: [1, 4] },
    compute(ctx) {
      const sides = _matchSides(ctx);
      if (sides.length < 2) return { kind: 'match', entries: [], leaderIds: [], thru: 0, complete: false, status: 'Pick two sides', winner: null };
      return _matchCompute(ctx, _sideScoreFn(ctx), sides);
    },
  });

  register({
    id: 'fourBall', label: 'Four Ball', icon: '👥',
    desc: '2v2 match play — each side counts its better ball on every hole.',
    category: 'match', basis: 'net', defaultAllowance: 90, defaultRelative: true,
    players: { min: 4, max: 4 }, teams: { count: 2, size: [2, 2] },
    compute(ctx) {
      const sides = _matchSides(ctx);
      if (sides.length < 2) return { kind: 'match', entries: [], leaderIds: [], thru: 0, complete: false, status: 'Pick two teams', winner: null };
      return _matchCompute(ctx, _sideScoreFn(ctx), sides);
    },
  });

  register({
    id: 'nassau', label: 'Nassau', icon: '💰',
    desc: 'Three matches in one: front nine, back nine, and overall.',
    category: 'match', basis: 'choice', defaultAllowance: 100, defaultRelative: true,
    players: { min: 2, max: 8 }, teams: { count: 2, size: [1, 4] },
    compute(ctx) {
      const sides = _matchSides(ctx);
      if (sides.length < 2) return { kind: 'segments', entries: [], leaderIds: [], thru: 0, complete: false, status: 'Pick two sides', winner: null };
      const sideScore = _sideScoreFn(ctx);
      const half = Math.floor(ctx.holeCount / 2);
      const segs = ctx.holeCount >= 18
        ? [
            { key: 'F9', holes: Array.from({ length: half }, (_, i) => i) },
            { key: 'B9', holes: Array.from({ length: ctx.holeCount - half }, (_, i) => i + half) },
            { key: '18', holes: Array.from({ length: ctx.holeCount }, (_, i) => i) },
          ]
        : [{ key: 'Match', holes: Array.from({ length: ctx.holeCount }, (_, i) => i) }];

      const segWins = [0, 0];
      const segDetail = [[], []];
      let thru = 0;
      segs.forEach(seg => {
        let up = 0, played = 0;
        seg.holes.forEach(i => {
          const a = sideScore(sides[0], i);
          const b = sideScore(sides[1], i);
          if (!a || !b) return;
          played++;
          if (a < b) up++; else if (b < a) up--;
        });
        if (seg.key === '18' || seg.key === 'Match') thru = played;
        const segDone = played === seg.holes.length;
        const tag = up === 0 ? 'AS' : (up > 0 ? '+' + up : String(up));
        segDetail[0].push(seg.key + ' ' + tag);
        segDetail[1].push(seg.key + ' ' + (up === 0 ? 'AS' : (up < 0 ? '+' + (-up) : String(-up))));
        if (segDone && up !== 0) segWins[up > 0 ? 0 : 1]++;
      });

      const complete = segs.every(seg => seg.holes.every(i => sideScore(sides[0], i) > 0 && sideScore(sides[1], i) > 0));
      const entries = sides.map((s, idx) => ({
        id: s.id, label: s.label, playerIds: s.playerIds, color: s.color,
        total: segWins[idx], played: thru,
        totalLabel: segWins[idx] + (segs.length > 1 ? ' of ' + (segs.length) : ''),
        detail: segDetail[idx].join(' · '),
        perHole: null,
      }));
      let leaderIds, status, winner = null;
      if (segWins[0] === segWins[1]) {
        leaderIds = entries.map(e => e.id);
        status = thru ? 'Segments split thru ' + thru : 'No scores yet';
      } else {
        const lead = segWins[0] > segWins[1] ? 0 : 1;
        leaderIds = [sides[lead].id];
        status = sides[lead].label + ' up ' + segWins[lead] + '–' + segWins[1 - lead] + ' in segments thru ' + thru;
      }
      if (complete) {
        if (segWins[0] === segWins[1]) winner = { ids: entries.map(e => e.id), label: 'Split', text: 'Nassau splits ' + segWins[0] + '–' + segWins[1] };
        else {
          const lead = segWins[0] > segWins[1] ? 0 : 1;
          winner = { ids: [sides[lead].id], label: sides[lead].label, text: sides[lead].label + ' takes the Nassau ' + segWins[lead] + '–' + segWins[1 - lead] };
        }
        status = winner.text;
      }
      const ordered = segWins[1] > segWins[0] ? [entries[1], entries[0]] : entries;
      return { kind: 'segments', entries: ordered, leaderIds, thru, complete, status, winner };
    },
  });

  register({
    id: 'skins', label: 'Skins', icon: '🎴',
    desc: 'Win a hole outright to take the skin — ties carry the pot to the next hole.',
    category: 'points', basis: 'choice', defaultAllowance: 100, defaultRelative: true,
    players: { min: 2, max: 8 },
    compute(ctx) {
      const carry = ctx.config.carryover !== false;
      const counts = Object.fromEntries(ctx.players.map(p => [p.id, 0]));
      const holesWon = Object.fromEntries(ctx.players.map(p => [p.id, []]));
      let carried = 0;
      let thru = 0;
      const perHoleWinner = ctx.holes.map(() => null);
      for (const i of ctx.playOrder) {
        const entered = ctx.players.map(p => ({ id: p.id, s: ctx.score(p.id, i) }));
        if (entered.some(e => !e.s)) { continue; }
        thru++;
        entered.sort((a, b) => a.s - b.s);
        if (entered.length > 1 && entered[0].s === entered[1].s) {
          if (carry) carried++;
          continue;
        }
        const value = 1 + carried;
        carried = 0;
        counts[entered[0].id] += value;
        holesWon[entered[0].id].push(String(ctx.holes[i].num) + (value > 1 ? ' (×' + value + ')' : ''));
        perHoleWinner[i] = entered[0].id;
      }
      const entries = ctx.players.map(p => ({
        id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
        total: counts[p.id], played: thru,
        totalLabel: String(counts[p.id]),
        detail: holesWon[p.id].length ? 'Holes ' + holesWon[p.id].join(', ') : 'No skins yet',
        perHole: perHoleWinner,
      }));
      const complete = thru === ctx.holeCount;
      const res = finishLeaderboard(entries, { lowerIsBetter: false, complete, thru, unit: 'skins' });
      if (!complete && carried > 0 && thru > 0) res.status += ' · ' + carried + ' carrying';
      return { kind: 'leaderboard', ...res };
    },
  });

  register({
    id: 'sixes', label: 'Sixes', icon: '🔁',
    desc: 'Foursome round robin — partners rotate every six holes; win holes with your side\'s better ball.',
    category: 'match', basis: 'choice', defaultAllowance: 100, defaultRelative: true,
    players: { min: 4, max: 4 },
    compute(ctx) {
      const ps = ctx.players;
      if (ps.length !== 4) return { kind: 'leaderboard', entries: [], leaderIds: [], thru: 0, complete: false, status: 'Sixes needs exactly 4 players', winner: null };
      const segLen = Math.floor(ctx.holeCount / 3);
      const pairings = [
        [[0, 1], [2, 3]],
        [[0, 2], [1, 3]],
        [[0, 3], [1, 2]],
      ];
      const pts = Object.fromEntries(ps.map(p => [p.id, 0]));
      let thru = 0;
      for (let k = 0; k < ctx.playOrder.length; k++) {
        const i = ctx.playOrder[k];
        const seg = Math.min(2, Math.floor(k / segLen));
        const [pairA, pairB] = pairings[seg];
        const best = pair => {
          const vals = pair.map(ix => ctx.score(ps[ix].id, i)).filter(v => v > 0);
          return vals.length === 2 ? Math.min(...vals) : 0;
        };
        const a = best(pairA), b = best(pairB);
        if (!a || !b) continue;
        thru++;
        if (a < b)      pairA.forEach(ix => { pts[ps[ix].id] += 2; });
        else if (b < a) pairB.forEach(ix => { pts[ps[ix].id] += 2; });
        else            pairA.concat(pairB).forEach(ix => { pts[ps[ix].id] += 1; });
      }
      const entries = ps.map(p => ({
        id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
        total: pts[p.id], played: thru,
        totalLabel: String(pts[p.id]),
        detail: thru ? 'thru ' + thru : 'No scores',
        perHole: null,
      }));
      const complete = thru === ctx.holeCount;
      return { kind: 'leaderboard', ...finishLeaderboard(entries, { lowerIsBetter: false, complete, thru, unit: 'points' }) };
    },
  });

  // ── Team formats: every player holes out their own ball ────────────────────

  register({
    id: 'bestBall', label: 'Best Ball', icon: '🏆',
    desc: 'Teams count their best ball (or best two) each hole — lowest team total wins.',
    category: 'team', basis: 'choice', defaultAllowance: 85,
    players: { min: 2, max: 8 }, teams: { count: 2, size: [1, 4] },
    compute(ctx) {
      const count = Math.max(1, ctx.config.countBalls || 1);
      const units = _teamUnits(ctx);
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.teamBest(u.team, i, count), units) };
    },
  });

  register({
    id: 'betterBall', label: 'Better Ball', icon: '🥇',
    desc: 'Each team counts its better ball per hole — lowest total wins.',
    aliasOf: 'bestBall', category: 'team',
  });

  register({
    id: 'shamble', label: 'Shamble', icon: '🌿',
    desc: 'Pick the best drive, then everyone plays their own ball in — best ball counts.',
    category: 'team', basis: 'choice', defaultAllowance: 80,
    players: { min: 2, max: 8 }, teams: { count: 2, size: [2, 4] },
    compute(ctx) {
      const count = Math.max(1, ctx.config.countBalls || 1);
      const units = _teamUnits(ctx);
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.teamBest(u.team, i, count), units) };
    },
  });

  register({
    id: 'teamGross', label: 'Team Gross', icon: '➕',
    desc: 'Add up every team member\'s gross score — lowest combined total wins.',
    category: 'team', basis: 'gross',
    players: { min: 2, max: 8 }, teams: { count: 2, size: [1, 4] },
    compute(ctx) {
      const units = _teamUnits(ctx);
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.teamBest(u.team, i, u.team.playerIds.length), units) };
    },
  });

  register({
    id: 'teamNet', label: 'Team Net', icon: '🧮',
    desc: 'Add up every team member\'s net score — lowest combined total wins.',
    category: 'team', basis: 'net', defaultAllowance: 100,
    players: { min: 2, max: 8 }, teams: { count: 2, size: [1, 4] },
    compute(ctx) {
      const units = _teamUnits(ctx);
      return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.teamBest(u.team, i, u.team.playerIds.length), units) };
    },
  });

  // ── Team formats: one ball per team (enter the team score on any card) ─────

  function _scrambleWeights(size) {
    if (size <= 2) return [35, 15];
    if (size === 3) return [30, 20, 10];
    return [25, 20, 15, 10];
  }

  function _teamEntryCompute(ctx) {
    const units = _teamUnits(ctx);
    return { kind: 'leaderboard', ..._strokeLeaderboard(ctx, (u, i) => ctx.teamEntered(u.team, i), units) };
  }

  register({
    id: 'scramble', label: 'Scramble', icon: '🤝',
    desc: 'Everyone tees off, the team plays the best shot until holed. Enter the team score on any player\'s card.',
    category: 'team', basis: 'choice',
    players: { min: 2, max: 8 }, teams: { count: 2, size: [2, 4] },
    teamEntry: true, teamWeights: _scrambleWeights,
    compute: _teamEntryCompute,
  });

  register({
    id: 'scramble2', label: '2-Person Scramble', icon: '🤜🤛',
    desc: 'Two-player scramble — best shot every time. Handicaps blend 35% low + 15% high.',
    category: 'team', basis: 'choice',
    players: { min: 4, max: 8 }, teams: { count: 2, size: [2, 2] },
    teamEntry: true, teamWeights: () => [35, 15],
    compute: _teamEntryCompute,
  });

  register({
    id: 'alternateShot', label: 'Alternate Shot', icon: '🔀',
    desc: 'Partners play one ball, alternating strokes. Team handicap is 50% of the pair\'s combined.',
    category: 'team', basis: 'choice',
    players: { min: 4, max: 8 }, teams: { count: 2, size: [2, 2] },
    teamEntry: true, teamWeights: () => [50, 50],
    compute: _teamEntryCompute,
  });

  register({
    id: 'foursomes', label: 'Foursomes', icon: '🇬🇧',
    desc: 'The classic alternate-shot format — one ball per pair, alternating strokes.',
    aliasOf: 'alternateShot', category: 'team',
  });

  register({
    id: 'chapman', label: 'Chapman (Pinehurst)', icon: '🔄',
    desc: 'Both tee off, swap balls for the second shot, pick one ball and alternate in. 60/40 handicaps.',
    category: 'team', basis: 'choice',
    players: { min: 4, max: 8 }, teams: { count: 2, size: [2, 2] },
    teamEntry: true, teamWeights: () => [60, 40],
    compute: _teamEntryCompute,
  });

  // ── Formats that need extra per-hole input ──────────────────────────────────

  register({
    id: 'wolf', label: 'Wolf (Engine)', icon: '🐺',
    desc: 'Rotating wolf picks a partner or goes alone after watching tee shots.',
    category: 'points', basis: 'choice', defaultAllowance: 100, defaultRelative: true,
    players: { min: 3, max: 5 }, needsInput: 'wolf',
    compute(ctx) {
      const wolfData = ctx.gameState.wolf || {};
      const pts = Object.fromEntries(ctx.players.map(p => [p.id, 0]));
      let thru = 0;
      for (const i of ctx.playOrder) {
        const wd = wolfData[i];
        if (!wd || !wd.confirmed) continue;
        const wolfTeam = wd.lone ? [wd.wolfId] : [wd.wolfId, wd.partnerId].filter(Boolean);
        const others = ctx.players.map(p => p.id).filter(id => !wolfTeam.includes(id));
        const sAll = Object.fromEntries(ctx.players.map(p => [p.id, ctx.score(p.id, i)]));
        if (ctx.players.some(p => !sAll[p.id])) continue;
        thru++;
        if (wd.lone) {
          const otherBest = others.map(id => sAll[id]).sort((a, b) => a - b);
          const wolfSide = sAll[wd.wolfId] * 2;
          const fieldSide = otherBest[0] + (otherBest[1] || otherBest[0]);
          if (wolfSide < fieldSide) pts[wd.wolfId] += 2;
          else if (fieldSide < wolfSide) {
            const threshold = otherBest[1] || otherBest[0];
            others.forEach(id => { if (sAll[id] <= threshold) pts[id] += 1; });
          }
        } else {
          const wolfSide = wolfTeam.reduce((a, id) => a + sAll[id], 0);
          const fieldSide = others.reduce((a, id) => a + sAll[id], 0);
          if (wolfSide < fieldSide) wolfTeam.forEach(id => { pts[id] += 1; });
          else if (fieldSide < wolfSide) others.forEach(id => { pts[id] += 1; });
        }
      }
      const entries = ctx.players.map(p => ({
        id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
        total: pts[p.id], played: thru,
        totalLabel: String(pts[p.id]), detail: thru ? 'thru ' + thru : 'No holes decided', perHole: null,
      }));
      const complete = thru === ctx.holeCount;
      return { kind: 'leaderboard', ...finishLeaderboard(entries, { lowerIsBetter: false, complete, thru, unit: 'points' }) };
    },
  });

  register({
    id: 'bingoBangoBongo', label: 'Bingo Bango Bongo (Engine)', icon: '🎯',
    desc: 'Three points a hole: first on the green, closest to the pin, first to hole out.',
    category: 'points', basis: 'gross',
    players: { min: 2, max: 8 }, needsInput: 'bbb',
    compute(ctx) {
      const bbb = ctx.gameState.bbb || {};
      const pts = Object.fromEntries(ctx.players.map(p => [p.id, 0]));
      let thru = 0;
      for (const i of ctx.playOrder) {
        const h = bbb[i];
        if (!h || !h.confirmed) continue;
        thru++;
        ['bingo', 'bango', 'bongo'].forEach(cat => {
          if (h[cat] && pts[h[cat]] !== undefined) pts[h[cat]]++;
        });
      }
      const entries = ctx.players.map(p => ({
        id: p.id, label: _firstName(p), playerIds: [p.id], color: p.color,
        total: pts[p.id], played: thru,
        totalLabel: String(pts[p.id]), detail: thru ? thru + ' holes awarded' : 'No points yet', perHole: null,
      }));
      const complete = thru === ctx.holeCount;
      return { kind: 'leaderboard', ...finishLeaderboard(entries, { lowerIsBetter: false, complete, thru, unit: 'points' }) };
    },
  });

  return {
    register,
    get,
    list,
    compute,
    defaultConfig,
    validateGame,
    stablefordPoints,
    quotaPoints,
    CATEGORY_INFO,
    TEAM_COLORS,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { MatchEngine });
}
