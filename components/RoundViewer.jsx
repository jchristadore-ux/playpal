// RoundViewer.jsx — Read-only historical round viewer

const RoundViewer = ({ syncCode, onBack }) => {
  const { calcAllPayouts, calcWolfStandings, computePTMState, calcStablefordPoints,
          totalScore, totalVsPar, getAdjustedHoleScore } = window;

  const [status,   setStatus]   = React.useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = React.useState('');
  const [roundDoc, setRoundDoc] = React.useState(null);
  const [tab,      setTab]      = React.useState('scorecard');

  React.useEffect(() => {
    if (!syncCode) { setErrorMsg('No round code provided.'); setStatus('error'); return; }
    if (!window.RoundSyncService) { setErrorMsg('Sync service unavailable.'); setStatus('error'); return; }
    window.RoundSyncService.fetchRound(syncCode, function(round, err) {
      if (!round) {
        setErrorMsg(err === 'Round not found'
          ? `Round "${syncCode}" not found in the database.`
          : `Could not load round: ${err || 'Unknown error'}`);
        setStatus('error');
        return;
      }
      setRoundDoc(round);
      setStatus('ready');
    });
  }, [syncCode]);

  if (status === 'loading') {
    return (
      <div style={rvS.root}>
        <div style={rvS.topBar}>
          <button onClick={onBack} style={rvS.backBtn}>‹ BACK</button>
          <span style={rvS.topTitle}>ROUND HISTORY</span>
          <span style={{width:60}}/>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
          <div style={{width:36,height:36,border:'3px solid #1E3A6E',borderTopColor:'#3DCB6C',borderRadius:'50%',animation:'rvSpin 0.8s linear infinite'}}/>
          <div style={{fontFamily:'Barlow Condensed',fontSize:15,letterSpacing:1,color:'#7A98BC'}}>LOADING ROUND…</div>
        </div>
        <style>{`@keyframes rvSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={rvS.root}>
        <div style={rvS.topBar}>
          <button onClick={onBack} style={rvS.backBtn}>‹ BACK</button>
          <span style={rvS.topTitle}>ROUND HISTORY</span>
          <span style={{width:60}}/>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:'0 24px'}}>
          <div style={{fontSize:40}}>⚠️</div>
          <div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:18,color:'#E5534B',textAlign:'center'}}>{errorMsg}</div>
          <button onClick={onBack} style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:14,letterSpacing:1,color:'#7A98BC',background:'none',border:'1px solid #1E3A6E',borderRadius:8,padding:'10px 24px',cursor:'pointer'}}>GO BACK</button>
        </div>
      </div>
    );
  }

  // ── Data reconstruction ───────────────────────────────────────────────────
  const { players, course, formats, holeScores, syncCode: code } = roundDoc;

  const scores   = {};
  const putts    = {};
  const popFlags = {};

  players.forEach(p => {
    const hs = holeScores?.[p.id] || [];
    scores[p.id]   = Array.from({length:18}, (_, i) => hs[i]?.strokes   || null);
    putts[p.id]    = Array.from({length:18}, (_, i) => hs[i]?.putts      || 0);
    popFlags[p.id] = Array.from({length:18}, (_, i) => !!(hs[i]?.gettingPop));
  });

  const ptmState = formats.some(f => f.type === 'passmoney')
    ? computePTMState(scores, putts, players, course, players[0]?.id)
    : { holderId: null, log: [] };

  const payouts = calcAllPayouts(
    scores, roundDoc.wolfData || {}, players, course,
    formats, roundDoc.nassauPresses || [], ptmState.holderId, popFlags
  );

  const wolfPts = formats.some(f => f.type === 'wolf')
    ? calcWolfStandings(scores, roundDoc.wolfData || {}, players, course)
    : {};

  const stablefordPts = Object.fromEntries(players.map(p => [
    p.id,
    course.holes.reduce((a, h, i) =>
      a + calcStablefordPoints(getAdjustedHoleScore(scores, popFlags, p.id, i), h.par), 0)
  ]));

  const leaderboard = [...players].map(p => ({
    ...p,
    gross:  totalScore(scores, p.id),
    vsPar:  totalVsPar(scores, p.id, course.holes),
    payout: payouts[p.id] || 0,
    stPts:  stablefordPts[p.id] || 0,
  })).sort((a, b) => a.vsPar - b.vsPar);

  const debts = [];
  players.forEach(debtor => {
    if ((payouts[debtor.id] || 0) >= 0) return;
    const owed = Math.abs(payouts[debtor.id]);
    const creditors = players
      .filter(p => (payouts[p.id] || 0) > 0)
      .sort((a, b) => (payouts[b.id]||0) - (payouts[a.id]||0));
    if (creditors.length) debts.push({ from: debtor, to: creditors[0], amount: owed });
  });

  const parTotal = course.holes.reduce((a, h) => a + h.par, 0);
  const tabs = [['scorecard','📊 SCORES'], ['payouts','💰 PAYOUTS']];

  return (
    <div style={rvS.root}>

      {/* Top bar */}
      <div style={rvS.topBar}>
        <button onClick={onBack} style={rvS.backBtn}>‹ BACK</button>
        <span style={rvS.topTitle}>ROUND HISTORY</span>
        <span style={{width:60}}/>
      </div>

      {/* Hero */}
      <div style={rvS.hero}>
        <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:11,letterSpacing:3,color:'#7A98BC'}}>COMPLETED ROUND</div>
        <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:22,color:'#fff',marginTop:2,textAlign:'center'}}>{course.name}</div>
        <div style={{fontFamily:'DM Sans',fontSize:12,color:'#7A98BC'}}>{roundDoc.date || new Date(roundDoc.id).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
        <div style={{display:'flex',gap:7,marginTop:10,flexWrap:'wrap',justifyContent:'center'}}>
          {leaderboard.map((p, i) => (
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:7,background:'#0F2040',
              border:`1px solid ${i===0?'#C9A84C':'#1E3A6E'}`,borderRadius:22,padding:'5px 12px 5px 7px'}}>
              <Avatar player={p} size={26}/>
              <div>
                <div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:13,color:i===0?'#C9A84C':'#fff',lineHeight:1}}>
                  {p.name.split(' ')[0]}
                </div>
                <div style={{fontFamily:'Barlow Condensed',fontSize:11,
                  color:p.vsPar<0?'#3DCB6C':p.vsPar===0?'#7A98BC':'#E5534B'}}>
                  {p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar} · {p.gross||'—'}
                </div>
              </div>
              {i===0 && <span style={{fontSize:14}}>🏆</span>}
            </div>
          ))}
        </div>
        <div style={{marginTop:8,background:'rgba(122,152,188,0.08)',border:'1px solid rgba(122,152,188,0.2)',
          borderRadius:6,padding:'4px 12px',fontFamily:'Barlow Condensed',fontWeight:700,
          fontSize:10,letterSpacing:1.5,color:'#4A6890'}}>
          READ-ONLY · CODE {code}
        </div>
      </div>

      {/* Tabs */}
      <div style={rvS.tabBar}>
        {tabs.map(([id, lbl]) => (
          <div key={id} onClick={() => setTab(id)}
            style={{...rvS.tab,
              color:tab===id?'#C9A84C':'#7A98BC',
              borderBottom:tab===id?'2px solid #C9A84C':'2px solid transparent'}}>
            {lbl}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={rvS.content}>

        {/* ── SCORECARD ── */}
        {tab === 'scorecard' && (
          <div>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
              <table style={rvS.table}>
                <thead>
                  <tr>
                    <th style={{...rvS.th,textAlign:'left',minWidth:80}}>PLAYER</th>
                    {course.holes.map(h => (
                      <th key={h.num} style={{...rvS.th,color:h.num<=9?'#7A98BC':'#9BB4D4',minWidth:26}}>{h.num}</th>
                    ))}
                    <th style={{...rvS.th,color:'#fff'}}>TOT</th>
                    <th style={{...rvS.th,color:'#fff'}}>+/−</th>
                  </tr>
                  <tr>
                    <td style={{...rvS.td,color:'#4A6890',fontFamily:'Barlow Condensed',fontWeight:600,fontSize:11}}>PAR</td>
                    {course.holes.map(h => (
                      <td key={h.num} style={{...rvS.td,color:'#4A6890',fontFamily:'Barlow Condensed',fontWeight:600,fontSize:12}}>{h.par}</td>
                    ))}
                    <td style={{...rvS.td,color:'#4A6890',fontFamily:'Barlow Condensed',fontWeight:600}}>{parTotal}</td>
                    <td style={{...rvS.td,color:'#4A6890'}}>—</td>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => {
                    const vs = totalVsPar(scores, p.id, course.holes);
                    return (
                      <tr key={p.id}>
                        <td style={{...rvS.td,textAlign:'left'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                            <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:13,color:'#fff',whiteSpace:'nowrap'}}>
                              {p.name.split(' ')[0]}
                            </span>
                          </div>
                        </td>
                        {course.holes.map((h, i) => {
                          const s = scores[p.id]?.[i];
                          const d = s ? s - h.par : null;
                          const c = d===null?'#2A4A6E':d<=-2?'#FFD700':d===-1?'#3DCB6C':d===0?'#9BB4D4':d===1?'#E5534B':'#C0392B';
                          const hasPop = !!(popFlags[p.id]?.[i]);
                          return (
                            <td key={i} style={{...rvS.td,color:c,fontFamily:'Barlow Condensed',fontWeight:700,fontSize:14}}>
                              {s || '·'}
                              {hasPop && <span style={{display:'inline-block',marginLeft:1,fontSize:7,color:'#C9A84C',verticalAlign:'super'}}>●</span>}
                            </td>
                          );
                        })}
                        <td style={{...rvS.td,fontFamily:'Barlow Condensed',fontWeight:800,fontSize:15,color:'#fff'}}>
                          {totalScore(scores,p.id)||'—'}
                        </td>
                        <td style={{...rvS.td,fontFamily:'Barlow Condensed',fontWeight:800,fontSize:15,
                          color:vs<0?'#3DCB6C':vs===0?'#7A98BC':'#E5534B'}}>
                          {vs===0?'E':vs>0?`+${vs}`:vs}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Putts row */}
                  <tr>
                    <td style={{...rvS.td,color:'#4A6890',fontSize:10,fontFamily:'Barlow Condensed',letterSpacing:1}}>PUTTS</td>
                    {course.holes.map((_, i) => {
                      const tot = players.reduce((a, p) => a + (putts[p.id]?.[i] || 0), 0);
                      return <td key={i} style={{...rvS.td,color:'#4A6890',fontSize:12,fontFamily:'Barlow Condensed'}}>{tot||'·'}</td>;
                    })}
                    <td style={{...rvS.td,color:'#4A6890',fontFamily:'Barlow Condensed'}}>
                      {players.reduce((a,p) => a + (putts[p.id]||[]).reduce((b,v)=>b+v,0), 0)}
                    </td>
                    <td style={{...rvS.td}}/>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Putts per player */}
            <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:6}}>
              <Label style={{marginBottom:4}}>PUTTS BY PLAYER</Label>
              {players.map(p => {
                const total = (putts[p.id]||[]).reduce((a,b)=>a+b,0);
                return (
                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,background:'#0F2040',
                    border:'1px solid #1E3A6E',borderRadius:10,padding:'10px 14px'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                    <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:14,color:'#fff',flex:1}}>
                      {p.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:18,color:'#9BB4D4'}}>{total}</span>
                    <span style={{fontFamily:'Barlow Condensed',fontSize:11,color:'#4A6890'}}>PUTTS</span>
                  </div>
                );
              })}
            </div>

            {/* Wolf standings */}
            {Object.keys(wolfPts).length > 0 && (
              <div style={{marginTop:16}}>
                <Label style={{marginBottom:8,display:'block'}}>WOLF STANDINGS</Label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {players.map(p => (
                    <div key={p.id} style={{flex:1,minWidth:72,background:'#0F2040',border:'1px solid #1E3A6E',
                      borderRadius:10,padding:'10px',textAlign:'center'}}>
                      <div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:12,color:'#fff'}}>
                        {p.name.split(' ')[0]}
                      </div>
                      <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:20,
                        color:(wolfPts[p.id]||0)>0?'#3DCB6C':(wolfPts[p.id]||0)<0?'#E5534B':'#7A98BC'}}>
                        {(wolfPts[p.id]||0)>0?'+':''}{wolfPts[p.id]||0}
                      </div>
                      <div style={{fontFamily:'Barlow Condensed',fontSize:9,color:'#4A6890'}}>PTS</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PAYOUTS ── */}
        {tab === 'payouts' && (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {formats.map(f => {
              const info = FORMAT_INFO[f.type];
              return (
                <div key={f.type} style={{background:'#0F2040',border:'1px solid #1E3A6E',borderRadius:12,overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',borderBottom:'1px solid #1E3A6E'}}>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:16,color:'#fff'}}>{info.label}</span>
                    <span style={{marginLeft:'auto',fontFamily:'Barlow Condensed',fontSize:13,color:'#C9A84C'}}>
                      {f.type==='wolf'       ? `$${f.stakes} round pot`       :
                       f.type==='passmoney'  ? `$${f.stakes} round pot`       :
                       f.type==='nassau'     ? `$${f.stakes}/bet`             :
                       f.type==='skins'      ? `$${f.stakes}/skin`            :
                       f.type==='stableford' ? `$${f.stakes} winner takes all`: ''}
                    </span>
                  </div>
                  {players.map(p => {
                    const v = payouts[p.id] || 0;
                    return (
                      <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid #0A1628'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:15,color:'#fff'}}>{p.name}</span>
                          {f.type==='wolf' && (
                            <div style={{fontFamily:'Barlow Condensed',fontSize:11,color:'#7A98BC'}}>{wolfPts[p.id]||0} wolf pts</div>
                          )}
                          {f.type==='stableford' && (
                            <div style={{fontFamily:'Barlow Condensed',fontSize:11,color:'#FFD700'}}>{stablefordPts[p.id]||0} pts</div>
                          )}
                          {f.type==='passmoney' && ptmState.holderId===p.id && (
                            <div style={{fontFamily:'Barlow Condensed',fontSize:11,color:'#C9A84C'}}>💰 held the money</div>
                          )}
                        </div>
                        <span style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:20,
                          color:v>0?'#3DCB6C':v<0?'#E5534B':'#7A98BC'}}>
                          {v>0?'+':''}{v===0?'—':`$${Math.abs(v).toFixed(0)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Net settlement */}
            <div style={{background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:12,padding:'16px'}}>
              <Label style={{color:'#C9A84C',display:'block',marginBottom:12}}>NET SETTLEMENT</Label>
              {debts.length === 0
                ? <div style={{fontFamily:'DM Sans',fontSize:13,color:'#7A98BC'}}>All square — no money changed hands 🎉</div>
                : debts.map((d, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(201,168,76,0.15)'}}>
                    <Avatar player={d.from} size={26}/>
                    <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:14,color:'#fff',flex:1}}>
                      {d.from.name.split(' ')[0]} → {d.to.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:22,color:'#C9A84C'}}>${d.amount.toFixed(0)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const rvS = {
  root:    { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0A1628' },
  topBar:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 12px',
             height:48, background:'#050E1C', borderBottom:'1px solid #1E3A6E', flexShrink:0 },
  backBtn: { background:'none', border:'none', cursor:'pointer', fontFamily:'Barlow Condensed',
             fontWeight:700, fontSize:16, letterSpacing:1, color:'#7A98BC', padding:'8px 4px',
             WebkitTapHighlightColor:'transparent' },
  topTitle:{ fontFamily:'Barlow Condensed', fontWeight:800, fontSize:16, letterSpacing:2, color:'#C9A84C' },
  hero:    { padding:'16px 16px 14px', borderBottom:'1px solid #1E3A6E', flexShrink:0,
             background:'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 70%)',
             display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:4 },
  tabBar:  { display:'flex', borderBottom:'1px solid #1E3A6E', flexShrink:0 },
  tab:     { flex:1, padding:'12px 6px', fontFamily:'Barlow Condensed', fontWeight:700,
             fontSize:12, letterSpacing:1, textAlign:'center', cursor:'pointer', transition:'color 0.15s' },
  content: { flex:1, padding:'16px', overflowY:'auto', WebkitOverflowScrolling:'touch' },
  table:   { borderCollapse:'collapse', fontSize:13, width:'max-content', minWidth:'100%' },
  th:      { padding:'6px 6px', fontFamily:'Barlow Condensed', fontWeight:600, letterSpacing:1,
             fontSize:10, color:'#7A98BC', textAlign:'center', borderBottom:'2px solid #1E3A6E', whiteSpace:'nowrap' },
  td:      { padding:'8px 5px', textAlign:'center', borderBottom:'1px solid #0F2040' },
};

Object.assign(window, { RoundViewer });
