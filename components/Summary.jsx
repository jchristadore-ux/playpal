// Summary.jsx — updated design system

const SummaryScreen = ({ round, scores, wolfData, putts, nassauPresses, manualChips, popFlags, onNewRound, readOnly }) => {
  const { calcAllPayouts, calcWolfStandings, computePTMState, calcStablefordPoints, totalScore, totalVsPar, getAdjustedHoleScore, calcSkins, nassauSegmentStatus } = window;
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

  const payoutsByFormat = React.useMemo(() =>
    formats.map(f =>
      calcAllPayouts(scores, wolfData, players, course, [f], nassauPresses || [], ptmState.holderId, popFlags || {})
    ),
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
    const nameW = Math.max(...players.map(p=>p.name.length), 6);
    const pad  = (s, w) => String(s).padStart(w);
    const lpad = (s, w) => String(s).padEnd(w);
    const fmtPay = v => v > 0 ? `+$${Math.abs(v).toFixed(0)}` : v < 0 ? `-$${Math.abs(v).toFixed(0)}` : '—';

    let body = `SCORECARD — ${course.name}\n${date}\n${'─'.repeat(60)}\n\n`;
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

    if (formats.length > 0) {
      body += `\n${'═'.repeat(60)}\nFORMAT RESULTS\n${'═'.repeat(60)}\n`;

      formats.forEach((f, fi) => {
        const info   = FORMAT_INFO[f.type];
        const fPay   = payoutsByFormat[fi] || {};
        const mStake = f.nassauMatches?.[0]?.stakes ?? f.stakes;
        const stakeLabel =
          f.type === 'nassau'     ? `$${mStake}·$${mStake}·$${mStake*2}` :
          f.type === 'skins'      ? `$${f.stakes}/skin` :
          f.type === 'wolf'       ? `$${f.stakes}/round` :
          f.type === 'stableford' ? `$${f.stakes} match` :
          f.type === 'passmoney'  ? `$${f.stakes} pot` : '';

        body += `\n${info.label.toUpperCase()} — ${stakeLabel}\n${'─'.repeat(60)}\n`;

        if (f.type === 'skins') {
          const { skins } = calcSkins(scores, players, course, f.stakes, popFlags || {});
          players.forEach(p => {
            const n = skins[p.id] || 0;
            const v = fPay[p.id]  || 0;
            body += lpad(p.name, nameW+2) + lpad(`${n} skin${n!==1?'s':''}`, 12) + pad(fmtPay(v), 8) + '\n';
          });

        } else if (f.type === 'wolf') {
          players.forEach(p => {
            const pts = wolfPts[p.id] || 0;
            const v   = fPay[p.id]   || 0;
            body += lpad(p.name, nameW+2) + lpad(`${pts} pts`, 12) + pad(fmtPay(v), 8) + '\n';
          });

        } else if (f.type === 'nassau') {
          const matches = f.nassauMatches?.length ? f.nassauMatches : [f.nassauConfig || null];
          const range9f = Array.from({length:9}, (_,i)=>i);
          const range9b = Array.from({length:9}, (_,i)=>i+9);
          const range18 = Array.from({length:18},(_,i)=>i);
          matches.forEach(match => {
            if (!match) return;
            const mPlayers = (match.playersInMatch || [])
              .map(id => players.find(p => p.id === id)).filter(Boolean);
            const mNames  = mPlayers.length >= 2
              ? mPlayers.map(p => p.name.split(' ')[0]).join(' vs ')
              : players.slice(0,2).map(p => p.name.split(' ')[0]).join(' vs ');
            const ms = match.stakes ?? f.stakes;
            body += `Match: ${mNames}\n`;
            const front = nassauSegmentStatus(scores, players, course, range9f, 8,  popFlags||{}, match);
            const back  = nassauSegmentStatus(scores, players, course, range9b, 17, popFlags||{}, match);
            const total = nassauSegmentStatus(scores, players, course, range18, 17, popFlags||{}, match);
            const segLine = (label, status, stake) => {
              const result = status === 'EVEN' ? 'No exchange' : `${status.split(' ')[0]} wins $${stake}`;
              return `  ${lpad(label+':', 12)}${lpad(status, 16)}${result}\n`;
            };
            body += segLine('Front 9', front, ms);
            body += segLine('Back 9',  back,  ms);
            body += segLine('Overall', total, ms*2);
          });
          players.forEach(p => {
            const v = fPay[p.id] || 0;
            body += lpad(p.name, nameW+2) + pad(fmtPay(v), 8) + '\n';
          });

        } else if (f.type === 'stableford') {
          players.forEach(p => {
            const pts = stablefordPts[p.id] || 0;
            const v   = fPay[p.id]          || 0;
            body += lpad(p.name, nameW+2) + lpad(`${pts} pts`, 12) + pad(fmtPay(v), 8) + '\n';
          });

        } else if (f.type === 'passmoney') {
          if (ptmState.log.length > 0) {
            body += `${ptmState.log.length} pass${ptmState.log.length!==1?'es':''} during round\n`;
            ptmState.log.slice(0, 6).forEach(ev => {
              const from = players.find(p => p.id === ev.fromId);
              const to   = players.find(p => p.id === ev.toId);
              if (from && to)
                body += `  Hole ${ev.holeIdx+1}: ${from.name.split(' ')[0]} → ${to.name.split(' ')[0]} (${ev.reason})\n`;
            });
          }
          const winner = players.find(p => p.id === ptmState.holderId);
          const v = fPay[ptmState.holderId] || 0;
          if (winner) body += `Final holder: ${winner.name} wins $${v.toFixed(0)}\n`;
        }
      });

      body += `\n${'═'.repeat(60)}\nNET SETTLEMENT\n${'═'.repeat(60)}\n`;
      if (debts.length === 0) {
        body += 'All square — no money changes hands\n';
      } else {
        debts.forEach(d => {
          body += `${d.from.name} owes $${d.amount.toFixed(0)} to ${d.to.name}\n`;
        });
      }
    }

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

  return (
    <div style={sumS.root}>
      {/* Hero */}
      <div style={sumS.hero}>
        {readOnly
          ? <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:3, color:'#A0A0A0'}}>COMPLETED ROUND</div>
          : <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:3, color:'#00A86B'}}>ROUND COMPLETE</div>
        }
        <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:24, color:'#F5F5F5', marginTop:2}}>{course.name}</div>
        <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:12, color:'#A0A0A0'}}>
          {round.date || new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
        </div>

        <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap', justifyContent:'center'}}>
          {leaderboard.map((p,i)=>(
            <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, background:'#1E1E1E',
              border:`1px solid ${i===0?'#D4AF37':'#2A2A2A'}`, borderRadius:22, padding:'5px 12px 5px 7px'}}>
              <Avatar player={p} size={26}/>
              <div>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:i===0?'#D4AF37':'#F5F5F5', lineHeight:1}}>
                  {p.name.split(' ')[0]}
                </div>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:p.vsPar<0?'#4ADE80':p.vsPar===0?'#A0A0A0':'#FF6B6B'}}>
                  {p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar} · {p.gross||'—'}
                  {p.stPts>0 && <span style={{color:'#D4AF37', marginLeft:4}}>★{p.stPts}</span>}
                </div>
              </div>
              {i===0 && <span style={{fontSize:14}}>🏆</span>}
            </div>
          ))}
        </div>

        {readOnly && syncCode && (
          <div style={{marginTop:8, background:'rgba(160,160,160,0.06)', border:'1px solid rgba(160,160,160,0.15)', borderRadius:6, padding:'4px 12px', fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#666666'}}>
            READ-ONLY · CODE {syncCode}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={sumS.tabBar}>
        {tabs.map(([id,lbl])=>(
          <div key={id} onClick={()=>setTab(id)} style={{...sumS.tab, color:tab===id?'#D4AF37':'#A0A0A0', borderBottom:tab===id?'2px solid #D4AF37':'2px solid transparent'}}>
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
                  {course.holes.map(h=><th key={h.num} style={{...sumS.th, color:'#A0A0A0', minWidth:28}}>{h.num}</th>)}
                  <th style={{...sumS.th, color:'#F5F5F5'}}>TOT</th>
                  <th style={{...sumS.th, color:'#F5F5F5'}}>+/−</th>
                </tr>
                <tr>
                  <td style={{...sumS.td, color:'#666666', fontFamily:'Inter, system-ui, sans-serif', fontWeight:600, fontSize:11}}>PAR</td>
                  {course.holes.map(h=><td key={h.num} style={{...sumS.td, color:'#666666', fontFamily:'Inter, system-ui, sans-serif', fontWeight:600, fontSize:12}}>{h.par}</td>)}
                  <td style={{...sumS.td, color:'#666666', fontFamily:'Inter, system-ui, sans-serif', fontWeight:600}}>{course.holes.reduce((a,h)=>a+h.par,0)}</td>
                  <td style={{...sumS.td, color:'#666666'}}>—</td>
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
                          <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#F5F5F5', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                        </div>
                      </td>
                      {course.holes.map((h,i)=>{
                        const s=scores[p.id]?.[i]; const d=s?s-h.par:null;
                        const c=d===null?'#2A2A2A':d<=-2?'#D4AF37':d===-1?'#4ADE80':d===0?'#A0A0A0':d===1?'#FF6B6B':'#CC3333';
                        const hasPop = !!(popFlags?.[p.id]?.[i]);
                        return (
                          <td key={i} style={{...sumS.td, color:c, fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:14}}>
                            {s||'·'}
                            {hasPop && <span style={{display:'inline-block',marginLeft:1,fontSize:7,color:'#D4AF37',verticalAlign:'super'}}>●</span>}
                          </td>
                        );
                      })}
                      <td style={{...sumS.td, fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:'#F5F5F5'}}>{totalScore(scores,p.id)||'—'}</td>
                      <td style={{...sumS.td, fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:vs<0?'#4ADE80':vs===0?'#A0A0A0':'#FF6B6B'}}>{vs===0?'E':vs>0?`+${vs}`:vs}</td>
                    </tr>
                  );
                })}
                {putts && <tr>
                  <td style={{...sumS.td, color:'#666666', fontSize:11, fontFamily:'Inter, system-ui, sans-serif', fontWeight:600, letterSpacing:1}}>PUTTS</td>
                  {course.holes.map((_,i)=>{
                    const tot = players.reduce((a,p)=>a+(putts[p.id]?.[i]||0),0);
                    return <td key={i} style={{...sumS.td, color:'#666666', fontSize:12, fontFamily:'Inter, system-ui, sans-serif'}}>{tot||'·'}</td>;
                  })}
                  <td style={{...sumS.td, color:'#666666', fontFamily:'Inter, system-ui, sans-serif'}}>{players.reduce((a,p)=>a+(putts[p.id]||[]).reduce((b,v)=>b+v,0),0)}</td>
                  <td style={{...sumS.td}}/>
                </tr>}
              </tbody>
            </table>

            {Object.keys(wolfPts).length>0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>WOLF STANDINGS</Label>
                <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  {players.map(p=>(
                    <div key={p.id} style={{flex:1, minWidth:80, background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:12, padding:'10px', textAlign:'center'}}>
                      <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#F5F5F5'}}>{p.name.split(' ')[0]}</div>
                      <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color:(wolfPts[p.id]||0)>0?'#4ADE80':(wolfPts[p.id]||0)<0?'#FF6B6B':'#A0A0A0'}}>
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
            {formats.map((f,fi)=>{
              const info = FORMAT_INFO[f.type];
              const fmtStake = f.nassauMatches?.[0]?.stakes ?? f.stakes;
              return (
                <div key={f.type} style={{background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:16, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #2A2A2A'}}>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#F5F5F5'}}>{info.label}</span>
                    <span style={{marginLeft:'auto', fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#D4AF37'}}>
                      {f.type==='wolf'      ? `$${f.stakes} round pot` :
                       f.type==='passmoney' ? `$${f.stakes} round pot` :
                       f.type==='nassau'    ? `$${fmtStake}·$${fmtStake}·$${fmtStake*2}` :
                       f.type==='skins'     ? `$${f.stakes}/skin` :
                       f.type==='stableford'? `$${f.stakes} match` : ''}
                    </span>
                  </div>
                  {players.map(p=>{
                    const v=(payoutsByFormat[fi]?.[p.id])||0;
                    const isWinner = v > 0;
                    const isPTMWinner = f.type==='passmoney' && ptmState.holderId===p.id;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #121212'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#F5F5F5'}}>{p.name}</span>
                          {f.type==='wolf' && <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:'#A0A0A0'}}>{wolfPts[p.id]||0} wolf pts{isWinner?` — wins $${f.stakes} from each`:''}</div>}
                          {isPTMWinner && <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:'#D4AF37'}}>💰 holds the money — wins ${f.stakes} from each player</div>}
                          {f.type==='stableford' && <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:'#D4AF37'}}>{stablefordPts[p.id]||0} pts</div>}
                        </div>
                        <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:20, color:v>0?'#4ADE80':v<0?'#FF6B6B':'#A0A0A0'}}>
                          {v>0?'+':''}{v===0?'—':`$${Math.abs(v).toFixed(0)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{background:'rgba(212,175,55,0.04)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:16, padding:'16px'}}>
              <Label style={{color:'#D4AF37', display:'block', marginBottom:12}}>NET SETTLEMENT</Label>
              {debts.length===0
                ? <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:13, color:'#A0A0A0'}}>All square — no money changes hands 🎉</div>
                : debts.map((d,i)=>(
                  <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(212,175,55,0.1)'}}>
                    <Avatar player={d.from} size={26}/>
                    <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#F5F5F5', flex:1}}>
                      {d.from.name.split(' ')[0]} → {d.to.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color:'#D4AF37'}}>${d.amount.toFixed(0)}</span>
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
            <div style={{background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:16, padding:'16px'}}>
              <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#F5F5F5', marginBottom:4}}>✉️ EMAIL SCORECARD</div>
              <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:12, color:'#A0A0A0', marginBottom:12}}>Sends a full scorecard to all {players.length} players</div>
              <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:12}}>
                {players.map(p=><div key={p.id} style={{fontSize:12, color:'#666666', fontFamily:'Inter, system-ui, sans-serif'}}>→ {p.email}</div>)}
              </div>
              <Btn onClick={sendEmail} variant={emailSent?'ghost':'green'} style={{width:'100%', fontSize:15}}>
                {emailSent ? '✓ SCORECARDS SENT' : 'SEND TO ALL PLAYERS'}
              </Btn>
            </div>

            <div style={{background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:16, padding:'16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:4}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="8" stroke="#D4AF37" strokeWidth="1.5" fill="none"/>
                  <path d="M6 7 Q9 4 12 7 Q9 10 6 7Z" fill="#D4AF37"/>
                  <circle cx="9" cy="13" r="1.5" fill="#D4AF37"/>
                </svg>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#F5F5F5'}}>POST TO GHIN</div>
              </div>
              <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:12, color:'#A0A0A0', marginBottom:12}}>Posts each player's adjusted gross score to GHIN for handicap update</div>
              {ghinStep==='idle' && <Btn onClick={postToGhin} variant="surface" style={{width:'100%', fontSize:15}}>POST SCORES TO GHIN</Btn>}
              {ghinStep==='logging' && (
                <div style={{textAlign:'center', padding:'12px', fontFamily:'Inter, system-ui, sans-serif', color:'#A0A0A0', fontSize:14, letterSpacing:1}}>
                  CONNECTING TO GHIN<span style={{animation:'blink 1s infinite'}}>...</span>
                </div>
              )}
              {ghinStep==='posted' && (
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {players.map(p=>(
                    <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #121212'}}>
                      <Avatar player={p} size={24}/>
                      <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#F5F5F5', flex:1}}>{p.name}</span>
                      <span style={{fontSize:12, color:'#A0A0A0', fontFamily:'Inter, system-ui, sans-serif'}}>GHIN {p.ghin}</span>
                      <span style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:13, color:'#00A86B', fontWeight:700}}>✓ {totalScore(scores,p.id)||'—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {debts.length>0 && (
              <div style={{background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:16, padding:'16px'}}>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#F5F5F5', marginBottom:4}}>💸 VENMO REQUESTS</div>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:12, color:'#A0A0A0', marginBottom:12}}>Sends payment requests through the Venmo app</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {debts.map((d,i)=>(
                    <div key={i} style={{display:'flex', alignItems:'center', gap:10, background:'#121212', borderRadius:12, padding:'12px 14px'}}>
                      <Avatar player={d.from} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#F5F5F5'}}>{d.from.name}</div>
                        <div style={{fontSize:12, color:'#A0A0A0', fontFamily:'Inter, system-ui, sans-serif'}}>owes <span style={{color:'#D4AF37', fontWeight:700}}>${d.amount.toFixed(0)}</span> to {d.to.name.split(' ')[0]} · @{d.to.venmo}</div>
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
              <div style={{background:'rgba(0,168,107,0.04)', border:'1px solid rgba(0,168,107,0.2)', borderRadius:16, padding:'16px', textAlign:'center'}}>
                <div style={{fontSize:28, marginBottom:8}}>🎉</div>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:18, color:'#00A86B'}}>ALL SQUARE</div>
                <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:13, color:'#A0A0A0', marginTop:4}}>No money changes hands this round</div>
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
  root:    { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:'#121212' },
  hero:    { padding:'20px 16px', borderBottom:'1px solid #2A2A2A', background:'#121212', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:4 },
  tabBar:  { display:'flex', borderBottom:'1px solid #2A2A2A', flexShrink:0, background:'#0D0D0D' },
  tab:     { flex:1, padding:'13px 6px', fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, letterSpacing:1.5, textAlign:'center', cursor:'pointer', transition:'color 0.15s' },
  content: { flex:1, padding:'16px', overflowY:'auto' },
  table:   { borderCollapse:'collapse', fontSize:13, width:'max-content', minWidth:'100%' },
  th:      { padding:'6px 7px', fontFamily:'Inter, system-ui, sans-serif', fontWeight:600, letterSpacing:1.5, fontSize:10, color:'#A0A0A0', textAlign:'center', borderBottom:'2px solid #2A2A2A', whiteSpace:'nowrap' },
  td:      { padding:'8px 6px', textAlign:'center', borderBottom:'1px solid #1E1E1E' },
};

Object.assign(window, { SummaryScreen });
