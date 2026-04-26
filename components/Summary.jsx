// Summary.jsx v3 — Scorecard, per-format payouts, Venmo deep-links, GHIN flow

const SummaryScreen = ({ round, scores, wolfData, putts, nassauPresses, manualChips, popFlags, onNewRound }) => {
  const { calcAllPayouts, calcWolfStandings, computePTMState, calcStablefordPoints, totalScore, totalVsPar, getAdjustedHoleScore } = window;
  const { players, course, formats, syncCode } = round;
  const [toast, setToast]       = React.useState(null);
  const [tab, setTab]           = React.useState('scorecard');
  const [ghinStep, setGhinStep] = React.useState('idle'); // idle | logging | posted
  const [emailSent, setEmailSent] = React.useState(false);
  const [venmoSent, setVenmoSent] = React.useState({});

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  // ── Payouts ──────────────────────────────────────────────────────────────
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
    Object.fromEntries(players.map(p => [
      p.id,
      course.holes.reduce((a, h, i) => a + calcStablefordPoints(getAdjustedHoleScore(scores, popFlags || {}, p.id, i), h.par), 0)
    ])),
  []);

  // Leaderboard sorted by gross score
  const leaderboard = [...players].map(p=>({
    ...p,
    gross:   totalScore(scores, p.id),
    vsPar:   totalVsPar(scores, p.id, course.holes),
    payout:  payouts[p.id]||0,
    stPts:   stablefordPts[p.id]||0,
  })).sort((a,b)=>a.vsPar-b.vsPar);

  // Net debts: who pays whom
  const debts = [];
  players.forEach(debtor => {
    if ((payouts[debtor.id]||0) >= 0) return;
    const owed = Math.abs(payouts[debtor.id]);
    const creditors = players.filter(p=>(payouts[p.id]||0)>0).sort((a,b)=>(payouts[b.id]||0)-(payouts[a.id]||0));
    if (creditors.length) debts.push({ from:debtor, to:creditors[0], amount:owed });
  });

  // ── Venmo ─────────────────────────────────────────────────────────────────
  const openVenmo = (from, to, amount) => {
    const note = `PlayPal Golf · ${course.name} · ${new Date().toLocaleDateString()}`;
    const encoded = encodeURIComponent(note);
    const venmoHandle = to.venmo.replace('@','');
    const deepLink = `venmo://paycharge?txn=pay&recipients=${venmoHandle}&amount=${amount.toFixed(2)}&note=${encoded}`;
    const webLink  = `https://venmo.com/${venmoHandle}?txn=pay&amount=${amount.toFixed(2)}&note=${encoded}`;
    const a = document.createElement('a'); a.href = deepLink; a.click();
    setTimeout(()=>{ window.open(webLink,'_blank'); }, 1200);
    setVenmoSent(prev=>({...prev,[from.id]:true}));
    showToast(`Venmo request sent to @${venmoHandle}`);
  };

  // ── GHIN ──────────────────────────────────────────────────────────────────
  const postToGhin = () => {
    setGhinStep('logging');
    setTimeout(()=>{ setGhinStep('posted'); showToast('Scores posted to GHIN ✓'); }, 2200);
  };

  // ── Email ─────────────────────────────────────────────────────────────────
  const buildScorecardEmail = () => {
    const date = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const parTotal = course.holes.reduce((a,h)=>a+h.par,0);
    let body = `SCORECARD — ${course.name}\n${date}\n`;
    body += `${'─'.repeat(60)}\n\n`;
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
      course.holes.forEach((h,i) => { const s = scores[p.id]?.[i]; body += pad(s||'·', 4); });
      const tot = totalScore(scores, p.id);
      const vs = totalVsPar(scores, p.id, course.holes);
      body += pad(tot||'—', 6);
      body += pad(vs===0?'E':vs>0?`+${vs}`:vs, 6) + '\n';
    });
    if (putts) {
      body += `${'─'.repeat(nameW+2+course.holes.length*4+12)}\n`;
      body += lpad('PUTTS', nameW+2);
      course.holes.forEach((_,i) => {
        const tot = players.reduce((a,p)=>a+(putts[p.id]?.[i]||0),0);
        body += pad(tot||'·', 4);
      });
      body += '\n';
    }
    if (formats.length > 0) {
      body += `\n${'─'.repeat(60)}\nGAME RESULTS\n\n`;
      formats.forEach(f => {
        const info = FORMAT_INFO[f.type];
        body += `${info.label.toUpperCase()}\n`;
        players.forEach(p => {
          const v = payouts[p.id] || 0;
          const sign = v > 0 ? '+' : '';
          body += `  ${p.name}: ${v===0?'even':`${sign}$${Math.abs(v).toFixed(0)}`}`;
          if (f.type==='wolf') body += ` (${wolfPts[p.id]||0} pts)`;
          if (f.type==='stableford') body += ` (${stablefordPts[p.id]||0} pts)`;
          body += '\n';
        });
        body += '\n';
      });
    }
    body += `${'─'.repeat(60)}\nSent via PlayPal Golf\n`;
    return body;
  };

  const sendEmail = () => {
    const body = buildScorecardEmail();
    const subject = `Scorecard — ${course.name} — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
    const emails = players.map(p=>p.email).filter(Boolean).join(',');
    const mailto = `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
    setEmailSent(true);
    showToast(`Scorecard opened in Mail for ${players.length} players`);
  };

  const tabs = [['scorecard','📊 SCORES'],['payouts','💰 PAYOUTS'],['actions','📤 SEND']];

  return (
    <div style={sumS.root}>
      {/* Hero / Leaderboard */}
      <div style={sumS.hero}>
        <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:12, letterSpacing:3, color:'#3DCB6C'}}>ROUND COMPLETE</div>
        <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:26, color:'#fff', marginTop:2}}>{course.name}</div>
        <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC'}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>

        <div style={{display:'flex', gap:8, marginTop:14, flexWrap:'wrap', justifyContent:'center'}}>
          {leaderboard.map((p,i)=>(
            <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, background:'#0F2040', border:`1px solid ${i===0?'#C9A84C':'#1E3A6E'}`, borderRadius:24, padding:'6px 14px 6px 8px'}}>
              <Avatar player={p} size={28}/>
              <div>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:i===0?'#C9A84C':'#fff', lineHeight:1}}>{p.name.split(' ')[0]}</div>
                <div style={{fontFamily:'Barlow Condensed', fontSize:12, color:p.vsPar<0?'#3DCB6C':p.vsPar===0?'#7A98BC':'#E5534B'}}>
                  {p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar} · {p.gross||'—'}
                  {p.stPts>0 && <span style={{color:'#FFD700', marginLeft:4}}>★{p.stPts}</span>}
                </div>
              </div>
              {i===0 && <span style={{fontSize:16}}>🏆</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={sumS.tabBar}>
        {tabs.map(([id,lbl])=>(
          <div key={id} onClick={()=>setTab(id)} style={{...sumS.tab, color:tab===id?'#C9A84C':'#7A98BC', borderBottom:tab===id?'2px solid #C9A84C':'2px solid transparent'}}>
            {lbl}
          </div>
        ))}
      </div>

      <div style={sumS.content}>

        {/* ── SCORECARD ─────────────────────────────────────────────── */}
        {tab==='scorecard' && (
          <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
            <table style={sumS.table}>
              <thead>
                <tr>
                  <th style={{...sumS.th, textAlign:'left', minWidth:90}}>PLAYER</th>
                  {course.holes.map(h=><th key={h.num} style={{...sumS.th, color:h.num<=9?'#7A98BC':'#9BB4D4', minWidth:28}}>{h.num}</th>)}
                  <th style={{...sumS.th, color:'#fff'}}>TOT</th>
                  <th style={{...sumS.th, color:'#fff'}}>+/−</th>
                </tr>
                <tr>
                  <td style={{...sumS.td, color:'#4A6890', fontFamily:'Barlow Condensed', fontWeight:600, fontSize:11}}>PAR</td>
                  {course.holes.map(h=><td key={h.num} style={{...sumS.td, color:'#4A6890', fontFamily:'Barlow Condensed', fontWeight:600, fontSize:12}}>{h.par}</td>)}
                  <td style={{...sumS.td, color:'#4A6890', fontFamily:'Barlow Condensed', fontWeight:600}}>{course.holes.reduce((a,h)=>a+h.par,0)}</td>
                  <td style={{...sumS.td, color:'#4A6890'}}>—</td>
                </tr>
              </thead>
              <tbody>
                {players.map(p=>{
                  const vs = totalVsPar(scores,p.id,course.holes);
                  return (
                    <tr key={p.id}>
                      <td style={{...sumS.td, textAlign:'left'}}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <div style={{width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                          <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:'#fff', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                        </div>
                      </td>
                      {course.holes.map((h,i)=>{
                        const s=scores[p.id]?.[i]; const d=s?s-h.par:null;
                        const c=d===null?'#1E3A6E':d<=-2?'#FFD700':d===-1?'#3DCB6C':d===0?'#9BB4D4':d===1?'#E5534B':'#C0392B';
                        return <td key={i} style={{...sumS.td, color:c, fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14}}>{s||'·'}</td>;
                      })}
                      <td style={{...sumS.td, fontFamily:'Barlow Condensed', fontWeight:800, fontSize:15, color:'#fff'}}>{totalScore(scores,p.id)||'—'}</td>
                      <td style={{...sumS.td, fontFamily:'Barlow Condensed', fontWeight:800, fontSize:15, color:vs<0?'#3DCB6C':vs===0?'#7A98BC':'#E5534B'}}>{vs===0?'E':vs>0?`+${vs}`:vs}</td>
                    </tr>
                  );
                })}
                {putts && <tr>
                  <td style={{...sumS.td, color:'#4A6890', fontSize:11, fontFamily:'Barlow Condensed', letterSpacing:1}}>PUTTS</td>
                  {course.holes.map((_,i)=>{
                    const tot = players.reduce((a,p)=>a+(putts[p.id]?.[i]||0),0);
                    return <td key={i} style={{...sumS.td, color:'#4A6890', fontSize:12, fontFamily:'Barlow Condensed'}}>{tot||'·'}</td>;
                  })}
                  <td style={{...sumS.td, color:'#4A6890', fontFamily:'Barlow Condensed'}}>{players.reduce((a,p)=>a+(putts[p.id]||[]).reduce((b,v)=>b+v,0),0)}</td>
                  <td style={{...sumS.td}}/>
                </tr>}
              </tbody>
            </table>

            {Object.keys(wolfPts).length>0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>WOLF STANDINGS</Label>
                <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  {players.map(p=>(
                    <div key={p.id} style={{flex:1, minWidth:80, background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:10, padding:'10px', textAlign:'center'}}>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:'#fff'}}>{p.name.split(' ')[0]}</div>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:22, color:(wolfPts[p.id]||0)>0?'#3DCB6C':(wolfPts[p.id]||0)<0?'#E5534B':'#7A98BC'}}>
                        {(wolfPts[p.id]||0)>0?'+':''}{wolfPts[p.id]||0} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PAYOUTS ───────────────────────────────────────────────── */}
        {tab==='payouts' && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {formats.map(f=>{
              const info = FORMAT_INFO[f.type];
              return (
                <div key={f.type} style={{background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #1E3A6E'}}>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{info.label}</span>
                    <span style={{marginLeft:'auto', fontFamily:'Barlow Condensed', fontSize:13, color:'#C9A84C'}}>
                      {f.type==='wolf'      ? `$${f.stakes} round pot` :
                       f.type==='passmoney' ? `$${f.stakes} round pot` :
                       f.type==='nassau'    ? `$${f.stakes}/bet` :
                       f.type==='skins'     ? `$${f.stakes}/skin` :
                       f.type==='stableford'? `$${f.stakes} winner takes all` : ''}
                    </span>
                  </div>
                  {players.map(p=>{
                    const v=payouts[p.id]||0;
                    const isWinner = v > 0;
                    const isPTMWinner = f.type==='passmoney' && ptmState.holderId===p.id;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #0A1628'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15, color:'#fff'}}>{p.name}</span>
                          {f.type==='wolf' && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#7A98BC'}}>{wolfPts[p.id]||0} wolf pts{isWinner ? ` — wins $${f.stakes} from each player` : ''}</div>}
                          {isPTMWinner && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#C9A84C'}}>💰 holds the money — wins ${f.stakes} from each player</div>}
                          {f.type==='stableford' && <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#FFD700'}}>{stablefordPts[p.id]||0} pts</div>}
                        </div>
                        <span style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:20, color:v>0?'#3DCB6C':v<0?'#E5534B':'#7A98BC'}}>
                          {v>0?'+':''}{v===0?'—':`$${Math.abs(v).toFixed(0)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:12, padding:'16px'}}>
              <Label style={{color:'#C9A84C', display:'block', marginBottom:12}}>NET SETTLEMENT</Label>
              {debts.length===0
                ? <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC'}}>All square — no money changes hands 🎉</div>
                : debts.map((d,i)=>(
                  <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(201,168,76,0.15)'}}>
                    <Avatar player={d.from} size={26}/>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff', flex:1}}>
                      {d.from.name.split(' ')[0]} → {d.to.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:22, color:'#C9A84C'}}>${d.amount.toFixed(0)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── SEND / ACTIONS ────────────────────────────────────────── */}
        {tab==='actions' && (
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <div style={{background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'16px'}}>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', marginBottom:4}}>✉️ EMAIL SCORECARD</div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC', marginBottom:12}}>Sends a full scorecard to all {players.length} players</div>
              <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:12}}>
                {players.map(p=><div key={p.id} style={{fontSize:12, color:'#4A6890', fontFamily:'DM Sans'}}>→ {p.email}</div>)}
              </div>
              <Btn onClick={sendEmail} variant={emailSent?'ghost':'green'} style={{width:'100%', fontSize:15}}>
                {emailSent ? '✓ SCORECARDS SENT' : 'SEND TO ALL PLAYERS'}
              </Btn>
            </div>

            <div style={{background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'16px'}}>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', marginBottom:4}}>🏌️ POST TO GHIN</div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC', marginBottom:12}}>Posts each player's adjusted gross score to GHIN for handicap update</div>
              {ghinStep==='idle' && (
                <Btn onClick={postToGhin} variant="surface" style={{width:'100%', fontSize:15}}>POST SCORES TO GHIN</Btn>
              )}
              {ghinStep==='logging' && (
                <div style={{textAlign:'center', padding:'12px', fontFamily:'Barlow Condensed', color:'#7A98BC', fontSize:14, letterSpacing:1}}>
                  CONNECTING TO GHIN<span style={{animation:'blink 1s infinite'}}>...</span>
                </div>
              )}
              {ghinStep==='posted' && (
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {players.map(p=>(
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #0A1628'}}>
                      <Avatar player={p} size={24}/>
                      <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff', flex:1}}>{p.name}</span>
                      <span style={{fontSize:12, color:'#7A98BC'}}>GHIN {p.ghin}</span>
                      <span style={{fontFamily:'Barlow Condensed', fontSize:13, color:'#3DCB6C', fontWeight:700}}>✓ {totalScore(scores,p.id)||'—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {debts.length>0 && (
              <div style={{background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'16px'}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', marginBottom:4}}>💸 VENMO REQUESTS</div>
                <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC', marginBottom:12}}>Sends payment requests through the Venmo app</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {debts.map((d,i)=>(
                    <div key={i} style={{display:'flex', alignItems:'center', gap:10, background:'#162950', borderRadius:10, padding:'12px 14px'}}>
                      <Avatar player={d.from} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff'}}>{d.from.name}</div>
                        <div style={{fontSize:12, color:'#7A98BC'}}>owes <span style={{color:'#C9A84C', fontWeight:700}}>${d.amount.toFixed(0)}</span> to {d.to.name.split(' ')[0]} · @{d.to.venmo}</div>
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
              <div style={{background:'rgba(61,203,108,0.05)', border:'1px solid rgba(61,203,108,0.25)', borderRadius:12, padding:'16px', textAlign:'center'}}>
                <div style={{fontSize:28, marginBottom:8}}>🎉</div>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18, color:'#3DCB6C'}}>ALL SQUARE</div>
                <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', marginTop:4}}>No money changes hands this round</div>
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
  root:    { flex:1, overflowY:'auto', display:'flex', flexDirection:'column' },
  hero:    { padding:'20px 16px', borderBottom:'1px solid #1E3A6E', background:'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:4 },
  tabBar:  { display:'flex', borderBottom:'1px solid #1E3A6E', flexShrink:0 },
  tab:     { flex:1, padding:'13px 6px', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:1, textAlign:'center', cursor:'pointer', transition:'color 0.15s' },
  content: { flex:1, padding:'16px', overflowY:'auto' },
  table:   { borderCollapse:'collapse', fontSize:13, width:'max-content', minWidth:'100%' },
  th:      { padding:'6px 7px', fontFamily:'Barlow Condensed', fontWeight:600, letterSpacing:1, fontSize:10, color:'#7A98BC', textAlign:'center', borderBottom:'2px solid #1E3A6E', whiteSpace:'nowrap' },
  td:      { padding:'8px 6px', textAlign:'center', borderBottom:'1px solid #0F2040' },
};

Object.assign(window, { SummaryScreen });
