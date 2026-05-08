// LiveScorecard.jsx — Full scorecard modal for use during a live round

const LiveScorecardModal = ({
  onClose,
  players, course, scores, putts, popFlags, wolfData, nassauMatches, holeIdx,
  hasWolf, hasPTM, hasNassau, hasStable, hasSkins,
  wolfFmt, ptmFmt, skinsFmt, nassauFmtObj,
}) => {
  const {
    totalScore, totalVsPar, calcWolfStandings, calcStablefordPoints,
    calcSkins, computePTMState, getAdjustedHoleScore, nassauSegmentStatus,
  } = window;

  const [tab, setTab] = React.useState('scorecard');
  const hasFormats = hasWolf || hasPTM || hasNassau || hasStable || hasSkins;

  const frontPar = course.holes.slice(0, 9).reduce((a, h) => a + h.par, 0);
  const backPar  = course.holes.slice(9, 18).reduce((a, h) => a + h.par, 0);
  const totalPar = frontPar + backPar;

  const scoreColor = (s, par) => {
    if (!s) return '#E7E3D9';
    const d = s - par;
    if (d <= -2) return '#C8A15A';
    if (d === -1) return '#15803D';
    if (d === 0)  return '#6B7280';
    if (d === 1)  return '#DC2626';
    return '#991B1B';
  };

  const frontTotal = (pid) => {
    const sum = (scores[pid] || []).slice(0, 9).reduce((a, s) => a + (s || 0), 0);
    return sum > 0 ? sum : null;
  };
  const backTotal = (pid) => {
    const sum = (scores[pid] || []).slice(9, 18).reduce((a, s) => a + (s || 0), 0);
    return sum > 0 ? sum : null;
  };

  // ── Wolf standings ────────────────────────────────────────────────────────
  const wolfPts = React.useMemo(() => {
    if (!hasWolf) return {};
    return calcWolfStandings(scores, wolfData, players, course);
  }, [JSON.stringify(scores), JSON.stringify(wolfData)]);

  // ── Stableford points ─────────────────────────────────────────────────────
  const stablefordPts = React.useMemo(() => {
    if (!hasStable) return {};
    return Object.fromEntries(players.map(p => [
      p.id,
      course.holes.reduce((a, h, i) =>
        a + calcStablefordPoints(getAdjustedHoleScore(scores, popFlags || {}, p.id, i), h.par), 0),
    ]));
  }, [JSON.stringify(scores), JSON.stringify(popFlags)]);

  // ── Skins ─────────────────────────────────────────────────────────────────
  const skinsData = React.useMemo(() => {
    if (!hasSkins) return { skins: {} };
    return calcSkins(scores, players, course, skinsFmt?.stakes || 1, popFlags || {});
  }, [JSON.stringify(scores), JSON.stringify(popFlags)]);

  // ── PTM state ─────────────────────────────────────────────────────────────
  const ptmState = React.useMemo(() => {
    if (!hasPTM) return { holderId: players[0]?.id, log: [] };
    return computePTMState(scores, putts || {}, players, course, players[0]?.id);
  }, [JSON.stringify(scores), JSON.stringify(putts)]);

  // ── Nassau match statuses ─────────────────────────────────────────────────
  const nassauStatuses = React.useMemo(() => {
    if (!hasNassau || !nassauMatches?.length) return [];
    return nassauMatches.map((match, idx) => {
      const matchCfg = {
        playersInMatch: match.playersInMatch,
        matchType: match.matchType,
        teams: match.teams || null,
        popHoles: match.popHoles || {},
      };
      const front   = nassauSegmentStatus(scores, players, course, Array.from({length:9},  (_, i) => i),    holeIdx, {}, matchCfg);
      const back    = nassauSegmentStatus(scores, players, course, Array.from({length:9},  (_, i) => i+9),  holeIdx, {}, matchCfg);
      const overall = nassauSegmentStatus(scores, players, course, Array.from({length:18}, (_, i) => i),    holeIdx, {}, matchCfg);
      const matchPlayers = (match.playersInMatch || []).map(id => players.find(p => p.id === id)).filter(Boolean);
      return { match, idx, front, back, overall, matchPlayers };
    });
  }, [JSON.stringify(scores), holeIdx]);

  // ── Stroke play leaderboard ───────────────────────────────────────────────
  const leaderboard = React.useMemo(() => {
    return [...players].map(p => ({
      ...p,
      gross: totalScore(scores, p.id),
      vsPar: totalVsPar(scores, p.id, course.holes),
      holesPlayed: (scores[p.id] || []).filter(Boolean).length,
    })).sort((a, b) => a.vsPar - b.vsPar || a.gross - b.gross);
  }, [JSON.stringify(scores)]);

  const MATCH_COLORS = ['#C8A15A', '#7B9FE0', '#E07BE0'];

  // ── Table cell th/td styles ───────────────────────────────────────────────
  const th = { padding:'5px 5px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:9, letterSpacing:1.5, color:'#6B7280', textAlign:'center', borderBottom:'2px solid #E7E3D9', whiteSpace:'nowrap' };
  const td = { padding:'7px 5px', textAlign:'center', borderBottom:'1px solid #F0EDE4' };
  const thMid = { ...th, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9' };
  const tdMid = { ...td, fontWeight:800, fontSize:13, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9' };

  return (
    <div style={{position:'fixed', inset:0, zIndex:1500, background:'#F6F4EE', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      {/* Header */}
      <div style={{flexShrink:0, background:'#0E2B20', padding:'0 16px', height:52, display:'flex', alignItems:'center', gap:12}}>
        <button onClick={onClose}
          style={{background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8,
            color:'#F6F4EE', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13,
            padding:'6px 12px', cursor:'pointer', WebkitTapHighlightColor:'transparent', display:'flex', alignItems:'center', gap:4, flexShrink:0}}>
          ‹ CLOSE
        </button>
        <div style={{flex:1, textAlign:'center', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:'#F6F4EE', letterSpacing:2}}>
          SCORECARD
        </div>
        <div style={{width:80, flexShrink:0}}/>
      </div>

      {/* Tab bar */}
      {hasFormats && (
        <div style={{flexShrink:0, display:'flex', background:'#FFFFFF', borderBottom:'1px solid #E7E3D9'}}>
          {[['scorecard','📊 SCORECARD'], ['standings','🏆 STANDINGS']].map(([id, lbl]) => (
            <div key={id} onClick={() => setTab(id)}
              style={{flex:1, padding:'13px 6px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
                fontWeight:700, fontSize:12, letterSpacing:1.5, textAlign:'center', cursor:'pointer',
                color: tab===id ? '#C8A15A' : '#6B7280',
                borderBottom: tab===id ? '2px solid #C8A15A' : '2px solid transparent',
                WebkitTapHighlightColor:'transparent'}}>
              {lbl}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div style={{flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch'}}>

        {/* ── SCORECARD TAB ────────────────────────────────────────────────── */}
        {tab === 'scorecard' && (
          <div>
            <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
              <table style={{borderCollapse:'collapse', fontSize:12, width:'max-content', minWidth:'100%'}}>
                <thead>
                  {/* Hole number row */}
                  <tr>
                    <th style={{...th, textAlign:'left', minWidth:80, position:'sticky', left:0, background:'#F6F4EE', zIndex:2}}>PLAYER</th>
                    {course.holes.slice(0, 9).map(h => (
                      <th key={h.num} style={{...th, minWidth:26,
                        background: h.num-1===holeIdx ? 'rgba(200,161,90,0.18)' : undefined}}>
                        {h.num}
                      </th>
                    ))}
                    <th style={thMid}>OUT</th>
                    {course.holes.slice(9, 18).map(h => (
                      <th key={h.num} style={{...th, minWidth:26,
                        background: h.num-1===holeIdx ? 'rgba(200,161,90,0.18)' : undefined}}>
                        {h.num}
                      </th>
                    ))}
                    <th style={thMid}>IN</th>
                    <th style={{...th, color:'#0E2B20', minWidth:32}}>TOT</th>
                    <th style={{...th, color:'#0E2B20', minWidth:32}}>+/−</th>
                  </tr>
                  {/* PAR row */}
                  <tr>
                    <td style={{...td, textAlign:'left', color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:11, position:'sticky', left:0, background:'#F6F4EE', zIndex:2}}>PAR</td>
                    {course.holes.slice(0, 9).map((h, i) => (
                      <td key={i} style={{...td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:11,
                        background: i===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                        {h.par}
                      </td>
                    ))}
                    <td style={{...tdMid, color:'#8A9E8A'}}>{frontPar}</td>
                    {course.holes.slice(9, 18).map((h, i) => (
                      <td key={i+9} style={{...td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:11,
                        background: i+9===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                        {h.par}
                      </td>
                    ))}
                    <td style={{...tdMid, color:'#8A9E8A'}}>{backPar}</td>
                    <td style={{...td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600}}>{totalPar}</td>
                    <td style={{...td, color:'#8A9E8A'}}>—</td>
                  </tr>
                  {/* HDCP row */}
                  <tr>
                    <td style={{...td, textAlign:'left', color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:1, position:'sticky', left:0, background:'#F6F4EE', zIndex:2}}>HCP</td>
                    {course.holes.slice(0, 9).map((h, i) => (
                      <td key={i} style={{...td, color:'#8A9E8A', fontSize:10,
                        background: i===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                        {h.hdcp}
                      </td>
                    ))}
                    <td style={tdMid}>—</td>
                    {course.holes.slice(9, 18).map((h, i) => (
                      <td key={i+9} style={{...td, color:'#8A9E8A', fontSize:10,
                        background: i+9===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                        {h.hdcp}
                      </td>
                    ))}
                    <td style={tdMid}>—</td>
                    <td style={td}/>
                    <td style={td}/>
                  </tr>
                </thead>

                <tbody>
                  {players.map(p => {
                    const vs  = totalVsPar(scores, p.id, course.holes);
                    const tot = totalScore(scores, p.id);
                    const ft  = frontTotal(p.id);
                    const bt  = backTotal(p.id);
                    return (
                      <tr key={p.id}>
                        <td style={{...td, textAlign:'left', position:'sticky', left:0, background:'#FFFFFF', zIndex:2}}>
                          <div style={{display:'flex', alignItems:'center', gap:5}}>
                            <div style={{width:7, height:7, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                          </div>
                        </td>
                        {course.holes.slice(0, 9).map((h, i) => {
                          const s = scores[p.id]?.[i];
                          const hasPop = !!(popFlags?.[p.id]?.[i]);
                          return (
                            <td key={i} style={{...td, color:scoreColor(s, h.par), fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13,
                              background: i===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                              {s || '·'}
                              {hasPop && <span style={{display:'inline-block', marginLeft:1, fontSize:6, color:'#C8A15A', verticalAlign:'super'}}>●</span>}
                            </td>
                          );
                        })}
                        <td style={tdMid}>{ft || '·'}</td>
                        {course.holes.slice(9, 18).map((h, i) => {
                          const ri = i + 9;
                          const s  = scores[p.id]?.[ri];
                          const hasPop = !!(popFlags?.[p.id]?.[ri]);
                          return (
                            <td key={ri} style={{...td, color:scoreColor(s, h.par), fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13,
                              background: ri===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                              {s || '·'}
                              {hasPop && <span style={{display:'inline-block', marginLeft:1, fontSize:6, color:'#C8A15A', verticalAlign:'super'}}>●</span>}
                            </td>
                          );
                        })}
                        <td style={tdMid}>{bt || '·'}</td>
                        <td style={{...td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:'#0E2B20'}}>{tot || '—'}</td>
                        <td style={{...td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14,
                          color: vs<0?'#15803D':vs===0?'#6B7280':'#DC2626'}}>
                          {tot ? (vs===0?'E':vs>0?`+${vs}`:vs) : '—'}
                        </td>
                      </tr>
                    );
                  })}

                  {/* PUTTS row */}
                  {putts && (
                    <tr>
                      <td style={{...td, textAlign:'left', color:'#8A9E8A', fontSize:10, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, letterSpacing:1, position:'sticky', left:0, background:'#F6F4EE', zIndex:2}}>PUTTS</td>
                      {course.holes.slice(0, 9).map((_, i) => {
                        const tot = players.reduce((a, p) => a + (putts[p.id]?.[i] || 0), 0);
                        return (
                          <td key={i} style={{...td, color:'#8A9E8A', fontSize:11,
                            background: i===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                            {tot || '·'}
                          </td>
                        );
                      })}
                      <td style={{...tdMid, color:'#8A9E8A', fontWeight:600}}>
                        {players.reduce((a, p) => a + (putts[p.id]||[]).slice(0,9).reduce((b,v) => b+(v||0), 0), 0) || '·'}
                      </td>
                      {course.holes.slice(9, 18).map((_, i) => {
                        const ri = i + 9;
                        const tot = players.reduce((a, p) => a + (putts[p.id]?.[ri] || 0), 0);
                        return (
                          <td key={ri} style={{...td, color:'#8A9E8A', fontSize:11,
                            background: ri===holeIdx ? 'rgba(200,161,90,0.12)' : undefined}}>
                            {tot || '·'}
                          </td>
                        );
                      })}
                      <td style={{...tdMid, color:'#8A9E8A', fontWeight:600}}>
                        {players.reduce((a, p) => a + (putts[p.id]||[]).slice(9,18).reduce((b,v) => b+(v||0), 0), 0) || '·'}
                      </td>
                      <td style={{...td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                        {players.reduce((a, p) => a + (putts[p.id]||[]).reduce((b,v) => b+(v||0), 0), 0)}
                      </td>
                      <td style={td}/>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Course info */}
            <div style={{padding:'12px 16px', display:'flex', gap:16, flexWrap:'wrap'}}>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>
                <span style={{fontWeight:700, color:'#3F5F4A'}}>{course.name}</span>
              </div>
              {course.rating && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>Rating: {course.rating} / Slope: {course.slope}</div>}
            </div>

            {/* Currently on hole indicator */}
            <div style={{padding:'0 16px 16px'}}>
              <div style={{background:'rgba(200,161,90,0.06)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:8, padding:'6px 12px',
                fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#C8A15A', letterSpacing:1}}>
                ▶ CURRENTLY ON HOLE {holeIdx + 1} — PAR {course.holes[holeIdx]?.par}
              </div>
            </div>
          </div>
        )}

        {/* ── STANDINGS TAB ─────────────────────────────────────────────────── */}
        {tab === 'standings' && (
          <div style={{padding:'14px 14px', display:'flex', flexDirection:'column', gap:12}}>

            {/* Stroke Play Leaderboard — always shown */}
            <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:14, overflow:'hidden'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9'}}>
                <span style={{fontSize:16}}>⛳</span>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>STROKE PLAY</span>
                <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>THRU {Math.max(...players.map(p => (scores[p.id]||[]).filter(Boolean).length))}H</span>
              </div>
              {leaderboard.map((p, i) => {
                const vsColor = p.vsPar<0?'#15803D':p.vsPar===0?'#6B7280':'#DC2626';
                return (
                  <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                    borderBottom:'1px solid #F0EDE4',
                    background: i===0 ? 'rgba(200,161,90,0.04)' : 'transparent'}}>
                    <div style={{
                      width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      background: i===0?'rgba(200,161,90,0.15)':'rgba(14,43,32,0.06)',
                      border: i===0?'1px solid rgba(200,161,90,0.4)':'1px solid rgba(14,43,32,0.1)',
                      fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:11,
                      color: i===0?'#C8A15A':'#3F5F4A', flexShrink:0}}>
                      {i+1}
                    </div>
                    <Avatar player={p} size={28}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20'}}>{p.name}</div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>{p.holesPlayed}H played</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:20, color:vsColor, lineHeight:1}}>
                        {p.holesPlayed===0 ? '—' : p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar}
                      </div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>{p.gross||'—'} gross</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Wolf standings */}
            {hasWolf && (
              <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:14, overflow:'hidden'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9'}}>
                  <span style={{fontSize:16}}>🐺</span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>WOLF</span>
                  {wolfFmt?.stakes && <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>${wolfFmt.stakes} round pot</span>}
                </div>
                {[...players].sort((a, b) => (wolfPts[b.id]||0) - (wolfPts[a.id]||0)).map((p, i) => {
                  const pts = wolfPts[p.id] || 0;
                  return (
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #F0EDE4'}}>
                      <Avatar player={p} size={28}/>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1}}>{p.name}</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:20, color:pts>0?'#15803D':pts<0?'#DC2626':'#6B7280'}}>
                        {pts>0?`+${pts}`:pts} <span style={{fontSize:11, fontWeight:600, color:'#8A9E8A'}}>pts</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Nassau matches */}
            {hasNassau && nassauStatuses.map(({ match, idx, front, back, overall, matchPlayers }) => {
              const mc = MATCH_COLORS[idx] || '#C8A15A';
              const stake = match.stakes || nassauFmtObj?.stakes || 5;
              const statusColor = s => s === 'EVEN' ? '#6B7280' : mc;
              return (
                <div key={match.id || idx} style={{background:'#FFFFFF', border:`1px solid ${mc}30`, borderRadius:14, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9', background:`${mc}08`}}>
                    <span style={{fontSize:16}}>💰</span>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>
                      NASSAU {nassauStatuses.length > 1 ? `— MATCH ${idx+1}` : ''}
                    </span>
                    <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>${stake}·${stake}·${stake*2}</span>
                  </div>
                  {matchPlayers.length >= 2 && (
                    <div style={{display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderBottom:'1px solid #F0EDE4'}}>
                      {matchPlayers.map((mp, mi) => (
                        <React.Fragment key={mp.id}>
                          {mi > 0 && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>vs</span>}
                          <div style={{display:'flex', alignItems:'center', gap:4}}>
                            <div style={{width:6, height:6, borderRadius:'50%', background:mp.color}}/>
                            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20'}}>{mp.name.split(' ')[0]}</span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  <div style={{display:'flex', gap:0}}>
                    {[['FRONT 9', front, stake], ['BACK 9', back, stake], ['18 HOLES', overall, stake*2]].map(([lbl, status, betStake], si) => (
                      <div key={lbl} style={{flex:1, padding:'10px 12px', borderRight: si < 2 ? '1px solid #F0EDE4' : 'none'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:9, letterSpacing:1.5, color:'#8A9E8A'}}>{lbl}</div>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#8A9E8A'}}>${betStake}</div>
                        </div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:statusColor(status)}}>{status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Stableford */}
            {hasStable && (
              <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:14, overflow:'hidden'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9'}}>
                  <span style={{fontSize:16}}>⭐</span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>STABLEFORD</span>
                </div>
                {[...players].sort((a, b) => (stablefordPts[b.id]||0) - (stablefordPts[a.id]||0)).map(p => {
                  const pts = stablefordPts[p.id] || 0;
                  return (
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #F0EDE4'}}>
                      <Avatar player={p} size={28}/>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1}}>{p.name}</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:20, color:pts>=10?'#C8A15A':pts>=5?'#15803D':'#6B7280'}}>
                        {pts} <span style={{fontSize:11, fontWeight:600, color:'#8A9E8A'}}>pts</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Skins */}
            {hasSkins && (
              <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:14, overflow:'hidden'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9'}}>
                  <span style={{fontSize:16}}>🎴</span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>SKINS</span>
                  {skinsFmt?.stakes && <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>${skinsFmt.stakes}/skin</span>}
                </div>
                {[...players].sort((a, b) => (skinsData.skins[b.id]||0) - (skinsData.skins[a.id]||0)).map(p => {
                  const n = skinsData.skins[p.id] || 0;
                  return (
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #F0EDE4'}}>
                      <Avatar player={p} size={28}/>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1}}>{p.name}</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:20, color:n>0?'#C8A15A':'#6B7280'}}>
                        {n} <span style={{fontSize:11, fontWeight:600, color:'#8A9E8A'}}>skin{n!==1?'s':''}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pass the Money */}
            {hasPTM && (
              <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:14, overflow:'hidden'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:'1px solid #E7E3D9'}}>
                  <span style={{fontSize:16}}>💸</span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>PASS THE MONEY</span>
                  {ptmFmt?.stakes && <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>${ptmFmt.stakes} pot</span>}
                </div>
                {players.map(p => {
                  const isHolder = ptmState.holderId === p.id;
                  return (
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      borderBottom:'1px solid #F0EDE4',
                      background: isHolder ? 'rgba(200,161,90,0.05)' : 'transparent',
                      border: isHolder ? '1px solid rgba(200,161,90,0.15)' : undefined}}>
                      <Avatar player={p} size={28}/>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1}}>{p.name}</span>
                      {isHolder && (
                        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13, color:'#C8A15A',
                          background:'rgba(200,161,90,0.1)', border:'1px solid rgba(200,161,90,0.3)', borderRadius:20, padding:'3px 10px'}}>
                          💰 HOLDS
                        </span>
                      )}
                    </div>
                  );
                })}
                {ptmState.log.length > 0 && (
                  <div style={{padding:'10px 14px', borderTop:'1px solid #F0EDE4'}}>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:1.5, color:'#8A9E8A', marginBottom:6}}>PASS HISTORY</div>
                    <div style={{display:'flex', flexDirection:'column', gap:4}}>
                      {ptmState.log.slice(-4).reverse().map((e, i) => {
                        const from = players.find(p => p.id === e.fromId);
                        const to   = players.find(p => p.id === e.toId);
                        return from && to ? (
                          <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                            <span style={{fontSize:10, color:'#8A9E8A', minWidth:22}}>H{e.holeIdx+1}</span>
                            <span style={{color:from.color, fontWeight:600}}>{from.name.split(' ')[0]}</span>
                            <span>→</span>
                            <span style={{color:to.color, fontWeight:600}}>{to.name.split(' ')[0]}</span>
                            <span style={{marginLeft:'auto', fontSize:10, color:e.final?'#DC2626':'#8A9E8A'}}>{e.final ? '↩ RETURNED' : e.reason}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

Object.assign(window, { LiveScorecardModal });
