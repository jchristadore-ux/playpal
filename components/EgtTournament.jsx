// EgtTournament.jsx — the EGT Cup screen. Imports the embedded seed (or a
// pasted one), lets you enter scores per round, finalize rounds, fill in a
// pending stroke index, and see live standings/money plus a printable packet.
// All math lives in the engine modules (window.Egt*); this file is view + glue.
//
// Layout note: the tab/section renderers are plain functions invoked as
// {Standings()} — not JSX component tags — and the stateful pieces (SI editor,
// stake input) are hoisted to module scope. Inner component types re-created on
// every render make React remount the whole subtree, which dropped input focus
// after every keystroke in the score grid and reset the Individual Matches
// editor. Keep it this way.

// Brief plain-English format notes shown on each round in the list.
const EGT_ROUND_FORMATS = {
  R1: 'Loop 1 — Bingo-Bango-Bongo: 3 pts/hole (first on green, closest once all are on, first in the hole), gross. Loop 2 — The Nines: 9 pts/hole split 5/3/1 by net score, ties split; scored on 9-hole handicaps off the low.',
  R2: 'Four-ball best-ball match play at 90%, plus a Nassau (front 9 · back 9 · overall). Each hole the team’s better net ball counts.',
  R3: 'Wolf: the rotating Wolf partners the next player or goes lone/blind; ±units per opponent, ties push. Best net ball, 100% off the low ball.',
  R4: '2-v-2 aggregate net Stableford at 85% — both partners’ points count. Segment matches on holes 1–6, 7–12, 13–18 plus the 18-hole total; pick up at net double bogey.',
  R5: 'Full-round Bingo-Bango-Bongo: 3 pts/hole (first on green, closest once all are on, first in the hole), gross. Plus match play — set the matches before the round (1v1 or 2v2, any players); the higher handicap gets the difference in strokes; each match settles Nassau-style (front · back · overall).',
  R6: 'Championship singles (seeded 1v2 & 3v4 off the standings; the higher handicap gets the difference in strokes) plus individual net Stableford, full dots.',
};

// Game labels + a one-line note on how each game's pops are taken.
const EGT_GAME_LABELS = {
  skinsNet: 'Skins (net)', nines: 'The Nines', fourBallMatch: 'Four-ball match',
  wolf: 'Wolf', teamStableford: 'Team Stableford', stableford: 'Stableford',
};

// Editable money stakes per round (Rounds tab). key maps to moneyDefaults;
// `per` labels the unit. Skins runs every round; the head-to-head cash game
// (BBB/Nines, Nassau, Wolf) is listed on the round that plays it.
const EGT_STAKE_ITEMS = {
  R1: [{ key: 'bbbNinesPerPointDiff', label: 'BBB / Nines', per: 'per point' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R2: [{ key: 'nassauPerPoint', label: 'Nassau', per: 'per point' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R3: [{ key: 'wolfPerUnit', label: 'Wolf', per: 'per unit' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R4: [{ key: 'nassauPerPoint', label: 'Stableford match', per: 'per point' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R5: [{ key: 'bbbNinesPerPointDiff', label: 'BBB', per: 'per point' }, { key: 'nassauPerPoint', label: 'Match play', per: 'per point' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R6: [{ key: 'nassauPerPoint', label: 'Singles', per: 'per point' }, { key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
};

const EGT_MATCH_HINT = {
  R2: 'These individual matches run alongside the four-ball team Nassau — same scores, no re-entry.',
  R5: 'These matches ARE the R5 match play — add the round-robin 1v1s (or any 2v2 mix) layered on Bingo-Bango-Bongo.',
};

// ── shared styling (module scope so element types/styles stay stable) ────────
const EGT_UI = (() => {
  const TH = (typeof window !== 'undefined' && window.PLAYPAL_THEME) || {};
  const GREEN = '#0E2B20', GOLD = TH.accentGold || '#C8A15A', INK = '#12241C', LINE = '#cddbd3';
  return {
    GREEN, GOLD, INK, LINE,
    th: { background: GREEN, color: '#fff', padding: '6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 },
    td: { border: `1px solid ${LINE}`, padding: '5px 8px', textAlign: 'center', fontSize: 13 },
    secLabel: { fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 0.8, textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 },
    secRule: { flex: 1, height: 1, background: LINE },
    teePill: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(14,43,32,0.06)', color: GREEN, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' },
  };
})();

const egtArrow = d => d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'new' ? '•' : '–';
const egtArrowColor = d => d === 'up' ? '#137a3f' : d === 'down' ? '#b3261e' : '#8a988f';
const egtTeeLabel = t => (t.label && t.label !== 'Tee') ? `${t.label} · ${t.time}` : t.time;
const egtTeeChipsFor = round => (Array.isArray(round.teeTimes) && round.teeTimes.length)
  ? round.teeTimes : (round.teeTimeTarget ? [{ label: '', time: round.teeTimeTarget }] : []);

const EgtSectionHead = ({ children }) => <div style={EGT_UI.secLabel}>{children}<span style={EGT_UI.secRule} /></div>;
const EgtField = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 5 }}>
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: '#8a988f', minWidth: 92, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 12.5, color: EGT_UI.INK, fontWeight: 600 }}>{children}</div>
  </div>
);

// Stake dollar input. Buffers the text while the field is focused so the value
// can be cleared and retyped — committing on every keystroke used to snap the
// emptied field straight back to the tournament default.
const EgtStakeInput = ({ value, onCommit }) => {
  const [draft, setDraft] = React.useState(null); // null = not editing
  return (
    <input
      value={draft != null ? draft : value}
      inputMode="decimal"
      onFocus={() => setDraft(String(value ?? ''))}
      onBlur={() => setDraft(null)}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9.]/g, '');
        setDraft(v);
        onCommit(v);
      }}
      style={{ width: 44, textAlign: 'center', border: `1px solid ${EGT_UI.LINE}`, borderRadius: 6, padding: '4px 2px', fontSize: 13, color: EGT_UI.INK }}
    />
  );
};

// SI-entry modal. Module scope (it holds state): a parent re-render — a toast,
// a sync — must not remount it and wipe the half-typed stroke index.
const EgtSiEditor = ({ model, courseId, onApply, onClose }) => {
  const { LINE } = EGT_UI;
  const course = model.courses[courseId];
  const twoLoop = course.loopsForRound === 2;
  const n = twoLoop ? 9 : 18;
  const initial = twoLoop
    ? course.holes.slice(0, 9).map(h => (h.si == null ? '' : window.EgtHandicap.nineHoleSi(h.si)))
    : course.holes.slice(0, 18).map(h => (h.si == null ? '' : h.si));
  const [vals, setVals] = React.useState(initial);
  const [err, setErr] = React.useState('');
  const apply = () => {
    const nums = vals.map(v => parseInt(v, 10));
    if (!window.EgtHandicap.isPermutation(nums, n)) { setErr(`Enter each number 1–${n} exactly once.`); return; }
    try {
      window.EgtImporter.enterStrokeIndex(model, courseId, nums);
      onApply(course);
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal open onClose={onClose} title={`Stroke index — ${course.name}`}>
      <div style={{ fontSize: 13, color: '#3F5F4A', marginBottom: 10 }}>
        Enter the printed card stroke index ({twoLoop ? '9 values for the 9-hole loop' : '18 values'}). Must be a permutation of 1–{n}.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6 }}>
        {vals.map((v, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#8a988f' }}>H{i + 1}</div>
            <input value={v} inputMode="numeric" onChange={e => { const c = vals.slice(); c[i] = e.target.value.replace(/[^0-9]/g, ''); setVals(c); }}
              style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '6px 2px', border: `1px solid ${LINE}`, borderRadius: 6 }} />
          </div>
        ))}
      </div>
      {err && <div style={{ color: '#b3261e', fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Btn onClick={apply}>Save & recompute</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
};

const EgtTournament = ({ onScoreRound }) => {
  const { GREEN, GOLD, INK, LINE, th, td } = EGT_UI;
  const seedText = window.EGT_SEED;

  const [state, setState] = React.useState(null);
  const [openRound, setOpenRound] = React.useState(null);
  const [siEditCourse, setSiEditCourse] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [tab, setTab] = React.useState('standings');

  // Boot: always re-import the embedded seed so schedule metadata (tee times,
  // cart pairings, teams, formats) refreshes even on installs that already have
  // a persisted state. EgtStore.importSeed is idempotent by trip id — it loads
  // any existing entered data (scores, events, finalized, stakes) and only swaps
  // in the freshly-derived model, so nothing the user entered is lost.
  React.useEffect(() => {
    try {
      const seed = typeof seedText === 'string' ? JSON.parse(seedText) : seedText;
      const st = window.EgtStore.importSeed(seed);
      // One-time repair: matches saved before v1.7.3 auto-filled their 1v1 pops
      // from the handicap-index difference; clear any untouched auto-fill so the
      // engine live-derives the correct course-handicap pops (manual edits stay).
      if (window.EgtBridge.repairMatchPops(st)) window.EgtStore.save(st);
      setState({ ...st });
    } catch (e) { setToast('Could not load seed: ' + e.message); }
  }, []);

  // Live computation for display (don't persist a snapshot on every render).
  // Declared before any early return so hook order stays stable.
  const live = React.useMemo(() => {
    if (!state || !state.model) return { standings: [], money: { total: {} }, resultsByRound: {} };
    try { return window.EgtEngine.liveUpdate(state, { noPersist: true, season: (state.finalized || []).includes('R6') }); }
    catch (e) { return { standings: [], money: { total: {} }, resultsByRound: {} }; }
  }, [state]);

  if (!state || !state.model) {
    return <div style={{ padding: 24, fontFamily: 'Plus Jakarta Sans, sans-serif', color: INK }}>Loading EGT Cup…</div>;
  }
  const model = state.model;
  const nameOf = pid => model.playersById[pid]?.name || pid;

  const flash = msg => { setToast(msg); setTimeout(() => setToast(''), 2200); };
  const persist = st => { window.EgtStore.save(st); setState({ ...st }); };

  // ── score + event mutation ────────────────────────────────────────────────
  const setGross = (rid, pid, hole, val) => {
    const gross = val === '' ? null : Math.max(1, parseInt(val, 10) || 0);
    window.EgtStore.setHoleScore(state, rid, pid, hole, { gross });
    setState({ ...state });
  };
  const setPutts = (rid, pid, hole, val) => {
    const putts = val === '' ? null : Math.max(0, parseInt(val, 10) || 0);
    window.EgtStore.setHoleScore(state, rid, pid, hole, { putts });
    setState({ ...state });
  };
  const toggleFinalize = rid => {
    if (state.finalized.includes(rid)) {
      state.finalized = state.finalized.filter(x => x !== rid);
    } else {
      // Pull any scores entered in the native scorer into the EGT store first,
      // so finalizing reflects live-scored rounds.
      try {
        const payload = window.EgtBridge.readNativePayload(model, rid);
        if (payload) window.EgtBridge.bridge(model, state, rid, payload);
      } catch (e) {}
      window.EgtStore.finalizeRound(state, rid);
    }
    // A finalize triggers a full live update + snapshot.
    try { window.EgtEngine.liveUpdate(state, { season: (state.finalized || []).includes('R6') }); } catch (e) {}
    persist(state);
    flash(state.finalized.includes(rid) ? `${rid} finalized — standings updated` : `${rid} reopened`);
  };

  // Individual Nassau overlay matches, per round. Generalizes the old R5-only
  // `r5Matches` to every round (R1–R6); legacy R5 data is migrated on read.
  const roundMatchesFor = rid => {
    const rm = state.events.roundMatches || {};
    if (rm[rid]) return rm[rid];
    if (rid === 'R5' && state.events.r5Matches) return state.events.r5Matches;
    return [];
  };
  const setRoundMatches = (rid, ms) => {
    const rm = { ...(state.events.roundMatches || {}) };
    rm[rid] = ms;
    window.EgtStore.setEvent(state, 'roundMatches', rm);
    setState({ ...state });
  };

  const scoreRound = rid => {
    if (!onScoreRound) { flash('Scoring is available from the app shell'); return; }
    // Make sure the latest model (SI edits etc.) is persisted before launching.
    window.EgtStore.save(state);
    // Every round can carry an individual-Nassau overlay layered on its format.
    onScoreRound(window.EgtBridge.toNativeRound(model, rid, state.stakes, { matchConfigs: roundMatchesFor(rid) }));
  };

  // Current stake for a round/format: user override, else the tournament default.
  const stakeValue = (rid, key) => {
    const override = state.stakes?.[rid]?.[key];
    if (override != null && override !== '') return override;
    return model.moneyDefaults[key];
  };
  const setStake = (rid, key, raw) => {
    const v = String(raw).replace(/[^0-9.]/g, '');
    window.EgtStore.setStake(state, rid, key, v === '' ? null : v);
    setState({ ...state });
  };

  // ── printable ─────────────────────────────────────────────────────────────
  const openPrintable = () => {
    const html = window.EgtPrintable.packet(model, state, live);
    const w = window.open('', '_blank');
    if (!w) { flash('Popup blocked — allow popups to print'); return; }
    w.document.write(`<!doctype html><html><head><title>${model.trip.name}</title></head><body>${html}</body></html>`);
    w.document.close();
  };

  // ── standings tab ─────────────────────────────────────────────────────────
  // The four season award races, live from the same engine pass that drives the
  // standings — so every Cup category (points, money, skins, birdies, putts,
  // FIR+GIR) has a visible leader before final settlement.
  const awardRaces = () => {
    const stats = live.tourneyStats || {};
    const played = model.players.filter(p => (stats[p.id]?.rounds || 0) > 0);
    const race = (label, pts, valueOf, lowest, unit) => {
      const rows = model.players.map(p => ({ pid: p.id, name: p.name, v: valueOf(p.id) }));
      let leaders = [];
      if (played.length) {
        const eligible = rows.filter(r => played.some(p => p.id === r.pid));
        const best = lowest ? Math.min(...eligible.map(r => r.v)) : Math.max(...eligible.map(r => r.v));
        leaders = eligible.filter(r => r.v === best && isFinite(r.v)).map(r => r.pid);
      }
      return { label, pts, rows, leaders, unit };
    };
    return [
      race('Skins King', '2 pts', pid => live.skins?.[pid] || 0, false, 'skins'),
      race('Birdie King (gross)', '4 pts', pid => stats[pid]?.grossBirdies || 0, false, 'gross birdies'),
      race('Par King', '2 pts', pid => stats[pid]?.pars || 0, false, 'pars'),
      race('Bogey God', '1 pt', pid => stats[pid]?.bogeys || 0, false, 'bogeys'),
      // Net Birdie King is honorary now — gross is the one that pays.
      race('Birdie King (net)', 'bragging rights', pid => stats[pid]?.netBirdies || 0, false, 'net birdies'),
      // Fewest putts needs putts actually tracked — no recorded putt holes
      // means ineligible (Infinity), not a 0-putt leader.
      race('Flat Stick (fewest putts)', '1 pt', pid => ((stats[pid]?.puttHoles || 0) > 0 ? stats[pid].putts : Infinity), true, 'putts'),
      race('Iron Man (FIR+GIR)', '1 pt', pid => (stats[pid]?.fairwaysHit || 0) + (stats[pid]?.greensInReg || 0), false, 'FIR+GIR'),
    ];
  };

  // "Where the points come from" — per-round Cup values + season awards, all
  // read from the same config the points engine scores with.
  const pointsBreakdownRows = () => {
    const rows = model.rounds
      .map(r => ({ round: r, bd: window.EgtPoints.roundPointsBreakdown(model, r.id) }))
      .filter(x => x.bd.mode !== 'none');
    const awards = window.EgtPoints.seasonAwardsBreakdown(model);
    return { rows, awards, total: rows.reduce((a, x) => a + x.bd.max, 0) + awards.max };
  };

  const Standings = () => {
    const pb = pointsBreakdownRows();
    return (
    <div>
      <div style={{ fontSize: 11, color: '#8a988f', marginBottom: 8 }}>
        EGT Cup · {pb.total} pts max per player · R2–R6 + season awards (R1 Minerals is cash-only)
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead><tr>{['Pos', 'Player', 'EGT Pts', 'Move', 'Max'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {(live.standings || []).map(r => (
            <tr key={r.player} style={{ background: r.rank === 1 ? '#eef6f0' : '#fff' }}>
              <td style={{ ...td, fontWeight: 800 }}>{r.rank}</td>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.name}</td>
              <td style={td}>{window.EgtStandings.fmtPoints(r.points)}</td>
              <td style={{ ...td, color: egtArrowColor(r.direction) }}>{egtArrow(r.direction)}{r.move ? Math.abs(r.move) : ''}</td>
              <td style={{ ...td, color: '#8a988f' }}>{r.maxPossible ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontWeight: 800, color: GREEN, fontSize: 14, margin: '4px 0 6px' }}>WHERE THE {pb.total} POINTS COME FROM</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 6 }}>
          <thead><tr>{['Round', 'How the points are earned', 'Team / Ind.', 'Max'].map(h => <th key={h} style={{ ...th, textAlign: h === 'How the points are earned' ? 'left' : 'center' }}>{h}</th>)}</tr></thead>
          <tbody>
            {pb.rows.map(({ round, bd }) => (
              <tr key={round.id}>
                <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>{round.id} <span style={{ fontWeight: 400, color: '#8a988f', fontSize: 11 }}>{model.courses[round.courseId].name}</span></td>
                <td style={{ ...td, textAlign: 'left', fontSize: 12 }}>{bd.summary}</td>
                <td style={{ ...td, fontSize: 11, fontWeight: 700, color: bd.mode === 'team' ? '#2563EB' : '#137a3f', whiteSpace: 'nowrap' }}>{bd.mode === 'team' ? 'Team 2v2' : 'Individual'}</td>
                <td style={{ ...td, fontWeight: 800 }}>{bd.max}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>Awards <span style={{ fontWeight: 400, color: '#8a988f', fontSize: 11 }}>after R6</span></td>
              <td style={{ ...td, textAlign: 'left', fontSize: 12 }}>{pb.awards.summary}</td>
              <td style={{ ...td, fontSize: 11, fontWeight: 700, color: '#137a3f' }}>Individual</td>
              <td style={{ ...td, fontWeight: 800 }}>{pb.awards.max}</td>
            </tr>
            <tr style={{ background: '#eef6f0' }}>
              <td style={{ ...td, fontWeight: 800 }} colSpan={3}>Max per player</td>
              <td style={{ ...td, fontWeight: 800 }}>{pb.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: '#8a988f', lineHeight: 1.5, marginBottom: 16 }}>
        "Max" is the most ONE player can take from each line. Team rounds pay both players on the winning side the
        full value; ranked finishes (Wolf, R6 Stableford) pay every spot, with ties splitting the pooled points.
        R1 (Minerals) pays cash only — no Cup points. Open a round on the Rounds tab for its full points table.
      </div>
      <div style={{ fontWeight: 800, color: GREEN, fontSize: 14, margin: '4px 0 6px' }}>AWARD RACES · R2–R6 · settle after R6</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead><tr>{['Award', 'Leader', 'Field'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {awardRaces().map(a => (
            <tr key={a.label}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {a.label} <span style={{ color: '#8a988f', fontWeight: 400, fontSize: 11 }}>({a.pts})</span>
              </td>
              <td style={{ ...td, fontWeight: 700, color: a.leaders.length ? '#137a3f' : '#8a988f', whiteSpace: 'nowrap' }}>
                {a.leaders.length ? a.leaders.map(nameOf).join(' & ') : '—'}
              </td>
              <td style={{ ...td, textAlign: 'left', fontSize: 11.5 }}>
                {a.rows.map((r, i) => (
                  <span key={r.pid}>{i ? ' · ' : ''}
                    <span style={{ fontWeight: a.leaders.includes(r.pid) ? 800 : 500 }}>{r.name} {isFinite(r.v) ? r.v : '—'}</span>
                  </span>
                ))}
                <span style={{ color: '#8a988f' }}> {a.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontWeight: 800, color: GREEN, fontSize: 14, margin: '4px 0 6px' }}>TOURNEY STATS · R2–R6</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead><tr>{['Player', 'Putts', 'FIR', 'GIR'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {model.players.map(p => {
            const st = live.tourneyStats?.[p.id] || {};
            return <tr key={p.id}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{p.name}</td>
              <td style={td}>{st.putts ?? 0}</td>
              <td style={td}>{st.fairwaysHit ?? 0}</td>
              <td style={td}>{st.greensInReg ?? 0}</td>
            </tr>;
          })}
        </tbody>
      </table>
      <div style={{ fontWeight: 800, color: GREEN, fontSize: 14, margin: '4px 0 6px' }}>MONEY · nets to $0</div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Player', 'Net $'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {model.players.map(p => {
            const v = live.money?.total?.[p.id] || 0;
            return <tr key={p.id}><td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{p.name}</td>
              <td style={{ ...td, color: v < 0 ? '#b3261e' : '#137a3f', fontWeight: 700 }}>{v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`}</td></tr>;
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        <Btn onClick={openPrintable}>🖨 Printable packet</Btn>
      </div>
      {!(state.finalized || []).length && <div style={{ marginTop: 12, fontSize: 12, color: '#8a988f' }}>Finalize a round (Rounds tab) to populate standings and money.</div>}
    </div>
    );
  };

  const cartText = carts => (carts || []).map(c => c.length > 1 ? c.map(nameOf).join(' + ') : `${nameOf(c[0])} (solo)`).join('  ·  ');
  const teamText = teams => (teams || []).map(t => `${t.name}: ${t.players.map(nameOf).join(' + ')}`).join('  ·  ');

  // ── one round card ────────────────────────────────────────────────────────
  const RoundCard = ({ round }) => {
    const course = model.courses[round.courseId];
    const der = model.derived[round.id];
    const isOpen = openRound === round.id;
    const finalized = state.finalized.includes(round.id);
    const teeChips = egtTeeChipsFor(round);
    const pairings = round.pairings || {};
    // Native-shaped players/course for the per-round Individual Matches config.
    const native = isOpen ? window.EgtBridge.toNativeRound(model, round.id, state.stakes) : null;
    // Match play gives the higher handicap the COURSE-handicap difference (the
    // engine's basis), so the match editor must see each player's CH for this
    // round — native players carry the raw index, which auto-fills a stroke
    // short (e.g. R5 John v TJ: HI gap 10 vs CH gap 11).
    const matchPlayers = native
      ? native.players.map(p => ({ ...p, handicap: der.courseHandicaps[p.id] ?? p.handicap }))
      : null;
    const matches = roundMatchesFor(round.id);
    // How this round's Cup points are earned (team/individual, itemized values)
    // — same config + fallbacks the points engine scores with.
    const pts = window.EgtPoints.roundPointsBreakdown(model, round.id);
    const ptsPill = pts.mode === 'none'
      ? { text: '💵 CASH ONLY · NO CUP PTS', bg: '#fff3d6', fg: '#9a6a00' }
      : { text: `🏆 ${pts.max} CUP PTS · ${pts.mode === 'team' ? 'TEAM 2v2' : 'INDIVIDUAL'}`, bg: 'rgba(200,161,90,0.16)', fg: '#7a5c1e' };
    return (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, marginBottom: 14, overflow: 'hidden', boxShadow: isOpen ? '0 2px 10px rgba(14,43,32,0.06)' : 'none' }}>
        <div onClick={() => setOpenRound(isOpen ? null : round.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', cursor: 'pointer', background: finalized ? '#eef6f0' : '#fff' }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', background: GREEN, minWidth: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{round.id}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: INK }}>{course.name}</span>
              <span style={{ fontSize: 11, color: '#8a988f', fontWeight: 700, letterSpacing: 0.3 }}>{round.date}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 2px' }}>
              {teeChips.map((t, i) => <span key={i} style={EGT_UI.teePill}>🕐 {egtTeeLabel(t)}</span>)}
              <span style={{ ...EGT_UI.teePill, background: ptsPill.bg, color: ptsPill.fg }}>{ptsPill.text}</span>
            </div>
            {pairings.carts && (
              <div style={{ fontSize: 11.5, color: '#3F5F4A', fontWeight: 700, marginTop: 4 }}>
                🛺 <span style={{ color: '#8a988f', fontWeight: 800, letterSpacing: 0.3 }}>CARTS</span> {cartText(pairings.carts)}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#5b6b63', marginTop: 5, lineHeight: 1.4 }}>{EGT_ROUND_FORMATS[round.id]}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <span style={{ color: '#8a988f', fontSize: 13 }}>{isOpen ? '▾' : '▸'}</span>
            {!course.strokeIndexVerified && <span style={{ background: '#fff3d6', color: '#9a6a00', fontSize: 9.5, fontWeight: 800, padding: '3px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>SI PENDING</span>}
            {finalized && <span style={{ background: GREEN, color: '#fff', fontSize: 9.5, fontWeight: 800, padding: '3px 7px', borderRadius: 10 }}>FINAL</span>}
          </div>
        </div>
        {isOpen && (
          <div style={{ padding: '14px 14px 16px', borderTop: `1px solid ${LINE}`, background: '#fcfdfc' }}>
            {/* Pairings & logistics — tee times, teams, cart rotation, rationale. */}
            <EgtSectionHead>Pairings &amp; Logistics</EgtSectionHead>
            <div style={{ marginBottom: 6 }}>
              <EgtField label="Tee time">{teeChips.map(egtTeeLabel).join('  ·  ') || '—'}</EgtField>
              {pts.mode === 'team' && round.teams && round.teams.length > 0 && <EgtField label="Teams">{teamText(round.teams)}</EgtField>}
              {pairings.carts && <EgtField label="Cart pairs">{cartText(pairings.carts)}</EgtField>}
            </div>
            {pairings.rationale && (
              <div style={{ fontSize: 12, color: '#5b6b63', fontStyle: 'italic', lineHeight: 1.5, background: 'rgba(200,161,90,0.06)', borderLeft: `3px solid ${GOLD}`, borderRadius: 6, padding: '8px 11px', marginBottom: 16 }}>
                {pairings.rationale}
              </div>
            )}

            {/* Cup points — what this round is worth and how it's earned. */}
            <EgtSectionHead>Cup Points</EgtSectionHead>
            {pts.mode === 'none' ? (
              <div style={{ fontSize: 12, color: '#9a6a00', background: '#fff9ec', border: '1px solid #f0e2bd', borderRadius: 8, padding: '8px 11px', marginBottom: 16, lineHeight: 1.5 }}>
                {pts.note}
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: INK, marginBottom: 6 }}>
                  <strong>{pts.mode === 'team' ? 'Team event (2v2)' : 'Individual event'}</strong>
                  <span style={{ color: '#8a988f' }}> — up to <strong style={{ color: INK }}>{pts.max} Cup points</strong> per player</span>
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 460 }}>
                  <thead><tr>{['How to earn them', 'Pts'].map(h => <th key={h} style={{ ...th, textAlign: h === 'Pts' ? 'center' : 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pts.items.map(item => (
                      <tr key={item.label}>
                        <td style={{ ...td, textAlign: 'left' }}>{item.label}</td>
                        <td style={{ ...td, fontWeight: 800, width: 52 }}>{item.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: '#8a988f', marginTop: 5, lineHeight: 1.5 }}>{pts.note}</div>
              </div>
            )}

            {/* Handicaps + pops — course handicap once, then EVERY game's pops.
                Different games take strokes on different bases (skins = full
                18-hole off the low; The Nines = 9-hole off the low over loop 2),
                so showing them per game avoids the "why only 4 pops?" confusion. */}
            <EgtSectionHead>Handicaps &amp; Pops</EgtSectionHead>
            <div style={{ fontSize: 12, color: INK, marginBottom: 10 }}>
              <span style={{ color: '#8a988f' }}>Course handicap ({course.loopsForRound === 2 ? '18-hole equivalent' : '18-hole'}): </span>
              {round.players.map((pid, i) => <span key={pid}>{i ? ' · ' : ''}<strong>{nameOf(pid)}</strong> {der.courseHandicaps[pid]}</span>)}
            </div>
            {Object.keys(der.allocations[round.players[0]].games).map(gk => {
              const basis = der.allocations[round.players[0]].games[gk].basis;
              return (
                <div key={gk} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{EGT_GAME_LABELS[gk] || gk}
                    <span style={{ fontWeight: 400, color: '#8a988f', fontSize: 11 }}> — {basis}</span></div>
                  <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                    <thead><tr>{['Player', 'Strokes', 'Pops on holes'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {round.players.map(pid => {
                        const g = der.allocations[pid].games[gk];
                        return <tr key={pid}>
                          <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{nameOf(pid)}</td>
                          <td style={td}>{g.strokes}</td>
                          <td style={{ ...td, textAlign: 'left', fontSize: 11 }}>{g.holes == null ? <em style={{ color: '#9a6a00' }}>pending SI</em> : (g.holes.map(h => h.strokes > 1 ? `${h.hole}(${h.strokes})` : h.hole).join(', ') || '—')}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {!course.strokeIndexVerified && (
              <div style={{ marginBottom: 12 }}>
                <Btn variant="gold" onClick={() => setSiEditCourse(round.courseId)}>Enter stroke index →</Btn>
              </div>
            )}

            {/* Compact score entry: gross (top) + putts (below) per player */}
            <EgtSectionHead>Scores</EgtSectionHead>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr><th style={th}>Player</th>{course.holes.slice(0, 18).map(h => <th key={h.hole} style={{ ...th, minWidth: 30 }}>{h.hole}</th>)}<th style={th}>Σ</th></tr>
                  <tr><td style={{ ...td, fontSize: 10, color: '#8a988f' }}>par</td>{course.holes.slice(0, 18).map(h => <td key={h.hole} style={{ ...td, fontSize: 10, color: '#8a988f' }}>{h.par}</td>)}<td style={td}></td></tr>
                </thead>
                <tbody>
                  {round.players.map(pid => {
                    const sc = state.scores[round.id]?.[pid] || {};
                    const tot = course.holes.slice(0, 18).reduce((a, h) => a + (sc[h.hole]?.gross || 0), 0);
                    return <tr key={pid}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{nameOf(pid)}</td>
                      {course.holes.slice(0, 18).map(h => (
                        <td key={h.hole} style={{ ...td, padding: 1 }}>
                          <input value={sc[h.hole]?.gross ?? ''} inputMode="numeric" disabled={finalized}
                            onChange={e => setGross(round.id, pid, h.hole, e.target.value.replace(/[^0-9]/g, ''))}
                            style={{ width: 26, textAlign: 'center', border: 'none', background: 'transparent', fontSize: 13, color: INK }} />
                        </td>
                      ))}
                      <td style={{ ...td, fontWeight: 700 }}>{tot || ''}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-format stakes (editable). Flow into the money engine + the
                native scorer's format trackers. */}
            <div style={{ marginTop: 16 }}><EgtSectionHead>Stakes</EgtSectionHead></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
              {(EGT_STAKE_ITEMS[round.id] || []).map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 10, padding: '6px 10px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                  <span style={{ color: '#8a988f' }}>$</span>
                  <EgtStakeInput value={stakeValue(round.id, item.key)} onCommit={v => setStake(round.id, item.key, v)} />
                  <span style={{ fontSize: 11, color: '#8a988f' }}>{item.per}</span>
                </div>
              ))}
            </div>
            {/* Individual Nassau matches — available on every round (R1–R6),
                layered on top of the round's primary format. 1v1 or 2v2, any
                players; strokes auto-fill from course handicaps (off the low in
                each match); tap holes to override. Shares the same hole-by-hole
                scoring data — no duplicate entry. */}
            <div style={{ marginTop: 16 }}>
              <EgtSectionHead>Individual Matches</EgtSectionHead>
              <div style={{ fontSize: 11.5, color: '#8a988f', margin: '0 0 4px', lineHeight: 1.45 }}>
                {EGT_MATCH_HINT[round.id] || 'Optional individual Nassau matches (front · back · overall) layered on this round — same scores, no re-entry.'}
                {' '}Add 1v1 or 2v2 matches; strokes auto-fill off the low course handicap in each match.
              </div>
              {typeof NassauMultiMatchConfig !== 'undefined' && native ? (
                <NassauMultiMatchConfig
                  roundPlayers={matchPlayers}
                  nassauMatches={matches}
                  onChange={ms => setRoundMatches(round.id, ms)}
                  course={native.course}
                  maxMatches={6}
                />
              ) : (
                <div style={{ fontSize: 12, color: '#b3261e' }}>Match setup unavailable — reload the app.</div>
              )}
              {!matches.length && (
                <div style={{ fontSize: 11, color: '#9a6a00', marginTop: 6 }}>
                  {round.id === 'R5'
                    ? 'No matches yet — the round will launch with BBB + Skins only until you add matches.'
                    : 'No individual matches yet — optional. Tap + ADD MATCH to layer a Nassau on this round.'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Btn variant="green" onClick={() => scoreRound(round.id)}>🏌️ Score this round</Btn>
              <Btn variant={finalized ? 'ghost' : 'gold'} onClick={() => toggleFinalize(round.id)}>{finalized ? 'Reopen round' : 'Finalize round'}</Btn>
            </div>
            <div style={{ fontSize: 11, color: '#8a988f', marginTop: 8 }}>
              “Score this round” opens the full hole-by-hole scorer. Finalize when done to update the Cup standings.
            </div>
          </div>
        )}
      </div>
    );
  };

  const Rounds = () => (
    <div>{model.rounds.map(r => <React.Fragment key={r.id}>{RoundCard({ round: r })}</React.Fragment>)}</div>
  );

  // ── courses tab (SI status + edit) ────────────────────────────────────────
  const Courses = () => (
    <div>
      {Object.values(model.courses).map(c => (
        <div key={c.courseId} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: '#8a988f' }}>{c.playedTee} · par {c.par} · {c.loopsForRound === 2 ? '9×2' : '18'} holes</div>
          </div>
          {c.strokeIndexVerified
            ? <span style={{ background: '#eef6f0', color: '#137a3f', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>SI VERIFIED</span>
            : <span style={{ background: '#fff3d6', color: '#9a6a00', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>SI PENDING</span>}
          <Btn variant="ghost" onClick={() => setSiEditCourse(c.courseId)}>{c.strokeIndexVerified ? 'Edit SI' : 'Enter SI'}</Btn>
        </div>
      ))}
    </div>
  );

  const tabs = [['standings', 'Standings'], ['rounds', 'Rounds'], ['courses', 'Courses']];
  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#fff', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', color: INK }}>
      <div style={{ background: GREEN, color: '#fff', padding: '16px 16px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 0.5 }}>{model.trip.name}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{model.trip.venue}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{model.trip.dates.start} – {model.trip.dates.end} · {model.trip.holes} holes</div>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '12px 4px', border: 'none', cursor: 'pointer', background: 'none',
            fontWeight: 700, fontSize: 13, color: tab === id ? GREEN : '#8a988f',
            borderBottom: tab === id ? `2px solid ${GOLD}` : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>
      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        {tab === 'standings' && Standings()}
        {tab === 'rounds' && Rounds()}
        {tab === 'courses' && Courses()}
      </div>
      {siEditCourse && (
        <EgtSiEditor
          model={model}
          courseId={siEditCourse}
          onApply={course => { persist(state); flash(`${course.name} stroke index saved — pops recomputed`); }}
          onClose={() => setSiEditCourse(null)}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
};

if (typeof window !== 'undefined') { window.EgtTournament = EgtTournament; }
