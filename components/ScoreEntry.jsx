// ScoreEntry.jsx — Full Score Entry Screen (stroke-only, no net scoring)

const PlayerScoreCard = ({ p, score, hole, holeIdx, putts, gettingPop, isWolf, isPartner, isPTMHolder, hasWolf, wolfData, formatStats, onScore, onPutt, onWolfTap, onScoreTap, onPopToggle }) => {
  const diff     = score ? score - hole.par : null;
  const relColor = diff===null?'#2A4A6E':diff<=-2?'#FFD700':diff===-1?'#3DCB6C':diff===0?'#9BB4D4':diff===1?'#E5534B':'#C0392B';
  const relLabel = diff===null?'—':diff<=-3?'ALB':diff===-2?'EGL':diff===-1?'BRD':diff===0?'PAR':diff===1?'BOG':diff===2?'DBL':`+${diff}`;
  const puttVal  = putts[p.id]?.[holeIdx] || 0;

  const cardBorder = isWolf ? '1.5px solid rgba(229,83,75,0.5)' : isPartner ? `1.5px solid ${p.color}55` : '1px solid #1E3A6E';
  const cardBg     = isWolf ? 'rgba(229,83,75,0.05)' : '#0F2040';

  return (
    <div style={{background:cardBg, border:cardBorder, borderRadius:18, overflow:'hidden', flexShrink:0}}>

      {/* Player header */}
      <div style={{display:'flex', alignItems:'center', padding:'12px 16px 8px', gap:10}}>
        <Avatar player={p} size={36}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:20, color:'#fff', letterSpacing:0.3, lineHeight:1}}>{p.name}</div>
          <div style={{fontSize:11, color:'#7A98BC', marginTop:3}}>HCP {p.handicap}</div>
        </div>
        {/* Wolf icon (non-wolf) */}
        {isWolf && !hasWolf && <span style={{fontSize:20}}>🐺</span>}
        {isPartner && !isWolf && <span style={{fontSize:18, opacity:0.85}}>⚑</span>}
        {/* PICK button — only shown for wolf player */}
        {hasWolf && isWolf && (
          <button onClick={onWolfTap} style={{
            background: !wolfData?.[holeIdx]?.confirmed ? '#E5534B' : 'rgba(61,203,108,0.15)',
            border: !wolfData?.[holeIdx]?.confirmed ? 'none' : '1px solid rgba(61,203,108,0.4)',
            color: !wolfData?.[holeIdx]?.confirmed ? '#fff' : '#3DCB6C',
            borderRadius:20, padding:'5px 12px 5px 8px', cursor:'pointer',
            fontFamily:'Barlow Condensed', fontWeight:800, fontSize:12, letterSpacing:0.8,
            display:'flex', alignItems:'center', gap:5,
            WebkitTapHighlightColor:'transparent', flexShrink:0,
          }}>
            <span style={{fontSize:14}}>🐺</span>
            {!wolfData?.[holeIdx]?.confirmed ? 'PICK →' : wolfData[holeIdx]?.lone ? 'LONE 🐺' : '✓ SET'}
          </button>
        )}
      </div>

      {/* Format stat pills */}
      {formatStats && formatStats.length > 0 && (
        <div style={{display:'flex', gap:6, padding:'0 12px 10px', flexWrap:'wrap'}}>
          {formatStats.map((s,i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:4,
              background:'#0A1628', border:'1px solid #1E3A6E',
              borderRadius:20, padding:'3px 10px 3px 8px',
            }}>
              <span style={{fontSize:12, lineHeight:1}}>{s.icon}</span>
              <span style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:13, color:s.color, lineHeight:1}}>{s.value}</span>
              <span style={{fontFamily:'Barlow Condensed', fontSize:9, color:'#4A6890', letterSpacing:0.5, marginLeft:2}}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score stepper */}
      <div style={{display:'flex', alignItems:'center', padding:'0 12px 12px', gap:8}}>
        <button
          onClick={()=>onScore(p.id, (score||hole.par)-1)}
          disabled={score<=1}
          style={{width:52, height:52, borderRadius:10, border:'none', background:'#162950',
            color:'#fff', fontSize:28, fontFamily:'Barlow Condensed', fontWeight:900,
            cursor:'pointer', flexShrink:0, opacity:score>1?1:0.3,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          −
        </button>

        {/* Score display box — tap opens name grid */}
        <div
          onClick={onScoreTap}
          style={{flex:1, cursor:'pointer', borderRadius:12,
            background:'#0A1628', border:'1px solid #1E3A6E',
            minHeight:72, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent', userSelect:'none', gap:2}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, lineHeight:1,
            fontSize:64, color:score?relColor:'#2A4A6E', transition:'color 0.15s'}}>
            {score||'—'}
          </div>
          {score
            ? <div style={{fontFamily:'Barlow Condensed', fontSize:11, fontWeight:700, letterSpacing:2, color:relColor}}>{relLabel}</div>
            : <div style={{fontFamily:'DM Sans', fontSize:10, color:'#2A4A6E', letterSpacing:0.5}}>TAP TO ENTER</div>
          }
        </div>

        <button
          onClick={()=>onScore(p.id, (score||hole.par)+1)}
          style={{width:52, height:52, borderRadius:10, border:'none',
            background:'linear-gradient(135deg,#C9A84C,#A8893A)',
            color:'#0A1628', fontSize:28, fontFamily:'Barlow Condensed', fontWeight:900,
            cursor:'pointer', flexShrink:0,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          +
        </button>
      </div>

      <div style={{display:'flex', justifyContent:'flex-end', padding:'0 12px 10px'}}>
        <button
          onClick={()=>onPopToggle(p.id)}
          style={{
            borderRadius:999, padding:'5px 10px', minHeight:28,
            border:gettingPop ? '1px solid rgba(201,168,76,0.55)' : '1px solid #1E3A6E',
            background:gettingPop ? 'rgba(201,168,76,0.16)' : '#0A1628',
            color:gettingPop ? '#C9A84C' : '#7A98BC',
            fontFamily:'Barlow Condensed', fontWeight:800, fontSize:11, letterSpacing:1,
            cursor:'pointer', WebkitTapHighlightColor:'transparent'
          }}>
          {gettingPop ? 'POP ON' : 'POP'}
        </button>
      </div>

      {/* Putt tracker */}
      <div style={{display:'flex', alignItems:'center', padding:'8px 14px 12px',
        borderTop: isPTMHolder && puttVal === 0 ? '1px solid rgba(201,168,76,0.5)' : '1px solid #1E3A6E',
        gap:10,
        background: isPTMHolder && puttVal === 0 ? 'rgba(201,168,76,0.06)' : 'transparent'}}>
        <div style={{display:'flex', flexDirection:'column', gap:1, flexShrink:0}}>
          <Label style={{flexShrink:0}}>PUTTS</Label>
          {isPTMHolder && puttVal === 0 && (
            <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:9, color:'#C9A84C', letterSpacing:0.5}}>💰 REQUIRED</span>
          )}
        </div>
        <div style={{display:'flex', gap:6, marginLeft:2}}>
          {[1,2,3,4].map(n=>(
            <button key={n}
              onClick={()=>onPutt(p.id, puttVal===n ? 0 : n)}
              style={{width:40, height:40, borderRadius:9,
                border: puttVal===n ? 'none' : '1px solid #1E3A6E',
                background: puttVal===n ? p.color : '#162950',
                color: puttVal===n ? '#0A1628' : '#7A98BC',
                fontFamily:'Barlow Condensed', fontWeight:800, fontSize:17,
                cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none',
                display:'flex', alignItems:'center', justifyContent:'center'}}>
              {n}
            </button>
          ))}
        </div>
        {puttVal >= 3 && <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, color:'#E5534B', marginLeft:2, letterSpacing:0.5}}>3-PUTT</span>}
      </div>
    </div>
  );
};

// ── Score Name Grid Modal — single tap confirms ───────────────────────────────
const ScoreKeypad = ({ player, hole, current, onConfirm, onClose }) => {
  // Build tiles for scores 1 through par+4 (covers Ace through common worst)
  const scoreName = (strokes, par) => {
    const d = strokes - par;
    if (strokes === 1)  return { label:'ACE',    color:'#FFD700', border:'#FFD700' };
    if (d <= -3)        return { label:'ALB',    color:'#FFD700', border:'#FFD700' };
    if (d === -2)       return { label:'EAGLE',  color:'#FFD700', border:'#FFD700' };
    if (d === -1)       return { label:'BIRDIE', color:'#3DCB6C', border:'#3DCB6C' };
    if (d === 0)        return { label:'PAR',    color:'#9BB4D4', border:'#9BB4D4' };
    if (d === 1)        return { label:'BOGEY',  color:'#E5534B', border:'#E5534B' };
    if (d === 2)        return { label:'DOUBLE', color:'#C0392B', border:'#C0392B' };
    if (d === 3)        return { label:'TRIPLE', color:'#8B0000', border:'#8B0000' };
    return               { label:`+${d}`,       color:'#8B0000', border:'#8B0000' };
  };

  // Show scores 1–9
  const tiles = Array.from({length:9}, (_,i) => i+1);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:2000,
      display:'flex',alignItems:'center',justifyContent:'center', padding:'20px'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#0F2040',borderRadius:16,padding:'20px',width:'100%',maxWidth:380}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:16,color:'#fff',letterSpacing:0.5}}>
            {player.name.toUpperCase()} — HOLE {hole.num} (PAR {hole.par})
          </div>
          <button onClick={onClose}
            style={{background:'none',border:'none',color:'#7A98BC',fontSize:20,cursor:'pointer',
              lineHeight:1,padding:'0 4px',WebkitTapHighlightColor:'transparent'}}>✕</button>
        </div>

        {/* Score tiles grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {tiles.map(n => {
            const s = scoreName(n, hole.par);
            const isCurrent = current === n;
            return (
              <button key={n}
                onClick={()=>{ onConfirm(player.id, n); onClose(); }}
                style={{
                  height:68, borderRadius:10, cursor:'pointer',
                  border:`2px solid ${isCurrent ? s.border : s.border+'44'}`,
                  background: isCurrent ? `${s.border}22` : '#0A1628',
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:2,
                  WebkitTapHighlightColor:'transparent', userSelect:'none',
                  transition:'background 0.1s',
                }}>
                <span style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:28,
                  color:s.color,lineHeight:1}}>{n}</span>
                <span style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:10,
                  color:s.color,letterSpacing:1}}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Wolf Team Picker Modal ────────────────────────────────────────────────────
const WolfPicker = ({ wolfPlayer, players, holeIdx, onPick, onLone, onClose }) => (
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:2000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'#0F2040',borderRadius:'20px 20px 0 0',padding:'20px 20px 32px',width:'100%',maxWidth:420}}>
      <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:20,color:'#E5534B',marginBottom:4}}>
        🐺 {wolfPlayer.name.toUpperCase()} IS WOLF
      </div>
      <div style={{fontFamily:'DM Sans',fontSize:13,color:'#7A98BC',marginBottom:16}}>Pick a partner or go lone wolf for hole {holeIdx+1}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
        {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
          <button key={p.id} onClick={()=>onPick(p.id)}
            style={{width:'100%',padding:'14px 16px',borderRadius:12,border:`1px solid ${p.color}55`,
              background:`${p.color}11`,color:p.color,fontFamily:'Barlow Condensed',
              fontWeight:700,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',gap:12,
              WebkitTapHighlightColor:'transparent'}}>
            <Avatar player={p} size={32}/>
            {p.name.toUpperCase()}
          </button>
        ))}
        <button onClick={onLone}
          style={{width:'100%',padding:'14px 16px',borderRadius:12,
            border:'1px solid rgba(229,83,75,0.5)',background:'rgba(229,83,75,0.1)',
            color:'#E5534B',fontFamily:'Barlow Condensed',fontWeight:800,fontSize:16,
            cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          🐺 GO LONE WOLF
        </button>
      </div>
      <button onClick={onClose} style={{width:'100%',height:44,borderRadius:10,border:'1px solid #1E3A6E',background:'transparent',color:'#7A98BC',fontFamily:'Barlow Condensed',fontWeight:700,fontSize:14,cursor:'pointer',letterSpacing:1}}>CANCEL</button>
    </div>
  </div>
);

// ── Main ScoreEntry Screen ────────────────────────────────────────────────────
const ScoreEntry = ({ round, onSaveRound, onExitRound }) => {
  const { getWolfForHole, computePTMState, calcWolfStandings, calcStablefordPoints, calcSkins, getAdjustedHoleScore } = window;

  const { players, course, formats } = round;

  // Scores: { [playerId]: [score_h1, score_h2, ... score_h18] }
  const [scores,   setScores]   = React.useState(() => {
    try {
      const saved = localStorage.getItem('pp_scores_' + round.id);
      return saved ? JSON.parse(saved) : Object.fromEntries(players.map(p=>[p.id, Array(18).fill(null)]));
    } catch(e) {
      return Object.fromEntries(players.map(p=>[p.id, Array(18).fill(null)]));
    }
  });

  const [putts,    setPutts]    = React.useState(() => {
    try {
      const saved = localStorage.getItem('pp_putts_' + round.id);
      return saved ? JSON.parse(saved) : Object.fromEntries(players.map(p=>[p.id, Array(18).fill(0)]));
    } catch(e) {
      return Object.fromEntries(players.map(p=>[p.id, Array(18).fill(0)]));
    }
  });
  const [popFlags, setPopFlags] = React.useState(() => {
    try {
      const saved = localStorage.getItem('pp_pop_' + round.id);
      return saved ? JSON.parse(saved) : Object.fromEntries(players.map(p=>[p.id, Array(18).fill(false)]));
    } catch(e) {
      return Object.fromEntries(players.map(p=>[p.id, Array(18).fill(false)]));
    }
  });

  // wolfData: { [holeIdx]: { wolfId, partnerId, confirmed, lone } }
  const [wolfData, setWolfData] = React.useState(() => {
    try {
      const saved = localStorage.getItem('pp_wolf_' + round.id);
      return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
  });

  const [nassauPresses, setNassauPresses] = React.useState([]);
  const [holeIdx,  setHoleIdx]  = React.useState(0);
  const [keypad,   setKeypad]   = React.useState(null);  // { playerId } or null
  const [wolfPicker, setWolfPicker] = React.useState(false);
  const [showFinish, setShowFinish] = React.useState(false);
  const [showExit,   setShowExit]   = React.useState(false);

  const hasWolf      = formats.some(f => f.type === 'wolf');
  const hasPTM       = formats.some(f => f.type === 'passmoney');
  const hasNassau    = formats.some(f => f.type === 'nassau');
  const hasStable    = formats.some(f => f.type === 'stableford');
  const hasSkins     = formats.some(f => f.type === 'skins');
  const wolfFmt      = formats.find(f => f.type === 'wolf');
  const ptmFmt       = formats.find(f => f.type === 'passmoney');
  const nassauFmt    = formats.find(f => f.type === 'nassau');
  const skinsFmt     = formats.find(f => f.type === 'skins');

  const hole         = course.holes[holeIdx];
  const wolfPlayer   = hasWolf ? getWolfForHole(players, holeIdx) : null;
  const wolfHoleData = wolfData[holeIdx] || { wolfId: wolfPlayer?.id, partnerId: null, confirmed: false, lone: false };

  // PTM state replayed through all scored holes
  const ptmState = React.useMemo(() => {
    if (!hasPTM) return { holderId: players[0]?.id, log: [] };
    return computePTMState(scores, putts, players, course, players[0]?.id);
  }, [JSON.stringify(scores), JSON.stringify(putts)]);

  // Persist to localStorage
  React.useEffect(() => {
    localStorage.setItem('pp_scores_' + round.id, JSON.stringify(scores));
  }, [scores]);
  React.useEffect(() => {
    localStorage.setItem('pp_putts_' + round.id, JSON.stringify(putts));
  }, [putts]);
  React.useEffect(() => {
    localStorage.setItem('pp_pop_' + round.id, JSON.stringify(popFlags));
  }, [popFlags]);
  React.useEffect(() => {
    localStorage.setItem('pp_wolf_' + round.id, JSON.stringify(wolfData));
  }, [wolfData]);

  // Per-player running format stats for the stat strip
  const playerFormatStats = React.useMemo(() => {
    const result = {};
    players.forEach(p => {
      const stats = [];
      const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;

      if (hasWolf) {
        const wolfPts = calcWolfStandings(scores, wolfData, players, course);
        const pts = wolfPts[p.id] || 0;
        stats.push({ icon:'🐺', label:'WOLF PTS', value: String(pts), color: pts > 0 ? '#3DCB6C' : '#7A98BC' });
      }

      if (hasStable) {
        const pts = course.holes.reduce((acc, h, i) => {
          const g = scores[p.id]?.[i];
          return acc + (g ? calcStablefordPoints(getAdjustedHoleScore(scores, popFlags, p.id, i), h.par) : 0);
        }, 0);
        stats.push({ icon:'⭐', label:'STBL PTS', value: String(pts), color: pts >= 2 ? '#C9A84C' : '#7A98BC' });
      }

      if (hasPTM) {
        const isHolder = ptmState.holderId === p.id;
        if (isHolder) {
          stats.push({ icon:'💰', label:'HOLDS', value: '', color: '#C9A84C' });
        }
      }

      // Always show running stroke total
      if (holesPlayed > 0) {
        const total = (scores[p.id]||[]).reduce((acc, s) => acc + (s || 0), 0);
        stats.push({ icon:'⛳', label:'STROKES', value: String(total), color: '#9BB4D4' });
      }

      if (hasSkins) {
        const { skins } = calcSkins(scores, players, course, skinsFmt?.stakes || 1, popFlags);
        const won = skins[p.id] || 0;
        stats.push({ icon:'🎯', label:'SKINS', value: String(won), color: won > 0 ? '#C9A84C' : '#7A98BC' });
      }

      result[p.id] = stats;
    });
    return result;
  }, [JSON.stringify(scores), JSON.stringify(wolfData), JSON.stringify(popFlags), holeIdx]);

  // Score setter
  const setScore = (playerId, val) => {
    const clamped = Math.max(1, val);
    setScores(prev => {
      const next = { ...prev, [playerId]: [...(prev[playerId] || Array(18).fill(null))] };
      next[playerId][holeIdx] = clamped;
      return next;
    });
  };

  // Putt setter
  const setPutt = (playerId, val) => {
    setPutts(prev => {
      const next = { ...prev, [playerId]: [...(prev[playerId] || Array(18).fill(0))] };
      next[playerId][holeIdx] = val;
      return next;
    });
  };

  const togglePop = (playerId) => {
    setPopFlags(prev => {
      const next = { ...prev, [playerId]: [...(prev[playerId] || Array(18).fill(false))] };
      next[playerId][holeIdx] = !next[playerId][holeIdx];
      return next;
    });
  };

  // Wolf actions
  const handleWolfPick = (partnerId) => {
    setWolfData(prev => ({
      ...prev,
      [holeIdx]: { wolfId: wolfPlayer.id, partnerId, confirmed: true, lone: false }
    }));
    setWolfPicker(false);
  };

  const handleLoneWolf = () => {
    setWolfData(prev => ({
      ...prev,
      [holeIdx]: { wolfId: wolfPlayer.id, partnerId: null, confirmed: true, lone: true }
    }));
    setWolfPicker(false);
  };

  const handleResetWolf = () => {
    setWolfData(prev => {
      const next = { ...prev };
      delete next[holeIdx];
      return next;
    });
  };

  // Nassau press
  const handlePress = (segment, startHole, stake) => {
    setNassauPresses(prev => [...prev, { segment, startHole, stake }]);
  };

  // Navigation
  const prevHole = () => holeIdx > 0  && setHoleIdx(holeIdx - 1);
  const nextHole = () => holeIdx < 17 && setHoleIdx(holeIdx + 1);

  const allScored = players.every(p => (scores[p.id]||[]).filter(Boolean).length === 18);
  const currentHoleScored = players.every(p => scores[p.id]?.[holeIdx]);

  const handleFinish = () => {
    onSaveRound(scores, wolfData, putts, nassauPresses, {}, popFlags);
  };

  // Hole header info
  const parColor = hole.par === 3 ? '#7B9FE0' : hole.par === 5 ? '#C9A84C' : '#9BB4D4';

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0A1628'}}>

      {/* Hole header */}
      <div style={{flexShrink:0, background:'#050E1C', borderBottom:'1px solid #1E3A6E', padding:'12px 16px 10px'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>

          {/* Prev arrow */}
          <button onClick={prevHole} disabled={holeIdx===0}
            style={{width:36, height:36, borderRadius:8, border:'none', background:holeIdx===0?'transparent':'#0F2040',
              color:holeIdx===0?'#1E3A6E':'#9BB4D4', fontSize:20, cursor:holeIdx===0?'default':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ‹
          </button>

          {/* Hole info */}
          <div style={{flex:1, textAlign:'center'}}>
            <div style={{display:'flex', alignItems:'baseline', justifyContent:'center', gap:8}}>
              <span style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:32, color:'#fff', lineHeight:1}}>
                HOLE {hole.num}
              </span>
              <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18, color:parColor}}>
                PAR {hole.par}
              </span>
            </div>
            <div style={{display:'flex', justifyContent:'center', gap:16, marginTop:2}}>
              <span style={{fontFamily:'DM Sans', fontSize:11, color:'#4A6890'}}>{hole.yds} yds</span>
              <span style={{fontFamily:'DM Sans', fontSize:11, color:'#4A6890'}}>HCP {hole.hdcp}</span>
            </div>
          </div>

          {/* Next arrow */}
          <button onClick={nextHole} disabled={holeIdx===17}
            style={{width:36, height:36, borderRadius:8, border:'none', background:holeIdx===17?'transparent':'#0F2040',
              color:holeIdx===17?'#1E3A6E':'#9BB4D4', fontSize:20, cursor:holeIdx===17?'default':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ›
          </button>
        </div>

        {/* Hole dots */}
        <div style={{display:'flex', justifyContent:'center', gap:4, marginTop:10, flexWrap:'wrap'}}>
          {course.holes.map((h,i) => {
            const allIn = players.every(p => scores[p.id]?.[i]);
            const some  = players.some(p => scores[p.id]?.[i]);
            return (
              <div key={i} onClick={()=>setHoleIdx(i)}
                style={{width: i===holeIdx?20:8, height:8, borderRadius:4, cursor:'pointer', transition:'all 0.2s',
                  background: i===holeIdx ? '#C9A84C' : allIn ? '#3DCB6C' : some ? '#162950' : '#0F2040',
                  border: i===holeIdx ? 'none' : `1px solid ${allIn?'#3DCB6C33':'#1E3A6E'}`}}>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch'}}>

        {/* Player score cards */}
        <div style={{padding:'12px 12px 0', display:'flex', flexDirection:'column', gap:10}}>
          {players.map(p => {
            const isWolf    = hasWolf && wolfPlayer?.id === p.id;
            const isPartner = hasWolf && wolfHoleData.confirmed && wolfHoleData.partnerId === p.id;
            const isPTM     = hasPTM && ptmState.holderId === p.id;
            return (
              <PlayerScoreCard
                key={p.id}
                p={p}
                score={scores[p.id]?.[holeIdx] || null}
                hole={hole}
                holeIdx={holeIdx}
                putts={putts}
                gettingPop={!!popFlags[p.id]?.[holeIdx]}
                isWolf={isWolf}
                isPartner={isPartner}
                isPTMHolder={isPTM}
                hasWolf={hasWolf}
                wolfData={wolfData}
                formatStats={playerFormatStats[p.id] || []}
                onScore={setScore}
                onPutt={setPutt}
                onWolfTap={() => setWolfPicker(true)}
                onScoreTap={() => setKeypad(p.id)}
                onPopToggle={togglePop}
              />
            );
          })}
        </div>

        {/* Game trackers */}
        <div style={{marginTop:12}}>
          <RoundTracker players={players} scores={scores} course={course} holeIdx={holeIdx}/>
          {hasWolf && (
            <WolfTracker
              players={players} scores={scores} wolfData={wolfData}
              course={course} holeIdx={holeIdx}
              onSetPartner={handleWolfPick}
              onLoneWolf={handleLoneWolf}
              onResetWolf={handleResetWolf}
              format={wolfFmt}
            />
          )}
          {hasPTM && (
            <PTMTracker
              players={players} scores={scores} putts={putts}
              course={course} holeIdx={holeIdx}
              ptmInitialHolder={players[0]?.id}
              format={ptmFmt}
            />
          )}
          {hasNassau && (
            <NassauTracker
              players={players} scores={scores} popFlags={popFlags} course={course}
              holeIdx={holeIdx} presses={nassauPresses}
              onPress={handlePress} format={nassauFmt}
            />
          )}
        </div>

        {/* Bottom padding + finish button */}
        <div style={{padding:'16px 12px 24px'}}>
          {(allScored || holeIdx === 17) && (
            <Btn onClick={() => setShowFinish(true)} variant="gold"
              style={{width:'100%', padding:'16px', fontSize:18, letterSpacing:1,
                boxShadow:'0 4px 32px rgba(201,168,76,0.3)'}}>
              🏁 FINISH ROUND
            </Btn>
          )}
        </div>
      </div>

      {/* Next hole button — fixed at bottom when not on last hole */}
      {currentHoleScored && holeIdx < 17 && (
        <div style={{flexShrink:0, padding:'10px 12px', background:'#050E1C', borderTop:'1px solid #1E3A6E'}}>
          <Btn onClick={nextHole} variant="green" style={{width:'100%', padding:'13px', fontSize:16}}>
            NEXT HOLE {holeIdx + 2} →
          </Btn>
        </div>
      )}

      {/* Exit Round — always visible at bottom */}
      <div style={{flexShrink:0, padding:'6px 12px 10px', background:'#050E1C', borderTop:'1px solid #1E3A6E', display:'flex', justifyContent:'center'}}>
        <button onClick={()=>setShowExit(true)}
          style={{background:'none', border:'none', cursor:'pointer', fontFamily:'Barlow Condensed',
            fontWeight:700, fontSize:12, letterSpacing:1.5, color:'#4A6890',
            WebkitTapHighlightColor:'transparent', padding:'6px 16px'}}>
          EXIT ROUND
        </button>
      </div>

      {/* Keypad modal */}
      {keypad && (
        <ScoreKeypad
          player={players.find(p=>p.id===keypad)}
          hole={hole}
          current={scores[keypad]?.[holeIdx]}
          onConfirm={setScore}
          onClose={()=>setKeypad(null)}
        />
      )}

      {/* Wolf picker modal */}
      {wolfPicker && wolfPlayer && (
        <WolfPicker
          wolfPlayer={wolfPlayer}
          players={players}
          holeIdx={holeIdx}
          onPick={handleWolfPick}
          onLone={handleLoneWolf}
          onClose={()=>setWolfPicker(false)}
        />
      )}

      {/* Exit Round confirmation modal */}
      <Modal open={showExit} onClose={()=>setShowExit(false)} title="Exit Round?">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.6}}>
            Your scores are saved locally. You can resume this round from the home screen.
          </div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>setShowExit(false)} variant="ghost" style={{flex:1}}>KEEP PLAYING</Btn>
            <Btn onClick={onExitRound} variant="danger" style={{flex:1}}>EXIT ROUND</Btn>
          </div>
        </div>
      </Modal>

      {/* Finish confirmation modal */}
      <Modal open={showFinish} onClose={()=>setShowFinish(false)} title="Finish Round?">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.6}}>
            {!allScored
              ? `Some holes haven't been scored yet. You can still finish and view results.`
              : `All 18 holes complete. Ready to view the final results?`}
          </div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>setShowFinish(false)} variant="ghost" style={{flex:1}}>KEEP PLAYING</Btn>
            <Btn onClick={handleFinish} variant="gold" style={{flex:1}}>VIEW RESULTS</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

Object.assign(window, { ScoreEntry });
