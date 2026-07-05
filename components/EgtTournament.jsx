// EgtTournament.jsx — the EGT Cup screen. Imports the embedded seed (or a
// pasted one), lets you enter scores per round, finalize rounds, fill in a
// pending stroke index, and see live standings/money plus a printable packet.
// All math lives in the engine modules (window.Egt*); this file is view + glue.

const EgtTournament = () => {
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
    if (state.finalized.includes(rid)) state.finalized = state.finalized.filter(x => x !== rid);
    else window.EgtStore.finalizeRound(state, rid);
    // A finalize triggers a full live update + snapshot.
    try { window.EgtEngine.liveUpdate(state, { season: (state.finalized || []).includes('R6') }); } catch (e) {}
    persist(state);
    flash(state.finalized.includes(rid) ? `${rid} finalized — standings updated` : `${rid} reopened`);
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
          </div>
          {!course.strokeIndexVerified && <span style={{ background: '#fff3d6', color: '#9a6a00', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>SI PENDING</span>}
          {finalized && <span style={{ background: GREEN, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 10 }}>FINAL</span>}
          <span style={{ color: '#8a988f' }}>{isOpen ? '▾' : '▸'}</span>
        </div>
        {isOpen && (
          <div style={{ padding: 12, borderTop: `1px solid ${LINE}` }}>
            {/* Course handicaps + pops summary */}
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 6 }}>COURSE HANDICAPS & POPS ({primaryGame})</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}>
              <thead><tr>{['Player', 'CH', 'Strokes', 'Pops on holes'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {round.players.map(pid => {
                  const g = der.allocations[pid].games[primaryGame];
                  return <tr key={pid}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{nameOf(pid)}</td>
                    <td style={td}>{der.courseHandicaps[pid]}</td>
                    <td style={td}>{g.strokes}</td>
                    <td style={{ ...td, textAlign: 'left', fontSize: 11 }}>{g.holes == null ? <em style={{ color: '#9a6a00' }}>pending SI</em> : (g.holes.map(h => h.strokes > 1 ? `${h.hole}(${h.strokes})` : h.hole).join(', ') || '—')}</td>
                  </tr>;
                })}
              </tbody>
            </table>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn onClick={() => toggleFinalize(round.id)}>{finalized ? 'Reopen round' : 'Finalize round'}</Btn>
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
