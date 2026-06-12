// StatsScreen.jsx — performance dashboard, trends, and round comparison.
// All numbers derive on demand from locally saved round snapshots via
// RoundHistoryService + StatsService (no double bookkeeping).

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 14, padding: '12px 14px', minWidth: 0 }}>
    <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 9, letterSpacing: 1.5, color: '#8A9E8A' }}>{label}</div>
    <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 900, fontSize: 24, color: accent || '#0E2B20', marginTop: 4, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 10, color: '#3F5F4A', marginTop: 4 }}>{sub}</div>}
  </div>
);

const TrendChart = ({ trend }) => {
  const recent = trend.filter(t => t.complete).slice(-12);
  if (recent.length < 2) {
    return <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#8A9E8A', padding: '12px 0' }}>Play two full rounds to see your trend.</div>;
  }
  const min = Math.min(...recent.map(t => t.gross));
  const max = Math.max(...recent.map(t => t.gross));
  const span = Math.max(1, max - min);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, paddingTop: 8 }}>
      {recent.map((t, i) => {
        const h = 24 + Math.round(70 * (1 - (t.gross - min) / span));
        const best = t.gross === min;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 10, color: best ? '#C8A15A' : '#3F5F4A' }}>{t.gross}</span>
            <div title={t.courseName} style={{ width: '100%', maxWidth: 26, height: h, borderRadius: 6, background: best ? '#C8A15A' : '#1F3D2E', opacity: best ? 1 : 0.75 }} />
          </div>
        );
      })}
    </div>
  );
};

const DistributionBars = ({ totals }) => {
  const rows = [
    ['Eagles+', totals.eagles + totals.aces, '#B45309'],
    ['Birdies', totals.birdies, '#15803D'],
    ['Pars', totals.pars, '#6B7280'],
    ['Bogeys', totals.bogeys, '#DC2626'],
    ['Doubles', totals.doubles, '#991B1B'],
    ['Triple+', totals.triplePlus, '#7F1D1D'],
  ];
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([label, n, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#3F5F4A', width: 52, flexShrink: 0 }}>{label}</span>
          <div style={{ flex: 1, height: 14, background: '#F0EDE4', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(100 * n / max)}%`, height: '100%', background: color, borderRadius: 7, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 12, color: '#0E2B20', width: 30, textAlign: 'right' }}>{n}</span>
        </div>
      ))}
    </div>
  );
};

const CompareTable = ({ cmp, labelA, labelB }) => (
  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {['HOLE', labelA, labelB, '±'].map(h => (
            <th key={h} style={{ padding: '6px 8px', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: 1, color: '#8A9E8A', textAlign: 'center', borderBottom: '1px solid #E7E3D9', whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cmp.rows.filter(r => r.a || r.b).map(r => (
          <tr key={r.num} style={{ background: r.num % 2 === 0 ? '#F6F4EE' : '#FFFFFF' }}>
            <td style={cmpS.td}>{r.num}</td>
            <td style={cmpS.td}>{r.a || '·'}</td>
            <td style={cmpS.td}>{r.b || '·'}</td>
            <td style={{ ...cmpS.td, fontWeight: 800, color: r.diff === null ? '#8A9E8A' : r.diff < 0 ? '#15803D' : r.diff > 0 ? '#DC2626' : '#6B7280' }}>
              {r.diff === null ? '·' : r.diff === 0 ? 'E' : r.diff > 0 ? `+${r.diff}` : r.diff}
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cmpS.td, fontWeight: 800 }}>TOT</td>
          <td style={{ ...cmpS.td, fontWeight: 800 }}>{cmp.a.gross}</td>
          <td style={{ ...cmpS.td, fontWeight: 800 }}>{cmp.b.gross}</td>
          <td style={{ ...cmpS.td, fontWeight: 800, color: cmp.a.gross - cmp.b.gross < 0 ? '#15803D' : cmp.a.gross - cmp.b.gross > 0 ? '#DC2626' : '#6B7280' }}>
            {cmp.a.gross - cmp.b.gross === 0 ? 'E' : cmp.a.gross - cmp.b.gross > 0 ? `+${cmp.a.gross - cmp.b.gross}` : cmp.a.gross - cmp.b.gross}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);

const cmpS = {
  td: { padding: '5px 8px', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 13, color: '#0E2B20', textAlign: 'center' },
};

const StatsScreen = ({ players, initialPlayerId }) => {
  const [history] = React.useState(() => window.RoundHistoryService.listRoundData());
  const [pid, setPid] = React.useState(() => initialPlayerId || (players[0] && players[0].id));
  const [cmpA, setCmpA] = React.useState('');
  const [cmpB, setCmpB] = React.useState('');

  const player = players.find(p => p.id === pid) || players[0];

  const career = React.useMemo(() => {
    if (!player) return null;
    return window.ProfileService.career(player.id, history);
  }, [pid, history]);

  const playerRounds = React.useMemo(
    () => history.filter(d => d.scores[pid] && d.scores[pid].some(s => s > 0)),
    [pid, history]
  );

  const cmp = React.useMemo(() => {
    const a = playerRounds.find(d => d.syncCode === cmpA);
    const b = playerRounds.find(d => d.syncCode === cmpB);
    if (!a || !b || a === b) return null;
    return window.StatsService.compareRounds(a, b, pid);
  }, [cmpA, cmpB, pid, playerRounds]);

  const fmt1 = (v) => v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1);
  const pct = (v) => v === null || v === undefined ? '—' : v + '%';

  if (!player) {
    return <div style={stS.root}><div style={stS.empty}>Add players on the Home screen to see stats.</div></div>;
  }

  const selectStyle = { flex: 1, minWidth: 0, padding: '10px 12px', background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 10, fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 600, color: '#0E2B20', outline: 'none' };

  return (
    <div style={stS.root}>
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 800, fontSize: 24, color: '#0E2B20' }}>STATS & TRENDS</div>
        <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 13, color: '#3F5F4A', marginTop: 4 }}>
          From {history.length} saved round{history.length !== 1 ? 's' : ''} on this device
        </div>

        {/* Player picker */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          {players.map(p => {
            const on = p.id === pid;
            return (
              <div key={p.id} onClick={() => setPid(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px 7px 8px', borderRadius: 22,
                  cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent',
                  background: on ? `${p.color}12` : '#FFFFFF',
                  border: on ? `1.5px solid ${p.color}` : '1px solid #E7E3D9',
                }}>
                <Avatar player={p} size={24} />
                <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 13, color: on ? p.color : '#3F5F4A' }}>
                  {p.name.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {(!career || career.roundsPlayed === 0) ? (
        <div style={stS.empty}>
          No saved rounds for {player.name.split(' ')[0]} yet.<br />
          Finish a round and it lands here automatically.
        </div>
      ) : (
        <div style={{ padding: '14px 16px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <StatCard label="ROUNDS" value={career.roundsPlayed} sub={`${career.completeRounds} full 18s`} />
            <StatCard label="SCORING AVG" value={career.avgGross !== null ? fmt1(career.avgGross) : '—'} sub="full rounds" accent="#C8A15A" />
            <StatCard label="BEST ROUND" value={career.bests.gross ? career.bests.gross.value : '—'} sub={career.bests.gross ? career.bests.gross.courseName : ''} accent="#15803D" />
            <StatCard label="FAIRWAYS" value={pct(career.firPct)} sub="FIR" />
            <StatCard label="GREENS" value={pct(career.girPct)} sub="GIR" />
            <StatCard label="PUTTS / RD" value={career.puttsPerRound !== null ? fmt1(career.puttsPerRound) : '—'} sub="full rounds" />
          </div>

          {/* Trend */}
          <div style={stS.panel}>
            <Label>SCORING TREND</Label>
            <TrendChart trend={career.trend} />
          </div>

          {/* Distribution */}
          <div style={stS.panel}>
            <Label>SCORE DISTRIBUTION</Label>
            <div style={{ marginTop: 10 }}>
              <DistributionBars totals={career.totals} />
            </div>
          </div>

          {/* Par splits + short game */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <StatCard label="PAR 3 AVG" value={fmt1(career.parAverages[3])} />
            <StatCard label="PAR 4 AVG" value={fmt1(career.parAverages[4])} />
            <StatCard label="PAR 5 AVG" value={fmt1(career.parAverages[5])} />
            <StatCard label="SAND SAVES" value={pct(career.sandSavePct)} sub="when tracked" />
            <StatCard label="UP & DOWNS" value={pct(career.upDownPct)} sub="when tracked" />
            <StatCard label="PENALTIES" value={career.totals.penalties} sub="lifetime" />
          </div>

          {/* Personal bests */}
          <div style={stS.panel}>
            <Label>PERSONAL BESTS</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {[
                ['🏆 Low round', career.bests.gross ? `${career.bests.gross.value} at ${career.bests.gross.courseName}` : null],
                ['🎯 Best vs par', career.bests.toPar ? `${career.bests.toPar.value > 0 ? '+' : ''}${career.bests.toPar.value} at ${career.bests.toPar.courseName}` : null],
                ['🐦 Most birdies', career.bests.birdiesInRound && career.bests.birdiesInRound.value > 0 ? `${career.bests.birdiesInRound.value} at ${career.bests.birdiesInRound.courseName}` : null],
                ['⛳ Best nine', career.bests.bestNine ? `${career.bests.bestNine.gross} (${career.bests.bestNine.label}) at ${career.bests.bestNine.courseName}` : null],
                ['🥄 Fewest putts', career.bests.fewestPutts ? `${career.bests.fewestPutts.value} at ${career.bests.fewestPutts.courseName}` : null],
                ['🚀 Longest drive', career.longestDrive ? `${career.longestDrive.value} yds at ${career.longestDrive.courseName}` : null],
                ['🎱 Longest putt', career.longestPutt ? `${career.longestPutt.value} ft at ${career.longestPutt.courseName}` : null],
                ['🗺️ Most played', career.mostPlayedCourse ? `${career.mostPlayedCourse.name} (${career.mostPlayedCourse.count}×)` : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#3F5F4A', flexShrink: 0 }}>{k}</span>
                  <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 12, color: '#0E2B20', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Compare rounds */}
          {playerRounds.length >= 2 && (
            <div style={stS.panel}>
              <Label>COMPARE ROUNDS</Label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {[[cmpA, setCmpA, 'Round A'], [cmpB, setCmpB, 'Round B']].map(([val, set, ph], i) => (
                  <select key={i} value={val} onChange={e => set(e.target.value)} aria-label={`Compare ${ph}`} style={selectStyle}>
                    <option value="">{ph}…</option>
                    {playerRounds.map(d => (
                      <option key={d.syncCode || d.savedAt} value={d.syncCode}>
                        {d.course.name}{d.date ? ` · ${d.date}` : ''}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              {cmp ? (
                <div style={{ marginTop: 12 }}>
                  <CompareTable cmp={cmp}
                    labelA={(playerRounds.find(d => d.syncCode === cmpA) || {}).date || 'A'}
                    labelB={(playerRounds.find(d => d.syncCode === cmpB) || {}).date || 'B'} />
                </div>
              ) : (
                <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#8A9E8A', marginTop: 10 }}>
                  Pick two different rounds to compare hole by hole.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const stS = {
  root:  { flex: 1, overflowY: 'auto', background: '#F6F4EE', display: 'flex', flexDirection: 'column' },
  empty: { fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 13, color: '#8A9E8A', textAlign: 'center', padding: '48px 24px', lineHeight: 1.7 },
  panel: { background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, padding: '14px 16px' },
};

Object.assign(window, { StatsScreen });
