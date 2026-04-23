// ScoreEntry.jsx v2 — QR modal, portrait/landscape, all trackers

const QRModal = ({ syncCode, onClose }) => {
  const base = window.location.href.split('?')[0];
  const url  = `${base}?join=${syncCode}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&color=3DCB6C&bgcolor=0A1628&margin=10`;
  return (
    <Modal open={true} onClose={onClose} title="Join This Round">
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:'8px 0'}}>
        <div style={{background:'#0A1628', border:'2px solid #3DCB6C', borderRadius:12, padding:12, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <img src={qrSrc} alt="QR Code" style={{width:200, height:200, display:'block'}} />
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', marginBottom:8}}>Scan to join — opens PlayPal and pre-fills the round code</div>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:28, letterSpacing:6, color:'#3DCB6C'}}>{syncCode}</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#4A6890', marginTop:4}}>Or enter this code manually on the Home screen → JOIN</div>
        </div>
        <div style={{display:'flex', gap:8, width:'100%'}}>
          <Btn onClick={()=>{ navigator.clipboard?.writeText(syncCode); }} variant="surface" style={{flex:1, fontSize:13}}>📋 COPY CODE</Btn>
          <Btn onClick={()=>{ navigator.share?.({title:'Join my PlayPal round', url}); }} variant="green" style={{flex:1, fontSize:13}}>📤 SHARE LINK</Btn>
        </div>
      </div>
    </Modal>
  );
};

const ScoreEntry = ({ round, onSaveRound }) => {
  const { getWolfForHole, getHoleStrokes, computePTMState } = window;
  const { players, course, formats, syncCode } = round;

  // Portrait/landscape detection
  const [isPortrait, setIsPortrait] = React.useState(window.innerHeight > window.innerWidth);
  React.useEffect(() => {
    const handler = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', handler);
    screen?.orientation?.addEventListener?.('change', handler);
    return () => { window.removeEventListener('resize', handler); screen?.orientation?.removeEventListener?.('change', handler); };
  }, []);

  const readLS = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; }
    catch(e) { return fallback; }
  };
  const emptyPutts   = () => Object.fromEntries(players.map(p=>[p.id,Array(18).fill(0)]));
  const emptyChips   = () => Object.fromEntries(players.map(p=>[p.id,0]));

  const [holeIdx, setHoleIdx]     = React.useState(() => parseInt(localStorage.getItem('pp_hole_'+syncCode)||'0'));
  const [scores,  setScores]      = React.useState(() => readLS('pp_scores_'+syncCode,  Object.fromEntries(players.map(p=>[p.id,[]]))));
  const [putts,   setPutts]       = React.useState(() => readLS('pp_putts_'+syncCode,   emptyPutts()));
  const [wolfData,setWolfData]    = React.useState(() => readLS('pp_wolf_'+syncCode,    {}));
  const [manualChips,setManualChips] = React.useState(() => readLS('pp_chips_'+syncCode, emptyChips()));
  const [nassauPresses,setNassauPresses] = React.useState(() => readLS('pp_presses_'+syncCode, []));
  const [showQR,  setShowQR]      = React.useState(false);
  const [saveModal,setSaveModal]  = React.useState(false);
  const [toast,   setToast]       = React.useState(null);
  const [syncHint,setSyncHint]    = React.useState(false);

  const hole      = course.holes[holeIdx];
  const hasWolf   = formats.some(f=>f.type==='wolf');
  const hasNassau = formats.some(f=>f.type==='nassau');
  const hasPTM    = formats.some(f => f.type==='passmoney');
  const wolfFmt   = formats.find(f=>f.type==='wolf');
  const nassauFmt = formats.find(f=>f.type==='nassau');
  const ptmFmt    = formats.find(f=>f.type==='passmoney');

  // Save all per-round state to localStorage + push a debounced copy to the cloud.
  const persist = (next = {}) => {
    const s  = next.scores   ?? scores;
    const w  = next.wolfData ?? wolfData;
    const pu = next.putts    ?? putts;
    const pr = next.presses  ?? nassauPresses;
    const ch = next.chips    ?? manualChips;
    const hi = next.holeIdx  ?? holeIdx;
    localStorage.setItem('pp_scores_'+syncCode,  JSON.stringify(s));
    localStorage.setItem('pp_wolf_'+syncCode,    JSON.stringify(w));
    localStorage.setItem('pp_putts_'+syncCode,   JSON.stringify(pu));
    localStorage.setItem('pp_presses_'+syncCode, JSON.stringify(pr));
    localStorage.setItem('pp_chips_'+syncCode,   JSON.stringify(ch));
    localStorage.setItem('pp_hole_'+syncCode,    String(hi));
    window.PlayPalSync?.pushStateDebounced?.(syncCode, () => ({
      scores: s, wolfData: w, putts: pu, presses: pr, chips: ch, holeIdx: hi,
    }));
  };

  // Subscribe to remote updates from other devices joined on this sync code.
  React.useEffect(() => {
    if (!window.PlayPalSync?.isEnabled?.()) return;
    // Initial fetch — in case we joined mid-round, grab latest state from the cloud.
    window.PlayPalSync.pullState(syncCode).then((remote) => {
      if (!remote || remote.writerId === window.PlayPalSync.getWriterId()) return;
      if (remote.scores)  setScores(remote.scores);
      if (remote.wolfData)setWolfData(remote.wolfData);
      if (remote.putts)   setPutts(remote.putts);
      if (remote.presses) setNassauPresses(remote.presses);
      if (remote.chips)   setManualChips(remote.chips);
      setSyncHint(true); setTimeout(()=>setSyncHint(false), 1500);
    });
    const unsub = window.PlayPalSync.subscribe(syncCode, (remote) => {
      if (remote.scores)  setScores(remote.scores);
      if (remote.wolfData)setWolfData(remote.wolfData);
      if (remote.putts)   setPutts(remote.putts);
      if (remote.presses) setNassauPresses(remote.presses);
      if (remote.chips)   setManualChips(remote.chips);
      setSyncHint(true); setTimeout(()=>setSyncHint(false), 1500);
    });
    return unsub;
  }, [syncCode]);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const setScore = (playerId, val) => {
    if (val < 1) return;
    const next = {...scores, [playerId]:[...(scores[playerId]||[])]};
    next[playerId][holeIdx] = val;
    setScores(next); persist({ scores: next });
  };

  const setPuttCount = (playerId, val) => {
    const next = {...putts, [playerId]:[...(putts[playerId]||Array(18).fill(0))]};
    next[playerId][holeIdx] = val;
    setPutts(next); persist({ putts: next });
  };

  const handleSetPartner = (partnerId, confirmed=true) => {
    const wolfPlayer = getWolfForHole(players, holeIdx);
    const next = {...wolfData, [holeIdx]: { wolfId:wolfPlayer.id, partnerId, confirmed, lone:false }};
    setWolfData(next); persist({ wolfData: next });
  };

  const handleLoneWolf = () => {
    const wolfPlayer = getWolfForHole(players, holeIdx);
    const next = {...wolfData, [holeIdx]: { wolfId:wolfPlayer.id, partnerId:null, confirmed:true, lone:true }};
    setWolfData(next); persist({ wolfData: next });
  };

  const handleManualChipAdjust = (playerId, delta) => {
    const next = {...manualChips, [playerId]: (manualChips[playerId]||0)+delta};
    setManualChips(next); persist({ chips: next });
  };

  const handlePress = (segment, startHole, stake) => {
    const next = [...nassauPresses, {segment, startHole, stake}];
    setNassauPresses(next); persist({ presses: next });
    showToast(`Nassau press added — ${segment.toUpperCase()} from H${startHole+1}`, 'info');
  };

  const goToHole = (i) => {
    setHoleIdx(i);
    persist({ holeIdx: i });
  };

  const allScoresThisHole = players.every(p => scores[p.id]?.[holeIdx]);
  const isLastHole = holeIdx === 17;
  const holesCompleted = Array.from({length:18},(_,i)=>i).filter(i=>players.every(p=>scores[p.id]?.[i])).length;

  // PTM holder — live recompute as scores/putts change
  const ptmHolderId = React.useMemo(() => {
    if (!hasPTM) return null;
    const { holderId } = computePTMState(scores, putts, players, course, players[0].id);
    return holderId;
  }, [JSON.stringify(scores), JSON.stringify(putts)]);

  return (
    <div style={seS.root}>
      {/* Hole Navigation */}
      <div style={seS.holeNav}>
        <div style={seS.holeTabs}>
          {course.holes.map((h,i) => {
            const done = players.every(p=>scores[p.id]?.[i]);
            const cur  = i === holeIdx;
            return (
              <div key={i} onClick={()=>goToHole(i)} style={{
                width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'Barlow Condensed', fontSize:14, cursor:'pointer', flexShrink:0, transition:'all 0.15s',
                background: cur?'#C9A84C': done?'#162950':'#0A1628',
                color: cur?'#0A1628': done?'#3DCB6C':'#4A6890',
                border: cur?'none': done?'1px solid #3DCB6C44':'1px solid #1E3A6E',
                fontWeight: cur?800:600,
              }}>{i+1}</div>
            );
          })}
        </div>
        <button onClick={()=>setShowQR(true)} style={{flexShrink:0, background:'rgba(61,203,108,0.08)', border:'1px solid rgba(61,203,108,0.25)', borderRadius:8, padding:'0 10px', color:'#3DCB6C', cursor:'pointer', height:30, display:'flex', alignItems:'center', gap:5, marginRight:12, fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:1}}>
          <span style={{fontSize:16}}>⬛</span> QR
        </button>
      </div>

      {/* Hole Info Header */}
      <div style={seS.holeInfo}>
        <button onClick={()=>holeIdx>0&&goToHole(holeIdx-1)} style={seS.holeArrow} disabled={holeIdx===0}>‹</button>
        <div style={{textAlign:'center', flex:1}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:30, color:'#fff', letterSpacing:3, lineHeight:1}}>
            HOLE {holeIdx+1}
          </div>
          <div style={{display:'flex', gap:12, alignItems:'center', justifyContent:'center', marginTop:4, fontFamily:'Barlow Condensed', fontSize:14, color:'#7A98BC', flexWrap:'wrap', gap:8}}>
            <span>PAR <strong style={{color:'#C9A84C'}}>{hole.par}</strong></span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span>{hole.yds} YDS</span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span>HDCP {hole.hdcp}</span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span style={{color:'#4A6890'}}>{holesCompleted}/18</span>
          </div>
        </div>
        <button onClick={()=>holeIdx<17&&goToHole(holeIdx+1)} style={seS.holeArrow} disabled={holeIdx===17}>›</button>
      </div>

      {/* Scrollable Content */}
      <div style={seS.scrollArea}>

        {/* Player Score Cards */}
        <div style={{padding:'8px 8px 0', display:'flex', flexDirection:'row', gap:6, flexWrap:'nowrap', overflowX:'auto'}}>
          {players.map(p => {
            const wolfPlayer = getWolfForHole(players, holeIdx);
            const wd = wolfData[holeIdx] || {};
            const score = scores[p.id]?.[holeIdx] || 0;
            const strokes = getHoleStrokes(p.handicap, hole.hdcp);
            const diff = score ? score - hole.par : null;
            const net  = score ? score - strokes : null;
            const relColor = diff===null?'#2A4A6E':diff<=-2?'#FFD700':diff===-1?'#3DCB6C':diff===0?'#9BB4D4':diff===1?'#E5534B':'#C0392B';
            const relLabel = diff===null?'—':diff<=-3?'ALB':diff===-2?'EGL':diff===-1?'BRD':diff===0?'PAR':diff===1?'BOG':diff===2?'DBL':`+${diff}`;
            const isWolf    = hasWolf && wolfPlayer.id===p.id;
            const isPartner = hasWolf && wd.partnerId===p.id;

            return (
              <div key={p.id} style={{flex:1, minWidth: players.length>=4 ? 0 : 140, maxWidth: players.length>=4 ? 'none' : 260,
                background: isWolf?'rgba(229,83,75,0.06)':isPartner?`${p.color}08`:'#0F2040',
                border: isWolf?'2px solid #E5534B':isPartner?`1px solid ${p.color}`:'1px solid #1E3A6E',
                borderRadius:12, padding:'8px', display:'flex', flexDirection:'column', gap:7}}>

                {/* Card Header */}
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <Avatar player={p} size={28}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
                    <div style={{fontSize:10, color:'#7A98BC'}}>
                      HCP {p.handicap}{strokes>0&&<span style={{color:'#C9A84C', marginLeft:4}}>+{strokes}</span>}
                    </div>
                  </div>
                  {isWolf   && <div style={{fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1, color:'#E5534B', background:'rgba(229,83,75,0.15)', border:'1px solid rgba(229,83,75,0.3)', padding:'2px 7px', borderRadius:5}}>🐺 WOLF</div>}
                  {isPartner && !isWolf && <div style={{fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1, color:'#3DCB6C', background:'rgba(61,203,108,0.12)', border:'1px solid rgba(61,203,108,0.3)', padding:'2px 7px', borderRadius:5}}>⚑ PARTNER</div>}
                  {hasPTM && ptmHolderId === p.id && <div style={{fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1, color:'#C9A84C', background:'rgba(201,168,76,0.15)', border:'1px solid rgba(201,168,76,0.4)', padding:'2px 7px', borderRadius:5}}>💰 $</div>}
                </div>

                {/* Big Score Controls */}
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <button onClick={()=>setScore(p.id,(score||hole.par)-1)} disabled={score<=1}
                    style={{width:50, height:50, borderRadius:11, border:'none', background:'#162950', color:'#fff', fontSize:26, fontFamily:'Barlow Condensed', fontWeight:900, cursor:'pointer', flexShrink:0, opacity:score>1?1:0.3, userSelect:'none', WebkitTapHighlightColor:'transparent'}}>
                    −
                  </button>
                  <div style={{flex:1, textAlign:'center'}}>
                    <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:54, lineHeight:1, color:score?relColor:'#2A4A6E'}}>{score||'—'}</div>
                    <div style={{fontFamily:'Barlow Condensed', fontSize:12, fontWeight:700, letterSpacing:2, color:relColor, marginTop:1}}>{relLabel}</div>
                    {net!==null && strokes>0 && <div style={{fontSize:10, color:'#4A6890'}}>NET {net}</div>}
                  </div>
                  <button onClick={()=>setScore(p.id,(score||hole.par)+1)}
                    style={{width:50, height:50, borderRadius:11, border:'none', background:'linear-gradient(135deg,#C9A84C,#A8893A)', color:'#0A1628', fontSize:26, fontFamily:'Barlow Condensed', fontWeight:900, cursor:'pointer', flexShrink:0, userSelect:'none', WebkitTapHighlightColor:'transparent'}}>
                    +
                  </button>
                </div>

                {/* Putt Tracker */}
                <div style={{display:'flex', alignItems:'center', borderTop:'1px solid #1E3A6E', paddingTop:7, gap:8}}>
                  <Label>PUTTS</Label>
                  <div style={{display:'flex', gap:5, marginLeft:4}}>
                    {[1,2,3,4].map(n=>(
                      <div key={n} onClick={()=>setPuttCount(p.id, putts[p.id]?.[holeIdx]===n?0:n)}
                        style={{width:30, height:30, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, userSelect:'none',
                          background: putts[p.id]?.[holeIdx]===n?'#162950':'transparent',
                          border: putts[p.id]?.[holeIdx]===n?`1px solid ${p.color}`:'1px solid #1E3A6E',
                          color: putts[p.id]?.[holeIdx]===n?p.color:'#4A6890'}}>
                        {n}
                      </div>
                    ))}
                  </div>
                  {putts[p.id]?.[holeIdx]>=3 && <span style={{fontSize:10, color:'#E5534B', fontFamily:'Barlow Condensed', fontWeight:700}}>3-PUTT</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Round Tracker */}
        <RoundTracker players={players} scores={scores} course={course} holeIdx={holeIdx}/>

        {/* Wolf Tracker */}
        {hasWolf && (
          <WolfTracker players={players} scores={scores} wolfData={wolfData} course={course}
            holeIdx={holeIdx} onSetPartner={handleSetPartner} onLoneWolf={handleLoneWolf} format={wolfFmt}/>
        )}

        {/* PTM Tracker */}
        {hasPTM && (
          <PTMTracker players={players} scores={scores} putts={putts} course={course}
            holeIdx={holeIdx} ptmInitialHolder={players[0].id} format={ptmFmt}/>
        )}

        {/* Nassau Tracker */}
        {hasNassau && (
          <NassauTracker players={players} scores={scores} course={course} holeIdx={holeIdx}
            presses={nassauPresses} onPress={handlePress} format={nassauFmt}/>
        )}

        <div style={{height:16}}/>
      </div>

      {/* Bottom Action Bar */}
      <div style={seS.bottomBar}>
        {!isLastHole ? (
          <Btn onClick={()=>goToHole(holeIdx+1)} variant="gold" style={{flex:1, fontSize:17, padding:'15px'}}>
            NEXT HOLE →
          </Btn>
        ) : (
          <Btn onClick={()=>setSaveModal(true)} variant="gold" style={{flex:1, fontSize:17, padding:'15px', boxShadow:'0 4px 32px rgba(201,168,76,0.4)'}}>
            💾 SAVE ROUND
          </Btn>
        )}
      </div>

      {/* Modals */}
      {showQR && <QRModal syncCode={syncCode} onClose={()=>setShowQR(false)}/>}

      <Modal open={saveModal} onClose={()=>setSaveModal(false)} title="Save & Finalize Round">
        <div style={{fontFamily:'DM Sans', color:'#9BB4D4', fontSize:14, lineHeight:1.8, marginBottom:20}}>
          <div style={{marginBottom:12}}>Finalize this round and automatically:</div>
          {[['✉️','Email scorecards to all players'],['🏌️','Post scores to GHIN'],['💸','Generate Venmo payment requests'],['☁️','Save round to cloud history']].map(([ic,tx])=>(
            <div key={tx} style={{display:'flex', gap:8, alignItems:'center'}}>
              <span>{ic}</span><span style={{color:'#fff'}}>{tx}</span>
            </div>
          ))}
          <div style={{marginTop:16, padding:'10px 12px', background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, fontSize:13, color:'#C9A84C'}}>
            {holesCompleted}/18 holes scored
          </div>
        </div>
        <div style={{display:'flex', gap:10}}>
          <Btn onClick={()=>setSaveModal(false)} variant="ghost" style={{flex:1}}>CANCEL</Btn>
          <Btn onClick={()=>{ setSaveModal(false); onSaveRound(scores, wolfData, putts, nassauPresses, manualChips); }} variant="gold" style={{flex:1}}>SAVE ROUND</Btn>
        </div>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type}/>}
    </div>
  );
};

const seS = {
  root:      { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  holeNav:   { display:'flex', alignItems:'center', borderBottom:'1px solid #1E3A6E', flexShrink:0 },
  holeTabs:  { flex:1, display:'flex', gap:4, padding:'8px 12px', overflowX:'auto', scrollbarWidth:'none' },
  holeInfo:  { display:'flex', alignItems:'center', padding:'10px 14px', borderBottom:'1px solid #1E3A6E', flexShrink:0, gap:8 },
  holeArrow: { width:38, height:38, borderRadius:8, background:'#162950', border:'1px solid #1E3A6E', color:'#fff', fontSize:24, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Barlow Condensed', flexShrink:0 },
  scrollArea:{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' },
  bottomBar: { padding:'10px 14px', borderTop:'1px solid #1E3A6E', flexShrink:0, display:'flex', gap:10, background:'#050E1C' },
};

Object.assign(window, { ScoreEntry });
