// Summary.jsx — updated design system

const SummaryScreen = ({ round, scores, wolfData, putts, nassauPresses, manualChips, popFlags, onNewRound, readOnly }) => {
  const { calcAllPayouts, calcWolfStandings, computePTMState, calcStablefordPoints, totalScore, totalVsPar, getAdjustedHoleScore } = window;
  const { players, course, formats, syncCode } = round;
  const [toast, setToast]       = React.useState(null);
  const [tab, setTab]           = React.useState('scorecard');
  const [ghinStep, setGhinStep] = React.useState('idle');
  const [emailSent, setEmailSent] = React.useState(false);
  const [venmoSent, setVenmoSent] = React.useState({});

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const ptmState = React.useMemo(() =>
    formats.some(f => f.type === 'passmoney')
      ? computePTMState(scores, putts || {}, players, course, players[0].id)
      : { holderId: null, log: [] },
  []);

  const payouts = React.useMemo(() =>
    calcAllPayouts(scores, wolfData, players, course, formats, nassauPresses || [], ptmState.holderId, popFlags || {}),
  []);

  const wolfPts = React.useMemo(()=>
    formats.some(f=>f.type==='wolf') ? calcWolfStandings(scores, wolfData, players, course) : {},
  []);

  const stablefordPts = React.useMemo(() =>
    Object.fromEntries(players.map(p => [p.id, course.holes.reduce((a,h,i) => a + calcStablefordPoints(getAdjustedHoleScore(scores, popFlags||{}, p.id, i), h.par), 0)])),
  []);

  const leaderboard = [...players].map(p=>({
    ...p,
    gross:  totalScore(scores, p.id),
    vsPar:  totalVsPar(scores, p.id, course.holes),
    payout: payouts[p.id]||0,
    stPts:  stablefordPts[p.id]||0,
  })).sort((a,b)=>a.vsPar-b.vsPar);

  const debts = [];
  players.forEach(debtor => {
    if ((payouts[debtor.id]||0) >= 0) return;
    const owed = Math.abs(payouts[debtor.id]);
    const creditors = players.filter(p=>(payouts[p.id]||0)>0).sort((a,b)=>(payouts[b.id]||0)-(payouts[a.id]||0));
    if (creditors.length) debts.push({ from:debtor, to:creditors[0], amount:owed });
  });

  const openVenmo = (from, to, amount) => {
    const note    = `PlayPal Golf · ${course.name} · ${new Date().toLocaleDateString()}`;
    const encoded = encodeURIComponent(note);
    const venmoHandle = to.venmo.replace('@','');
    const deepLink = `venmo://paycharge?txn=pay&recipients=${venmoHandle}&amount=${amount.toFixed(2)}&note=${encoded}`;
    const webLink  = `https://venmo.com/${venmoHandle}?txn=pay&amount=${amount.toFixed(2)}&note=${encoded}`;
    const a = document.createElement('a'); a.href = deepLink; a.click();
    setTimeout(()=>{ window.open(webLink,'_blank'); }, 1200);
    setVenmoSent(prev=>({...prev,[from.id]:true}));
    showToast(`Venmo request sent to @${venmoHandle}`);
  };

  const postToGhin = () => {
    setGhinStep('logging');
    setTimeout(()=>{ setGhinStep('posted'); showToast('Scores posted to GHIN ✓'); }, 2200);
  };

  const buildScorecardEmail = () => {
    const date = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const parTotal = course.holes.reduce((a,h)=>a+h.par,0);
    let body = `SCORECARD — ${course.name}\n${date}\n${'─'.repeat(60)}\n\n`;
    const nameW = Math.max(...players.map(p=>p.name.length), 6);
    const pad = (s, w) => String(s).padStart(w);
    const lpad = (s, w) => String(s).padEnd(w);
    body += lpad('HOLE', nameW+2);
    course.holes.forEach(h => { body += pad(h.num, 4); });
    body += pad('TOT', 6) + pad('+/-', 6) + '\n';
    body += lpad('PAR', nameW+2);
    course.holes.forEach(h => { body += pad(h.par, 4); });
    body += pad(parTotal, 6) + pad('—', 6) + '\n';
    body += `${'─'.repeat(nameW+2+course.holes.length*4+12)}\n`;
    players.forEach(p => {
      body += lpad(p.name, nameW+2);
      course.holes.forEach((h,i) => { const s=scores[p.id]?.[i]; body += pad(s||'·', 4); });
      const tot = totalScore(scores, p.id);
      const vs  = totalVsPar(scores, p.id, course.holes);
      body += pad(tot||'—', 6) + pad(vs===0?'E':vs>0?`+${vs}`:vs, 6) + '\n';
    });
    body += `\n${'─'.repeat(60)}\nSent via PlayPal Golf\n`;
    return body;
  };

  const sendEmail = () => {
    const body    = buildScorecardEmail();
    const subject = `Scorecard — ${course.name} — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
    const emails  = players.map(p=>p.email).filter(Boolean).join(',');
    const mailto  = `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
    setEmailSent(true);
    showToast(`Scorecard opened in Mail for ${players.length} players`);
  };

  const tabs = readOnly
    ? [['scorecard','📊 SCORES'],['payouts','💰 PAYOUTS']]
    : [['scorecard','📊 SCORES'],['payouts','💰 PAYOUTS'],['actions','📤 SEND']];

  const inputStyle = { background:'#0B0F1A', border:'1px solid #1F3354', borderRadius:8, padding:'10px 12px', color:'#fff', fontFamily:'DM Sans', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box' };

  return (
    <div style={sumS.root}>
      {/* Hero */}
      <div style={sumS.hero}>
        {readOnly
          ? <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, letterSpacing:3, color:'#7A9EBF'}}>COMPLETED ROUND</div>
          : <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, letterSpacing:3, color:'#2DD97A'}}>ROUND COMPLETE</div>
        }
        <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:24, color:'#fff', marginTop:2}}>{course.name}</div>
        <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A9EBF'}}>
          {round.date || new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
        </div>

        <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap', justifyContent:'center'}}>
          {leaderboard.map((p,i)=>(
            <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, background:'#0F1D35',
              border:`1px solid ${i===0?'#D4AF47':'#1F3354'}`, borderRadius:22, padding:'5px 12px 5px 7px'}}>
              <Avatar player={p} size={26}/>
              <div>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:i===0?'#D4AF47':'#fff', lineHeight:1}}>
                  {p.name.split(' ')[0]}
                </div>
                <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:p.vsPar<0?'#2DD97A':p.vsPar===0?'#7A9EBF':'#E5534B'}}>
                  {p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar} · {p.gross||'—'}
                  {p.stPts>0 && <span style={{color:'#FFD700', marginLeft:4}}>★{p.stPts}</span>}
                </div>
              </div>
              {i===0 && <span style={{fontSize:14}}>🏆</span>}
            </div>
          ))}
        </div>

        {readOnly && syncCode && (
          <div style={{marginTop:8, background:'rgba(122,152,188,0.06)', border:'1px solid rgba(122,152,188,0.15)', borderRadius:6, padding:'4px 12px', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#3A5880'}}>
            READ-ONLY · CODE {syncCode}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={sumS.tabBar}>
        {tabs.map(([id,lbl])=>(
          <div key={id} onClick={()=>setTab(id)} style={{...sumS.tab, color:tab===id?'#D4AF47':'#7A9EBF', borderBottom:tab===id?'2px solid #D4AF47':'2px solid transparent'}}>
            {lbl}
          </div>
        ))}
      </div>

      <div style={sumS.content}>

        {/* SCORECARD */}
        {tab==='scorecard' && (
          <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
            <table style={sumS.table}>
              <thead>
                <tr>
                  <th style={{...sumS.th, textAlign:'left', minWidth:90}}>PLAYER</th>
                  {course.holes.map(h=><th key={h.num} style={{...sumS.th, color:h.num<=9?'#7A9EBF':'#9BB4D4', minWidth:28}}>{h.num}</th>)}
                  <th style={{...sumS.th, color:'#fff'}}>TOT</th>
                  <th style={{...sumS.th, color:'#fff'}}>+/−</th>
                </tr>
                <tr>
                  <td style={{...sumS.td, color:'#3A5880', fontFamily:'Barlow Condensed', fontWeight:600, fontSize:11}}>PAR</td>
                  {course.holes.map(h=><td key={h.num} style={{...sumS.td, color:'#3A5880', fontFamily:'Barlow Condensed', fontWeight:600, fontSize:12}}>{h.par}</td>)}
                  <td style={{...sumS.td, color:'#3A5880', fontFamily:'Barlow Condensed', fontWeight:600}}>{course.holes.reduce((a,h)=>a+h.par,0)}</td>
                  <td style={{...sumS.td, color:'#3A5880'}}>—</td>
                </tr>
              </thead>
              <tbody>
                {players.map(p=>{
                  const vs = totalVsPar(scores,p.id,course.holes);
                  return (
                    <tr key={p.id}>
                      <td style={{...sumS.td, textAlign:'left'}}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <div style={{width:7, height:7, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                          <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:'#fff', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                        </div>
                      </td>
                      {course.holes.map((h,i)=>{
                        const s=scores[p.id]?.[i]; const d=s?s-h.par:null;
                        const c=d===null?'#1F3354':d<=-2?'#FFD700':d===-1?'#2DD97A':d===0?'#9BB4D4':d===1?'#E5534B':'#C0392B';
                        const hasPop = !!(popFlags?.[p.id]?.[i]);
                        return (
                          <td key={i} style={{...sumS.td, color:c, fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14}}>
                            {s||'·'}
                            {hasPop && <span style={{display:'inline-block',marginLeft:1,fontSize:7,color:'#D4AF47',verticalAlign:'super'}}>●</span>}
                          </td>
                        );
                      })}
                      <td style={{...sumS.td, fontFamily:'Barlow Condensed', fontWeight:800, fontSize:15, color:'#fff'}}>{totalScore(scores,p.id)||'—'}</td>
                      <td style={{...sumS.td, fontFamily:'Barlow Condensed', fontWeight:800, fontSize:15, color:vs<0?'#2DD97A':vs===0?'#7A9EBF':'#E5534B'}}>{vs===0?'E':vs>0?`+${vs}`:vs}</td>
                    </tr>
                  );
                })}
                {putts && <tr>
                  <td style={{...sumS.td, color:'#3A5880', fontSize:11, fontFamily:'Barlow Condensed', letterSpacing:1}}>PUTTS</td>
                  {course.holes.map((_,i)=>{
                    const tot = players.reduce((a,p)=>a+(putts[p.id]?.[i]||0),0);
                    return <td key={i} style={{...sumS.td, color:'#3A5880', fontSize:12, fontFamily:'Barlow Condensed'}}>{tot||'·'}</td>;
                  })}
                  <td style={{...sumS.td, color:'#3A5880', fontFamily:'Barlow Condensed'}}>{players.reduce((a,p)=>a+(putts[p.id]||[]).reduce((b,v)=>b+v,0),0)}</td>
                  <td style={{...sumS.td}}/>
                </tr>}
              </tbody>
            </table>

            {Object.keys(wolfPts).length>0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>WOLF STANDINGS</Label>
                <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  {players.map(p=>(
                    <div key={p.id} style={{flex:1, minWidth:80, background:'#0F1D35', border:'1px solid #1F3354', borderRadius:10, padding:'10px', textAlign:'center'}}>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:'#fff'}}>{p.name.split(' ')[0]}</div>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:22, color:(wolfPts[p.id]||0)>0?'#2DD97A':(wolfPts[p.id]||0)<0?'#E5534B':'#7A9EBF'}}>
                        {(wolfPts[p.id]||0)>0?'+':''}{wolfPts[p.id]||0} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PAYOUTS */}
        {tab==='payouts' && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {formats.map(f=>{
              const info = FORMAT_INFO[f.type];
              return (
                <div key={f.type} style={{background:'#0F1D35', border:'1px solid #1F3354', borderRadius:14, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #1F3354'}}>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{info.label}</span>
                    <span style={{marginLeft:'auto', fontFamily:'Barlow Condensed', fontSize:13, color:'#D4AF47'}}>
                      {f.type==='wolf'      ? `$${f.stakes} round pot` :
                       f.type==='passmoney' ? `$${f.stakes} round pot` :
                       f.type==='nassau'    ? `$${f.stakes}·$${f.stakes}·$${f.stakes*2}` :
                       f.type==='skins'     ? `$${f.stakes}/skin` :
                       f.type==='stableford'? `$${f.stakes} winner takes all` : ''}
                    </span>
                  </div>
                  {players.map(p=>{
                    const v=payouts[p.id]||0;
                    const isWinner = v > 0;
                    const isPTMWinner = f.type==='passmoney' && ptmState.holderId===p.id;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #0B0F1A'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15, color:'#fff'}}>{p.name}</span>
                          {f.type==='wolf' && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#7A9EBF'}}>{wolfPts[p.id]||0} wolf pts{isWinner?` — wins $${f.stakes} from each`:''}</div>}
                          {isPTMWinner && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#D4AF47'}}>💰 holds the money — wins ${f.stakes} from each player</div>}
                          {f.type==='stableford' && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#FFD700'}}>{stablefordPts[p.id]||0} pts</div>}
                        </div>
                        <span style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:20, color:v>0?'#2DD97A':v<0?'#E5534B':'#7A9EBF'}}>
                          {v>0?'+':''}{v===0?'—':`$${Math.abs(v).toFixed(0)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{background:'rgba(212,175,71,0.04)', border:'1px solid rgba(212,175,71,0.2)', borderRadius:14, padding:'16px'}}>
              <Label style={{color:'#D4AF47', display:'block', marginBottom:12}}>NET SETTLEMENT</Label>
              {debts.length===0
                ? <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A9EBF'}}>All square — no money changes hands 🎉</div>
                : debts.map((d,i)=>(
                  <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(212,175,71,0.1)'}}>
                    <Avatar player={d.from} size={26}/>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff', flex:1}}>
                      {d.from.name.split(' ')[0]} → {d.to.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:22, color:'#D4AF47'}}>${d.amount.toFixed(0)}</span>
                  </div>
                ))
              }
            </div>

            {!readOnly && onNewRound && (
              <Btn onClick={onNewRound} variant="ghost" style={{width:'100%', marginTop:4, fontSize:15}}>⛳ START NEW ROUND</Btn>
            )}
          </div>
        )}

        {/* SEND / ACTIONS */}
        {tab==='actions' && !readOnly && (
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <div style={{background:'#0F1D35', border:'1px solid #1F3354', borderRadius:14, padding:'16px'}}>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', marginBottom:4}}>✉️ EMAIL SCORECARD</div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A9EBF', marginBottom:12}}>Sends a full scorecard to all {players.length} players</div>
              <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:12}}>
                {players.map(p=><div key={p.id} style={{fontSize:12, color:'#3A5880', fontFamily:'DM Sans'}}>→ {p.email}</div>)}
              </div>
              <Btn onClick={sendEmail} variant={emailSent?'ghost':'green'} style={{width:'100%', fontSize:15}}>
                {emailSent ? '✓ SCORECARDS SENT' : 'SEND TO ALL PLAYERS'}
              </Btn>
            </div>

            <div style={{background:'#0F1D35', border:'1px solid #1F3354', borderRadius:14, padding:'16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:4}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="8" stroke="#D4AF47" strokeWidth="1.5" fill="none"/>
                  <path d="M6 7 Q9 4 12 7 Q9 10 6 7Z" fill="#D4AF47"/>
                  <circle cx="9" cy="13" r="1.5" fill="#D4AF47"/>
                </svg>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>POST TO GHIN</div>
              </div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A9EBF', marginBottom:12}}>Posts each player's adjusted gross score to GHIN for handicap update</div>
              {ghinStep==='idle' && <Btn onClick={postToGhin} variant="surface" style={{width:'100%', fontSize:15}}>POST SCORES TO GHIN</Btn>}
              {ghinStep==='logging' && (
                <div style={{textAlign:'center', padding:'12px', fontFamily:'Barlow Condensed', color:'#7A9EBF', fontSize:14, letterSpacing:1}}>
                  CONNECTING TO GHIN<span style={{animation:'blink 1s infinite'}}>...</span>
                </div>
              )}
              {ghinStep==='posted' && (
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {players.map(p=>(
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #0B0F1A'}}>
                      <Avatar player={p} size={24}/>
                      <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff', flex:1}}>{p.name}</span>
                      <span style={{fontSize:12, color:'#7A9EBF'}}>GHIN {p.ghin}</span>
                      <span style={{fontFamily:'Barlow Condensed', fontSize:13, color:'#2DD97A', fontWeight:700}}>✓ {totalScore(scores,p.id)||'—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {debts.length>0 && (
              <div style={{background:'#0F1D35', border:'1px solid #1F3354', borderRadius:14, padding:'16px'}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', marginBottom:4}}>💸 VENMO REQUESTS</div>
                <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A9EBF', marginBottom:12}}>Sends payment requests through the Venmo app</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {debts.map((d,i)=>(
                    <div key={i} style={{display:'flex', alignItems:'center', gap:10, background:'#0B0F1A', borderRadius:10, padding:'12px 14px'}}>
                      <Avatar player={d.from} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff'}}>{d.from.name}</div>
                        <div style={{fontSize:12, color:'#7A9EBF'}}>owes <span style={{color:'#D4AF47', fontWeight:700}}>${d.amount.toFixed(0)}</span> to {d.to.name.split(' ')[0]} · @{d.to.venmo}</div>
                      </div>
                      <Btn onClick={()=>openVenmo(d.from,d.to,d.amount)}
                        variant={venmoSent[d.from.id]?'ghost':'gold'} style={{padding:'9px 14px', fontSize:12, flexShrink:0}}>
                        {venmoSent[d.from.id] ? '✓ SENT' : '💸 REQUEST'}
                      </Btn>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {debts.length===0 && (
              <div style={{background:'rgba(45,217,122,0.04)', border:'1px solid rgba(45,217,122,0.2)', borderRadius:14, padding:'16px', textAlign:'center'}}>
                <div style={{fontSize:28, marginBottom:8}}>🎉</div>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18, color:'#2DD97A'}}>ALL SQUARE</div>
                <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A9EBF', marginTop:4}}>No money changes hands this round</div>
              </div>
            )}

            <Btn onClick={onNewRound} variant="ghost" style={{width:'100%', marginTop:4, fontSize:15}}>⛳ START NEW ROUND</Btn>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type}/>}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
};

const sumS = {
  root:    { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:'#0B0F1A' },
  hero:    { padding:'20px 16px', borderBottom:'1px solid #1F3354', background:'#0B0F1A', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:4 },
  tabBar:  { display:'flex', borderBottom:'1px solid #1F3354', flexShrink:0, background:'#070C16' },
  tab:     { flex:1, padding:'13px 6px', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:1.5, textAlign:'center', cursor:'pointer', transition:'color 0.15s' },
  content: { flex:1, padding:'16px', overflowY:'auto' },
  table:   { borderCollapse:'collapse', fontSize:13, width:'max-content', minWidth:'100%' },
  th:      { padding:'6px 7px', fontFamily:'Barlow Condensed', fontWeight:600, letterSpacing:1.5, fontSize:10, color:'#7A9EBF', textAlign:'center', borderBottom:'2px solid #1F3354', whiteSpace:'nowrap' },
  td:      { padding:'8px 6px', textAlign:'center', borderBottom:'1px solid #0F1D35' },
};

Object.assign(window, { SummaryScreen });
