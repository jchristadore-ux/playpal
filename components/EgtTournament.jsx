// EgtTournament.jsx — the EGT Cup screen. Imports the embedded seed (or a
// pasted one), lets you enter scores per round, finalize rounds, fill in a
// pending stroke index, and see live standings/money plus a printable packet.
// All math lives in the engine modules (window.Egt*); this file is view + glue.

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

const EgtTournament = ({ onScoreRound }) => {
  const TH = window.PLAYPAL_THEME || {};
  const GREEN = '#0E2B20', GOLD = TH.accentGold || '#C8A15A', INK = '#12241C', LINE = '#cddbd3';
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
    const v = raw.replace(/[^0-9.]/g, '');
    window.EgtStore.setStake(state, rid, key, v === '' ? null : v);
    setState({ ...state });
  };

  // ── SI entry ──────────────────────────────────────────────────────────────
  const SiEditor = ({ courseId, onClose }) => {
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
        persist(state);
        flash(`${course.name} stroke index saved — pops recomputed`);
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

  // ── printable ─────────────────────────────────────────────────────────────
  const openPrintable = () => {
    const html = window.EgtPrintable.packet(model, state, live);
    const w = window.open('', '_blank');
    if (!w) { flash('Popup blocked — allow popups to print'); return; }
    w.document.write(`<!doctype html><html><head><title>${model.trip.name}</title></head><body>${html}</body></html>`);
    w.document.close();
  };

  // ── shared bits ───────────────────────────────────────────────────────────
  const th = { background: GREEN, color: '#fff', padding: '6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 };
  const td = { border: `1px solid ${LINE}`, padding: '5px 8px', textAlign: 'center', fontSize: 13 };
  const arrow = d => d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'new' ? '•' : '–';
  const arrowColor = d => d === 'up' ? '#137a3f' : d === 'down' ? '#b3261e' : '#8a988f';

  // ── standings tab ─────────────────────────────────────────────────────────
  const Standings = () => (
    <div>
      <div style={{ fontSize: 11, color: '#8a988f', marginBottom: 8 }}>
        EGT Cup · 30 pts max · R2–R6 count (R1 Minerals is flat/stakes-only)
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <thead><tr>{['Pos', 'Player', 'EGT Pts', 'Move', 'Max'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {(live.standings || []).map(r => (
            <tr key={r.player} style={{ background: r.rank === 1 ? '#eef6f0' : '#fff' }}>
              <td style={{ ...td, fontWeight: 800 }}>{r.rank}</td>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.name}</td>
              <td style={td}>{r.points}</td>
              <td style={{ ...td, color: arrowColor(r.direction) }}>{arrow(r.direction)}{r.move ? Math.abs(r.move) : ''}</td>
              <td style={{ ...td, color: '#8a988f' }}>{r.maxPossible ?? '—'}</td>
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

  // ── shared round-card styling (consistent structure across every card) ─────
  const secLabel = { fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 0.8, textTransform: 'uppercase', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 };
  const secRule = { flex: 1, height: 1, background: LINE };
  const teePill = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(14,43,32,0.06)', color: GREEN, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
  const teeLabel = t => (t.label && t.label !== 'Tee') ? `${t.label} · ${t.time}` : t.time;
  const teeChipsFor = round => (Array.isArray(round.teeTimes) && round.teeTimes.length)
    ? round.teeTimes : (round.teeTimeTarget ? [{ label: '', time: round.teeTimeTarget }] : []);
  const cartText = carts => (carts || []).map(c => c.length > 1 ? c.map(nameOf).join(' + ') : `${nameOf(c[0])} (solo)`).join('  ·  ');
  const teamText = teams => (teams || []).map(t => `${t.name}: ${t.players.map(nameOf).join(' + ')}`).join('  ·  ');
  const SectionHead = ({ children }) => <div style={secLabel}>{children}<span style={secRule} /></div>;
  const Field = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: '#8a988f', minWidth: 92, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{children}</div>
    </div>
  );

  const MATCH_HINT = {
    R2: 'These individual matches run alongside the four-ball team Nassau — same scores, no re-entry.',
    R5: 'These matches ARE the R5 match play — add the round-robin 1v1s (or any 2v2 mix) layered on Bingo-Bango-Bongo.',
  };

  // ── one round card ────────────────────────────────────────────────────────
  const RoundCard = ({ round }) => {
    const course = model.courses[round.courseId];
    const der = model.derived[round.id];
    const isOpen = openRound === round.id;
    const finalized = state.finalized.includes(round.id);
    const teeChips = teeChipsFor(round);
    const pairings = round.pairings || {};
    // Native-shaped players/course for the per-round Individual Matches config.
    const native = isOpen ? window.EgtBridge.toNativeRound(model, round.id, state.stakes) : null;
    const matches = roundMatchesFor(round.id);
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
              {teeChips.map((t, i) => <span key={i} style={teePill}>🕐 {teeLabel(t)}</span>)}
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
            <SectionHead>Pairings &amp; Logistics</SectionHead>
            <div style={{ marginBottom: 6 }}>
              <Field label="Tee time">{teeChips.map(teeLabel).join('  ·  ') || '—'}</Field>
              {round.teams && round.teams.length > 0 && <Field label="Teams">{teamText(round.teams)}</Field>}
              {pairings.carts && <Field label="Cart pairs">{cartText(pairings.carts)}</Field>}
            </div>
            {pairings.rationale && (
              <div style={{ fontSize: 12, color: '#5b6b63', fontStyle: 'italic', lineHeight: 1.5, background: 'rgba(200,161,90,0.06)', borderLeft: `3px solid ${GOLD}`, borderRadius: 6, padding: '8px 11px', marginBottom: 16 }}>
                {pairings.rationale}
              </div>
            )}

            {/* Handicaps + pops — course handicap once, then EVERY game's pops.
                Different games take strokes on different bases (skins = full
                18-hole off the low; The Nines = 9-hole off the low over loop 2),
                so showing them per game avoids the "why only 4 pops?" confusion. */}
            <SectionHead>Handicaps &amp; Pops</SectionHead>
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
            <SectionHead>Scores</SectionHead>
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
            <div style={{ marginTop: 16 }}><SectionHead>Stakes</SectionHead></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
              {(EGT_STAKE_ITEMS[round.id] || []).map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 10, padding: '6px 10px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                  <span style={{ color: '#8a988f' }}>$</span>
                  <input value={stakeValue(round.id, item.key)} inputMode="decimal"
                    onChange={e => setStake(round.id, item.key, e.target.value)}
                    style={{ width: 44, textAlign: 'center', border: `1px solid ${LINE}`, borderRadius: 6, padding: '4px 2px', fontSize: 13, color: INK }} />
                  <span style={{ fontSize: 11, color: '#8a988f' }}>{item.per}</span>
                </div>
              ))}
            </div>
            {round.id === 'R1' && (
              <div style={{ fontSize: 11, color: '#9a6a00', marginBottom: 4 }}>
                R1 is a flat / stakes-only round — it pays out cash but awards no EGT Cup points.
              </div>
            )}

            {/* Individual Nassau matches — available on every round (R1–R6),
                layered on top of the round's primary format. 1v1 or 2v2, any
                players; strokes auto-fill from course handicaps (off the low in
                each match); tap holes to override. Shares the same hole-by-hole
                scoring data — no duplicate entry. */}
            <div style={{ marginTop: 16 }}>
              <SectionHead>Individual Matches</SectionHead>
              <div style={{ fontSize: 11.5, color: '#8a988f', margin: '0 0 4px', lineHeight: 1.45 }}>
                {MATCH_HINT[round.id] || 'Optional individual Nassau matches (front · back · overall) layered on this round — same scores, no re-entry.'}
                {' '}Add 1v1 or 2v2 matches; strokes auto-fill off the low course handicap in each match.
              </div>
              {typeof NassauMultiMatchConfig !== 'undefined' && native ? (
                <NassauMultiMatchConfig
                  roundPlayers={native.players}
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
    <div>{model.rounds.map(r => <RoundCard key={r.id} round={r} />)}</div>
  );

  // ── pairings tab — fairness analysis proving the schedule is balanced ──────
  const Pairings = () => {
    const ids = model.players.map(p => p.id);
    const nm = pid => model.playersById[pid]?.name || pid;
    const key = (a, b) => [a, b].slice().sort().join('|');
    const inc = (m, a, b) => { if (a === b) return; const k = key(a, b); m[k] = (m[k] || 0) + 1; };
    const partner = {}, opponent = {}, cart = {};
    const teamRounds = [];
    model.rounds.forEach(r => {
      (r.teams || []).forEach(t => { const q = t.players; for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) inc(partner, q[i], q[j]); });
      if (r.teams && r.teams.length === 2) {
        const a = r.teams[0].players, b = r.teams[1].players;
        a.forEach(x => b.forEach(y => inc(opponent, x, y)));
        teamRounds.push(r);
      } else if (r.id !== 'R6') { // R6 singles seeded off standings — opponents TBD
        const q = r.players; for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) inc(opponent, q[i], q[j]);
      }
      ((r.pairings && r.pairings.carts) || []).forEach(c => { if (c.length === 2) inc(cart, c[0], c[1]); });
    });
    const pairVals = m => { const out = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(m[key(ids[i], ids[j])] || 0); return out; };
    const spread = arr => arr.length ? `${Math.min(...arr)}–${Math.max(...arr)}` : '—';
    const everyoneRidesAll = ids.every(pid => { let n = 0; ids.forEach(o => { if (o !== pid && (cart[key(pid, o)] || 0) > 0) n++; }); return n === ids.length - 1; });
    const balRows = teamRounds.map(r => {
      const der = model.derived[r.id].courseHandicaps;
      const sum = t => t.players.reduce((a, pid) => a + (der[pid] || 0), 0);
      const s1 = sum(r.teams[0]), s2 = sum(r.teams[1]);
      return { id: r.id, course: model.courses[r.courseId].name, t1: r.teams[0].players.map(nm).join(' + '), t2: r.teams[1].players.map(nm).join(' + '), s1, s2, diff: Math.abs(s1 - s2) };
    });
    const avgDiff = balRows.length ? (balRows.reduce((a, r) => a + r.diff, 0) / balRows.length).toFixed(1) : '—';

    const Matrix = ({ title, m, accent }) => (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, marginBottom: 6 }}>{title}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 320 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}></th>{ids.map(pid => <th key={pid} style={th}>{nm(pid)}</th>)}</tr></thead>
            <tbody>
              {ids.map(a => (
                <tr key={a}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, background: '#f4f8f5' }}>{nm(a)}</td>
                  {ids.map(b => {
                    if (a === b) return <td key={b} style={{ ...td, color: '#c7d3cb', background: '#f4f8f5' }}>—</td>;
                    const v = m[key(a, b)] || 0;
                    return <td key={b} style={{ ...td, fontWeight: v >= 2 ? 800 : 600, color: v === 0 ? '#c0392b' : v >= 2 ? accent : INK, background: v === 0 ? '#fdf0ee' : '#fff' }}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    const Stat = ({ label, value, good }) => (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', flex: '1 1 140px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: '#8a988f', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: good ? '#137a3f' : INK, marginTop: 3 }}>{value}</div>
      </div>
    );

    return (
      <div>
        <div style={{ fontSize: 12, color: '#5b6b63', lineHeight: 1.5, marginBottom: 14 }}>
          The official EGT pairings are optimized across the whole trip — not one round at a time — to balance teams by
          handicap, rotate riding partners so everyone shares a cart with everyone else, and even out teammates and
          opponents. The matrices below prove it. Counts show how many times each pair appears together.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <Stat label="Teammate spread" value={spread(pairVals(partner))} good={Math.max(...pairVals(partner)) - Math.min(...pairVals(partner)) <= 1} />
          <Stat label="Opponent spread" value={spread(pairVals(opponent))} good={Math.max(...pairVals(opponent)) - Math.min(...pairVals(opponent)) <= 1} />
          <Stat label="Cart coverage" value={everyoneRidesAll ? 'All ✓' : 'Partial'} good={everyoneRidesAll} />
          <Stat label="Avg team Δ (CH)" value={avgDiff} good={Number(avgDiff) <= 6} />
        </div>
        <Matrix title="Partner (teammate) frequency" m={partner} accent={GOLD} />
        <Matrix title="Opponent frequency — team rounds + R1/R3/R5 all-play-all (R6 singles seeded, excluded)" m={opponent} accent="#2563EB" />
        <Matrix title="Cart-partner frequency" m={cart} accent={GOLD} />

        <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, marginBottom: 6 }}>Handicap balance — team rounds</div>
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Round', 'Course', 'Team 1 (Σ CH)', 'Team 2 (Σ CH)', 'Δ'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {balRows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 800 }}>{r.id}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.course}</td>
                  <td style={td}>{r.t1} ({r.s1})</td>
                  <td style={td}>{r.t2} ({r.s2})</td>
                  <td style={{ ...td, fontWeight: 800, color: r.diff <= 6 ? '#137a3f' : '#9a6a00' }}>{r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#8a988f', lineHeight: 1.5 }}>
          Course handicaps are off the White tees. Deltas are raw sums before each format's allowance (four-ball 90%,
          aggregate Stableford 85%) and best-ball/aggregate scoring compress them further, so the on-course match is
          tighter than the raw Δ suggests. R3 (Wolf), R5 (Bingo-Bango-Bongo + round-robin 1v1) and R6 (championship
          singles) are individual formats with no fixed teams.
        </div>
      </div>
    );
  };

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

  const tabs = [['standings', 'Standings'], ['rounds', 'Rounds'], ['pairings', 'Pairings'], ['courses', 'Courses']];
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
        {tab === 'standings' && <Standings />}
        {tab === 'rounds' && <Rounds />}
        {tab === 'pairings' && <Pairings />}
        {tab === 'courses' && <Courses />}
      </div>
      {siEditCourse && <SiEditor courseId={siEditCourse} onClose={() => setSiEditCourse(null)} />}
      {toast && <Toast message={toast} />}
    </div>
  );
};

if (typeof window !== 'undefined') { window.EgtTournament = EgtTournament; }
