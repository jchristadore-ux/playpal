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
  R5: 'Loop 1 — 2-man scramble (35% low + 15% high), net stroke play. Loop 2 — alternate shot (50% combined), match play; the weaker team gets the difference on the lowest-index holes.',
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
  R4: [{ key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R5: [{ key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
  R6: [{ key: 'skinsAnte', label: 'Skins', per: 'per skin' }],
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

  // Boot: load persisted state or import the embedded seed.
  React.useEffect(() => {
    try {
      const seed = typeof seedText === 'string' ? JSON.parse(seedText) : seedText;
      let st = window.EgtStore.load(seed.trip.id);
      if (st) window.EgtStore.rehydrate(st);
      else st = window.EgtStore.importSeed(seed);
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

  const scoreRound = rid => {
    if (!onScoreRound) { flash('Scoring is available from the app shell'); return; }
    // Make sure the latest model (SI edits etc.) is persisted before launching.
    window.EgtStore.save(state);
    onScoreRound(window.EgtBridge.toNativeRound(model, rid, state.stakes));
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

  // ── one round card ────────────────────────────────────────────────────────
  const RoundCard = ({ round }) => {
    const course = model.courses[round.courseId];
    const der = model.derived[round.id];
    const isOpen = openRound === round.id;
    const finalized = state.finalized.includes(round.id);
    const primaryGame = Object.keys(model.derived[round.id].allocations[round.players[0]].games).filter(g => g !== 'skinsNet')[0] || 'skinsNet';
    return (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
        <div onClick={() => setOpenRound(isOpen ? null : round.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', background: finalized ? '#eef6f0' : '#fff' }}>
          <div style={{ fontWeight: 800, color: GREEN, minWidth: 34 }}>{round.id}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{course.name}</div>
            <div style={{ fontSize: 11, color: '#8a988f' }}>{round.date} · {round.primaryGame}</div>
            <div style={{ fontSize: 11, color: '#5b6b63', marginTop: 3, lineHeight: 1.35 }}>{EGT_ROUND_FORMATS[round.id]}</div>
          </div>
          {!course.strokeIndexVerified && <span style={{ background: '#fff3d6', color: '#9a6a00', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>SI PENDING</span>}
          {finalized && <span style={{ background: GREEN, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>FINAL</span>}
          <span style={{ color: '#8a988f' }}>{isOpen ? '▾' : '▸'}</span>
        </div>
        {isOpen && (
          <div style={{ padding: 12, borderTop: `1px solid ${LINE}` }}>
            {/* Handicaps + pops — course handicap once, then EVERY game's pops.
                Different games take strokes on different bases (skins = full
                18-hole off the low; The Nines = 9-hole off the low over loop 2),
                so showing them per game avoids the "why only 4 pops?" confusion. */}
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 6 }}>HANDICAPS & POPS</div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 6 }}>SCORES</div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, margin: '14px 0 6px' }}>STAKES</div>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
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
        {tab === 'standings' && <Standings />}
        {tab === 'rounds' && <Rounds />}
        {tab === 'courses' && <Courses />}
      </div>
      {siEditCourse && <SiEditor courseId={siEditCourse} onClose={() => setSiEditCourse(null)} />}
      {toast && <Toast message={toast} />}
    </div>
  );
};

if (typeof window !== 'undefined') { window.EgtTournament = EgtTournament; }
