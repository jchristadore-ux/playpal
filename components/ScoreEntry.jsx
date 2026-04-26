// ScoreEntry.jsx v3 — iPhone-first redesign
// Logic identical to v2; layout rebuilt for one-hand thumb use

const QRModal = ({ syncCode, onClose }) => {
  const base = window.location.href.split('?')[0];
  const url  = `${base}?join=${syncCode}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}&color=3DCB6C&bgcolor=0A1628&margin=10`;
  return (
    <Modal open={true} onClose={onClose} title="Join This Round">
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:'8px 0'}}>
        <div style={{background:'#0A1628', border:'2px solid #3DCB6C', borderRadius:16, padding:14, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <img src={qrSrc} alt="QR Code" style={{width:220, height:220, display:'block'}} />
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', marginBottom:8}}>Scan to join · opens PlayPal and pre-fills the round code</div>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:32, letterSpacing:8, color:'#3DCB6C'}}>{syncCode}</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#4A6890', marginTop:4}}>Or enter this code on the Home screen → JOIN</div>
        </div>
        <div style={{display:'flex', gap:8, width:'100%'}}>
          <Btn onClick={()=>{ navigator.clipboard?.writeText(syncCode); }} variant="surface" style={{flex:1, fontSize:14}}>📋 COPY CODE</Btn>
          <Btn onClick={()=>{ navigator.share?.({title:'Join my PlayPal round', url}); }} variant="green" style={{flex:1, fontSize:14}}>📤 SHARE</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ── Wolf partner picker (full-width, thumb-friendly) ──────────────────────────
const WolfPickerSheet = ({ players, wolfPlayer, wolfData, holeIdx, onSetPartner, onLoneWolf, onClose }) => {
  const wd = wolfData[holeIdx] || {};
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:900, display:'flex', flexDirection:'column', justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{background:'#0F2040', borderRadius:'20px 20px 0 0', padding:'20px 16px 36px', border:'1px solid rgba(229,83,75,0.3)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
          <div>
            <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18, color:'#E5534B', letterSpacing:1}}>🐺 {wolfPlayer.name.toUpperCase()} IS WOLF</div>
            <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC', marginTop:2}}>Hole {holeIdx+1} — pick a partner or go lone</div>
          </div>
          <button onClick={onClose} style={{background:'none', border:'none', color:'#7A98BC', fontSize:22, cursor:'pointer', padding:8}}>✕</button>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
            <button key={p.id} onClick={()=>{ onSetPartner(p.id); onClose(); }}
              style={{width:'100%', padding:'16px 20px', borderRadius:14, border:`1.5px solid ${p.color}55`,
                background: wd.partnerId===p.id ? `${p.color}22` : `${p.color}11`,
                color:p.color, fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18,
                cursor:'pointer', letterSpacing:0.5, display:'flex', alignItems:'center', gap:12, textAlign:'left'}}>
              <Avatar player={p} size={36}/>
              <span>{p.name.toUpperCase()}</span>
              <span style={{marginLeft:'auto', fontFamily:'DM Sans', fontSize:12, color:'#7A98BC', fontWeight:400}}>HCP {p.handicap}</span>
              {wd.partnerId===p.id && <span style={{color:p.color}}>✓</span>}
            </button>
          ))}
          <button onClick={()=>{ onLoneWolf(); onClose(); }}
            style={{width:'100%', padding:'16px 20px', borderRadius:14,
              border:'1.5px solid rgba(229,83,75,0.5)', background:'rgba(229,83,75,0.1)',
              color:'#E5534B', fontFamily:'Barlow Condensed', fontWeight:800,
              fontSize:18, cursor:'pointer', letterSpacing:0.5,
              display:'flex', alignItems:'center', gap:12}}>
            <span style={{fontSize:28}}>🐺</span>
            <div style={{textAlign:'left'}}>
              <div>LONE WOLF</div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#E5534B', opacity:0.7, fontWeight:400}}>Go solo — score doubled vs 2 lowest</div>
            </div>
            {wd.lone && <span style={{marginLeft:'auto'}}>✓</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Golf-aware score label helpers ───────────────────────────────────────────
const getScoreOptions = (par) => {
  const opts = [];
  for (let strokes = 1; strokes <= par + 5; strokes++) {
    const diff = strokes - par;
    let label;
    if (strokes === 1) {
      label = 'Ace';
    } else if (diff <= -3) {
      label = 'Albatross';
    } else if (diff === -2) {
      label = 'Eagle';
    } else if (diff === -1) {
      label = 'Birdie';
    } else if (diff === 0) {
      label = 'Par';
    } else if (diff === 1) {
      label = 'Bogey';
    } else if (diff === 2) {
      label = 'Double';
    } else if (diff === 3) {
      label = 'Triple';
    } else {
      label = `+${diff}`;
    }
    opts.push({ strokes, label, diff });
  }
  return opts;
};

const SCORE_COLORS = {
  ace:'#FFD700', eagle:'#FFD700', albatross:'#FFD700',
  birdie:'#3DCB6C', par:'#9BB4D4', bogey:'#E5534B',
  double:'#C0392B', triple:'#8B0000', over:'#6B0000',
};

const getScoreColor = (diff) => {
  if (diff <= -3) return SCORE_COLORS.albatross;
  if (diff === -2) return SCORE_COLORS.eagle;
  if (diff === -1) return SCORE_COLORS.birdie;
  if (diff === 0)  return SCORE_COLORS.par;
  if (diff === 1)  return SCORE_COLORS.bogey;
  if (diff === 2)  return SCORE_COLORS.double;
  if (diff === 3)  return SCORE_COLORS.triple;
  return SCORE_COLORS.over;
};

// ── ScoreBug overlay ──────────────────────────────────────────────────────────
const ScoreBug = ({ player, hole, currentScore, onSelect, onClose }) => {
  const options = getScoreOptions(hole.par);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,14,28,0.78)',
        zIndex: 950,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 12px',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0D1E3A',
          borderRadius: 16,
          border: `1.5px solid ${player.color}55`,
          padding: '14px 12px 16px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, color: '#C9A84C', letterSpacing: 1 }}>
            {player.name.toUpperCase()} — HOLE {hole.number} (PAR {hole.par})
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4A6890', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1, fontFamily: 'DM Sans' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7 }}>
          {options.map(({ strokes, label, diff }) => {
            const isSelected = currentScore === strokes;
            const color = strokes === 1 ? SCORE_COLORS.ace : getScoreColor(diff);
            return (
              <button
                key={strokes}
                onClick={() => { onSelect(strokes); onClose(); }}
                style={{
                  borderRadius: 10,
                  border: `2px solid ${isSelected ? color : color + '55'}`,
                  background: isSelected ? color + '22' : '#0A1628',
                  cursor: 'pointer',
                  padding: '10px 4px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: 62,
                }}>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 900, fontSize: 26, lineHeight: 1, color: isSelected ? color : '#fff' }}>
                  {strokes}
                </div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, color: color, lineHeight: 1, textTransform: 'uppercase' }}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Single player full-width score card ───────────────────────────────────────
const PlayerScoreCard = ({ p, score, hole, holeIdx, putts, isWolf, isPartner, isPTMHolder, hasWolf, wolfData, formatStats, onScore, onPutt, onWolfTap, onScoreTap }) => {
  const { getHoleStrokes } = window;
  const strokes  = getHoleStrokes(p.handicap, hole.hdcp);
  const diff     = score ? score - hole.par : null;
  const net      = score ? score - strokes : null;
  const relColor = diff===null?'#2A4A6E':diff<=-2?'#FFD700':diff===-1?'#3DCB6C':diff===0?'#9BB4D4':diff===1?'#E5534B':'#C0392B';
  const relLabel = diff===null?'—':diff<=-3?'ALB':diff===-2?'EGL':diff===-1?'BRD':diff===0?'PAR':diff===1?'BOG':diff===2?'DBL':`+${diff}`;
  const puttVal  = putts[p.id]?.[holeIdx] || 0;

  const cardBorder = isWolf ? '1.5px solid rgba(229,83,75,0.5)' : isPartner ? `1.5px solid ${p.color}55` : '1px solid #1E3A6E';
  const cardBg     = isWolf ? 'rgba(229,83,75,0.05)' : '#0F2040';

  return (
    <div style={{background:cardBg, border:cardBorder, borderRadius:18, overflow:'hidden', flexShrink:0}}>

      {/* ── Player header ── */}
      <div style={{display:'flex', alignItems:'center', padding:'12px 16px 10px', gap:12}}>
        <Avatar player={p} size={36}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:22, color:'#fff', letterSpacing:0.3, lineHeight:1}}>{p.name}</div>
          <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>
            HCP {p.handicap}
            {strokes > 0 && <span style={{color:'#C9A84C', marginLeft:5}}>+{strokes} stroke{strokes>1?'s':''}</span>}
          </div>
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          {isWolf      && <span style={{fontSize:22}}>🐺</span>}
          {isPartner && !isWolf && <span style={{fontSize:20, opacity:0.85}}>⚑</span>}
          {hasWolf && isWolf && (
            <button onClick={onWolfTap} style={{
              background: !wolfData?.[holeIdx]?.confirmed ? 'rgba(229,83,75,0.9)' : 'rgba(229,83,75,0.15)',
              border:'1px solid rgba(229,83,75,0.35)', borderRadius:8, padding:'4px 10px',
              color: !wolfData?.[holeIdx]?.confirmed ? '#fff' : '#E5534B',
              fontFamily:'Barlow Condensed', fontWeight:800, fontSize:12, cursor:'pointer', letterSpacing:0.5,
              animation: !wolfData?.[holeIdx]?.confirmed ? 'wolfPulse 1.5s ease-in-out infinite' : 'none',
            }}>
              {wolfData?.[holeIdx]?.confirmed ? 'CHANGE' : '🐺 PICK →'}
            </button>
          )}
        </div>
      </div>

      {/* ── Format stats bar (always visible) ── */}
      {formatStats && formatStats.length > 0 && (
        <div style={{display:'flex', gap:6, padding:'0 14px 10px', flexWrap:'wrap'}}>
          {formatStats.map((stat, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:5,
              background:'#0A1628', border:`1px solid ${stat.color}44`,
              borderRadius:8, padding:'5px 10px', flexShrink:0,
            }}>
              <span style={{fontSize:13}}>{stat.icon}</span>
              <div style={{display:'flex', flexDirection:'column', lineHeight:1}}>
                <span style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:17, color:stat.color, lineHeight:1}}>{stat.value}</span>
                <span style={{fontFamily:'Barlow Condensed', fontWeight:600, fontSize:9, color:'#4A6890', letterSpacing:1, marginTop:1}}>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Score stepper ── */}
      <div style={{display:'flex', alignItems:'center', padding:'0 12px 14px', gap:10}}>
        <button
          onClick={()=>onScore(p.id, (score||hole.par)-1)}
          disabled={score<=1}
          style={{width:72, height:72, borderRadius:16, border:'none', background:'#162950',
            color:'#fff', fontSize:40, fontFamily:'Barlow Condensed', fontWeight:900,
            cursor:'pointer', flexShrink:0, opacity:score>1?1:0.3,
            WebkitTapHighlightColor:'transparent', userSelect:'none', lineHeight:1}}>
          −
        </button>

        <div
          onClick={onScoreTap}
          style={{flex:1, textAlign:'center', padding:'0 4px', cursor:'pointer', borderRadius:14,
            background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
            minHeight:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent', userSelect:'none'}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, lineHeight:1,
            fontSize:76, color:score?relColor:'#2A4A6E', transition:'color 0.15s'}}>
            {score||'—'}
          </div>
          <div style={{fontFamily:'Barlow Condensed', fontSize:14, fontWeight:700, letterSpacing:2.5, color:relColor, marginTop:2}}>
            {relLabel}
          </div>
          {net!==null && strokes>0 && (
            <div style={{fontSize:11, color:'#4A6890', marginTop:1}}>NET {net}</div>
          )}
          {!score && <div style={{fontSize:10, color:'#2A4A6E', marginTop:4, fontFamily:'DM Sans', letterSpacing:0.5}}>TAP TO ENTER</div>}
        </div>

        <button
          onClick={()=>onScore(p.id, (score||hole.par)+1)}
          style={{width:72, height:72, borderRadius:16, border:'none',
            background:'linear-gradient(135deg,#C9A84C,#A8893A)',
            color:'#0A1628', fontSize:40, fontFamily:'Barlow Condensed', fontWeight:900,
            cursor:'pointer', flexShrink:0,
            WebkitTapHighlightColor:'transparent', userSelect:'none', lineHeight:1}}>
          +
        </button>
      </div>

      {/* ── Putt tracker ── */}
      <div style={{display:'flex', alignItems:'center', padding:'10px 14px 14px', borderTop: isPTMHolder && puttVal === 0 ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(30,58,110,0.7)', gap:10,
        background: isPTMHolder && puttVal === 0 ? 'rgba(201,168,76,0.06)' : 'transparent'}}>
        <div style={{display:'flex', flexDirection:'column', gap:2, flexShrink:0}}>
          <Label style={{flexShrink:0}}>PUTTS</Label>
          {isPTMHolder && puttVal === 0 && (
            <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:9, color:'#C9A84C', letterSpacing:0.5}}>💰 REQUIRED</span>
          )}
        </div>
        <div style={{display:'flex', gap:7, marginLeft:2}}>
          {[1,2,3,4].map(n=>(
            <button key={n}
              onClick={()=>onPutt(p.id, puttVal===n ? 0 : n)}
              style={{width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18,
                background: puttVal===n ? '#162950' : 'transparent',
                border: puttVal===n ? `2px solid ${p.color}` : isPTMHolder && puttVal === 0 ? '1px solid rgba(201,168,76,0.4)' : '1px solid #1E3A6E',
                color: puttVal===n ? p.color : isPTMHolder && puttVal === 0 ? '#C9A84C' : '#4A6890',
                WebkitTapHighlightColor:'transparent'}}>
              {n}
            </button>
          ))}
        </div>
        {puttVal >= 3 && (
          <span style={{fontSize:11, color:'#E5534B', fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:0.5, marginLeft:4}}>
            3-PUTT
          </span>
        )}
      </div>
    </div>
  );
};

// ── Collapsible game tracker drawer ──────────────────────────────────────────
const TrackersDrawer = ({ open, onToggle, children, activeFormats }) => {
  const formatIcons = { wolf:'🐺', nassau:'💰', stableford:'⭐', passmoney:'💸', skins:'🎯' };
  return (
    <div style={{borderTop:'1px solid #1E3A6E', flexShrink:0}}>
      <button onClick={onToggle}
        style={{width:'100%', display:'flex', alignItems:'center', padding:'12px 16px', background:'#050E1C', border:'none', cursor:'pointer', gap:10}}>
        <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:2, color:'#7A98BC'}}>GAME TRACKERS</span>
        <div style={{display:'flex', gap:5, marginLeft:4}}>
          {activeFormats.map(f => <span key={f} style={{fontSize:14}}>{formatIcons[f]||'🎯'}</span>)}
        </div>
        <span style={{marginLeft:'auto', color:'#4A6890', fontSize:16, transform: open?'rotate(180deg)':'none', transition:'transform 0.2s'}}>▾</span>
      </button>
      {open && (
        <div style={{maxHeight:340, overflowY:'auto'}}>
          {children}
        </div>
      )}
    </div>
  );
};

// ── Main ScoreEntry ───────────────────────────────────────────────────────────
const ScoreEntry = ({ round, onSaveRound }) => {
  const { getWolfForHole, getHoleStrokes, computePTMState } = window;
  const { players, course, formats, syncCode } = round;

  const [holeIdx,       setHoleIdx]       = React.useState(() => parseInt(localStorage.getItem('pp_hole_'+syncCode)||'0'));
  const [scores,        setScores]        = React.useState(() => { try { return JSON.parse(localStorage.getItem('pp_scores_'+syncCode)) || Object.fromEntries(players.map(p=>[p.id,[]])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,[]])); }});
  const [putts,         setPutts]         = React.useState(Object.fromEntries(players.map(p=>[p.id,Array(18).fill(0)])));
  const [wolfData,      setWolfData]      = React.useState(() => { try { return JSON.parse(localStorage.getItem('pp_wolf_'+syncCode)) || {}; } catch(e) { return {}; }});
  const [manualChips,   setManualChips]   = React.useState(Object.fromEntries(players.map(p=>[p.id,0])));
  const [nassauPresses, setNassauPresses] = React.useState([]);
  const [scoreBugPlayer, setScoreBugPlayer] = React.useState(null);
  const [showQR,        setShowQR]        = React.useState(false);
  const [showWolfPicker,setShowWolfPicker]= React.useState(false);
  const [saveModal,     setSaveModal]     = React.useState(false);
  const [exitModal,     setExitModal]     = React.useState(false);
  const [trackersOpen,  setTrackersOpen]  = React.useState(false);
  const [toast,         setToast]         = React.useState(null);

  const hole      = course.holes[holeIdx];
  const hasWolf   = formats.some(f=>f.type==='wolf');
  const hasNassau = formats.some(f=>f.type==='nassau');
  const hasPTM    = formats.some(f=>f.type==='passmoney');
  const wolfFmt   = formats.find(f=>f.type==='wolf');
  const nassauFmt = formats.find(f=>f.type==='nassau');
  const ptmFmt    = formats.find(f=>f.type==='passmoney');
  const wolfPlayer = hasWolf ? getWolfForHole(players, holeIdx) : null;

  const activeFormatTypes = formats.map(f=>f.type);

  const persist = (s, w) => {
    localStorage.setItem('pp_scores_'+syncCode, JSON.stringify(s));
    localStorage.setItem('pp_wolf_'+syncCode, JSON.stringify(w));
    localStorage.setItem('pp_hole_'+syncCode, String(holeIdx));
  };

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const setScore = (playerId, val) => {
    if (val < 1) return;
    const next = {...scores, [playerId]:[...(scores[playerId]||[])]};
    next[playerId][holeIdx] = val;
    setScores(next); persist(next, wolfData);
  };

  const setPuttCount = (playerId, val) => {
    const next = {...putts, [playerId]:[...(putts[playerId]||Array(18).fill(0))]};
    next[playerId][holeIdx] = val; setPutts(next);
  };

  const handleSetPartner = (partnerId, confirmed=true) => {
    const wp = getWolfForHole(players, holeIdx);
    const next = {...wolfData, [holeIdx]: { wolfId:wp.id, partnerId, confirmed, lone:false }};
    setWolfData(next); persist(scores, next);
  };

  const handleLoneWolf = () => {
    const wp = getWolfForHole(players, holeIdx);
    const next = {...wolfData, [holeIdx]: { wolfId:wp.id, partnerId:null, confirmed:true, lone:true }};
    setWolfData(next); persist(scores, next);
  };

  const handleManualChipAdjust = (playerId, delta) => {
    setManualChips(prev => ({...prev, [playerId]: (prev[playerId]||0)+delta}));
  };

  const handlePress = (segment, startHole, stake) => {
    setNassauPresses(prev => [...prev, {segment, startHole, stake}]);
    showToast(`Nassau press added — ${segment.toUpperCase()} from H${startHole+1}`, 'info');
  };

  const goToHole = (i) => {
    setHoleIdx(i);
    localStorage.setItem('pp_hole_'+syncCode, String(i));
  };

  const checkAdvanceGuards = () => {
    if (hasPTM && ptmHolderId) {
      const holderPutts = putts[ptmHolderId]?.[holeIdx] || 0;
      if (holderPutts === 0) {
        const holderName = players.find(p => p.id === ptmHolderId)?.name.split(' ')[0] || 'Money holder';
        showToast(`Enter putts for 💰 ${holderName} before advancing`, 'error');
        return false;
      }
    }
    if (hasWolf && !wolfData[holeIdx]?.confirmed) {
      const wolfName = wolfPlayer?.name.split(' ')[0] || 'Wolf';
      showToast(`🐺 ${wolfName} must pick a partner or go lone wolf first`, 'error');
      return false;
    }
    return true;
  };

  const handleNextHole = () => {
    if (!checkAdvanceGuards()) return;
    goToHole(holeIdx + 1);
  };

  const tryGoToHole = (targetIdx) => {
    if (targetIdx > holeIdx && !checkAdvanceGuards()) return;
    goToHole(targetIdx);
  };

  const isLastHole      = holeIdx === 17;
  const holesCompleted  = Array.from({length:18},(_,i)=>i).filter(i=>players.every(p=>scores[p.id]?.[i])).length;

  const ptmHolderId = React.useMemo(() => {
    if (!hasPTM) return null;
    const prevScores = Object.fromEntries(players.map(p => [p.id, (scores[p.id]||[]).map((s,i) => i < holeIdx ? s : null)]));
    const prevPutts  = Object.fromEntries(players.map(p => [p.id, (putts[p.id]||Array(18).fill(0)).map((s,i) => i < holeIdx ? s : 0)]));
    const { holderId } = computePTMState(prevScores, prevPutts, players, course, players[0].id);
    return holderId;
  }, [JSON.stringify(scores), JSON.stringify(putts), holeIdx]);

  // ── FIX: Wolf standings use full wolfData (calcWolfStandings already gates on
  //         wd.confirmed). holeIdx in dep array ensures re-render on hole change.
  const playerFormatStats = React.useMemo(() => {
    const { calcWolfStandings, calcStablefordPoints, calcSkins } = window;
    const result = {};
    players.forEach(p => {
      const stats = [];

      const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;
      if (holesPlayed > 0) {
        const total = (scores[p.id]||[]).reduce((acc, s) => acc + (s || 0), 0);
        stats.push({ icon: '⛳', label: 'STROKES', value: String(total), color: '#9BB4D4' });
      }

      if (hasWolf) {
        // Use full wolfData — calcWolfStandings only counts confirmed holes
        const wolfPts = calcWolfStandings(scores, wolfData, players, course);
        const pts = wolfPts[p.id] || 0;
        stats.push({ icon: '🐺', label: 'WOLF PTS', value: String(pts), color: pts > 0 ? '#3DCB6C' : '#7A98BC' });
      }

      if (formats.some(f => f.type === 'stableford')) {
        const pts = course.holes.reduce((acc, h, i) => {
          const g = scores[p.id]?.[i];
          return acc + (g ? calcStablefordPoints(g, h.par, p.handicap, h.hdcp) : 0);
        }, 0);
        stats.push({ icon: '⭐', label: 'STBL PTS', value: String(pts), color: pts >= 2 ? '#C9A84C' : '#7A98BC' });
      }

      if (formats.some(f => f.type === 'skins')) {
        const skinsFmt = formats.find(f => f.type === 'skins');
        const { skins } = calcSkins(scores, players, course, skinsFmt?.stakes || 1);
        const won = skins[p.id] || 0;
        stats.push({ icon: '🎯', label: 'SKINS', value: String(won), color: won > 0 ? '#C9A84C' : '#7A98BC' });
      }

      if (hasPTM && ptmHolderId === p.id) {
        stats.push({ icon: '💰', label: 'HOLDS', value: '💰', color: '#C9A84C' });
      }

      result[p.id] = stats;
    });
    return result;
  }, [JSON.stringify(scores), JSON.stringify(wolfData), JSON.stringify(putts), holeIdx, hasWolf, hasPTM, ptmHolderId]);

  const wd = wolfData[holeIdx] || {};

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative'}}>

      {/* ── Hole strip + QR ───────────────────────────────────────── */}
      <div style={{display:'flex', alignItems:'center', borderBottom:'1px solid #1E3A6E', flexShrink:0, background:'#050E1C'}}>
        <div style={{flex:1, display:'flex', padding:'8px 6px'}}>
          {course.holes.map((h,i) => {
            const done = players.every(p=>scores[p.id]?.[i]);
            const cur  = i === holeIdx;
            return (
              <div key={i} onClick={()=>tryGoToHole(i)} style={{
                flex:1, height:32, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'Barlow Condensed', fontSize:12, cursor:'pointer', transition:'all 0.12s',
                background: cur?'#C9A84C': done?'#162950':'transparent',
                color: cur?'#0A1628': done?'#3DCB6C':'#4A6890',
                border: cur?'none': done?'1px solid #3DCB6C44':'1px solid transparent',
                fontWeight: cur?800:600,
                margin:'0 1px',
              }}>{i+1}</div>
            );
          })}
        </div>
        <button onClick={()=>setShowQR(true)}
          style={{flexShrink:0, width:44, height:44, marginRight:10, background:'rgba(61,203,108,0.08)',
            border:'1px solid rgba(61,203,108,0.25)', borderRadius:10, color:'#3DCB6C', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:20}}>
          ⬛
        </button>
      </div>

      {/* ── Hole info header ──────────────────────────────────────── */}
      <div style={{display:'flex', alignItems:'center', padding:'10px 12px', borderBottom:'1px solid #1E3A6E', flexShrink:0, gap:8}}>
        <button onClick={()=>holeIdx>0&&goToHole(holeIdx-1)} disabled={holeIdx===0}
          style={{width:48, height:48, borderRadius:12, background:'#162950', border:'1px solid #1E3A6E',
            color:holeIdx===0?'#2A4A6E':'#fff', fontSize:28, cursor:holeIdx===0?'default':'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Barlow Condensed', flexShrink:0}}>
          ‹
        </button>

        <div style={{flex:1, textAlign:'center'}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:32, color:'#fff', letterSpacing:2, lineHeight:1}}>
            HOLE {holeIdx+1}
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center', justifyContent:'center', marginTop:3,
            fontFamily:'Barlow Condensed', fontSize:13, color:'#7A98BC'}}>
            <span>PAR <strong style={{color:'#C9A84C'}}>{hole.par}</strong></span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span>{hole.yds} YDS</span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span>HDCP {hole.hdcp}</span>
            <span style={{color:'#1E3A6E'}}>│</span>
            <span style={{color:'#4A6890'}}>{holesCompleted}/18</span>
          </div>
        </div>

        <button onClick={()=>holeIdx<17&&tryGoToHole(holeIdx+1)} disabled={holeIdx===17}
          style={{width:48, height:48, borderRadius:12, background:'#162950', border:'1px solid #1E3A6E',
            color:holeIdx===17?'#2A4A6E':'#fff', fontSize:28, cursor:holeIdx===17?'default':'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Barlow Condensed', flexShrink:0}}>
          ›
        </button>
      </div>

      {/* ── Scrollable player cards + trackers ────────────────────── */}
      <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column'}}>

        <div style={{display:'flex', flexDirection:'column', gap:10, padding:'12px 12px 4px'}}>
          {players.map(p => {
            const isWolf    = hasWolf && wolfPlayer?.id === p.id;
            const isPartner = hasWolf && wd.partnerId === p.id;
            return (
              <PlayerScoreCard
                key={p.id}
                p={p}
                score={scores[p.id]?.[holeIdx] || 0}
                hole={hole}
                holeIdx={holeIdx}
                putts={putts}
                isWolf={isWolf}
                isPartner={isPartner}
                isPTMHolder={hasPTM && ptmHolderId === p.id}
                hasWolf={hasWolf}
                formatStats={playerFormatStats[p.id]}
                onScore={setScore}
                onPutt={setPuttCount}
                onWolfTap={()=>setShowWolfPicker(true)}
                onScoreTap={()=>setScoreBugPlayer(p)}
                wolfData={wolfData}
              />
            );
          })}
        </div>

        {hasWolf && wd.confirmed && (
          <div style={{margin:'4px 12px 0', padding:'10px 14px', background:'rgba(229,83,75,0.05)',
            border:'1px solid rgba(229,83,75,0.2)', borderRadius:12, display:'flex', alignItems:'center', gap:10}}>
            <span style={{fontSize:16}}>🐺</span>
            <span style={{fontFamily:'DM Sans', fontSize:13, color:'#9BB4D4', flex:1}}>
              {wd.lone
                ? `${wolfPlayer?.name.split(' ')[0]} going lone wolf`
                : `${wolfPlayer?.name.split(' ')[0]} partnered with ${players.find(p=>p.id===wd.partnerId)?.name.split(' ')[0]}`}
            </span>
            <button onClick={()=>setShowWolfPicker(true)}
              style={{background:'none', border:'none', color:'#4A6890', fontSize:12, cursor:'pointer', fontFamily:'DM Sans', textDecoration:'underline'}}>
              change
            </button>
          </div>
        )}

        <RoundTracker players={players} scores={scores} course={course} holeIdx={holeIdx}/>

        {(hasWolf || hasNassau || hasPTM) && (
          <TrackersDrawer open={trackersOpen} onToggle={()=>setTrackersOpen(v=>!v)} activeFormats={activeFormatTypes}>
            {hasWolf && (
              <WolfTracker players={players} scores={scores} wolfData={wolfData} course={course}
                holeIdx={holeIdx} onSetPartner={handleSetPartner} onLoneWolf={handleLoneWolf} format={wolfFmt}/>
            )}
            {hasPTM && (
              <PTMTracker players={players} scores={scores} putts={putts} course={course}
                holeIdx={holeIdx} ptmInitialHolder={players[0].id} format={ptmFmt}/>
            )}
            {hasNassau && (
              <NassauTracker players={players} scores={scores} course={course} holeIdx={holeIdx}
                presses={nassauPresses} onPress={handlePress} format={nassauFmt}/>
            )}
          </TrackersDrawer>
        )}

        <div style={{height:8}}/>
      </div>

      {/* ── Sticky bottom action bar ───────────────────────────────── */}
      <div style={{padding:'10px 14px', borderTop:'1px solid #1E3A6E', flexShrink:0,
        background:'#050E1C', display:'flex', gap:10, paddingBottom:'max(10px, env(safe-area-inset-bottom))'}}>
        <button onClick={()=>setExitModal(true)}
          style={{width:56, height:60, borderRadius:14, border:'1px solid rgba(229,83,75,0.35)',
            background:'rgba(229,83,75,0.08)', color:'#E5534B', fontSize:11,
            cursor:'pointer', flexShrink:0, fontFamily:'Barlow Condensed', fontWeight:800,
            letterSpacing:0.5, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2}}>
          <span style={{fontSize:18}}>✕</span>
          <span>EXIT</span>
        </button>
        <button onClick={()=>goToHole(holeIdx-1)} disabled={holeIdx===0}
          style={{width:56, height:60, borderRadius:14, border:'1px solid #1E3A6E',
            background:'#162950', color:holeIdx===0?'#2A4A6E':'#fff', fontSize:22,
            cursor:holeIdx===0?'default':'pointer', flexShrink:0, fontFamily:'Barlow Condensed', fontWeight:700}}>
          ←
        </button>
        {!isLastHole ? (
          <button onClick={handleNextHole}
            style={{flex:1, height:60, borderRadius:14, border:'none',
              background:'linear-gradient(135deg,#C9A84C,#A8893A)',
              color:'#0A1628', fontSize:19, fontFamily:'Barlow Condensed', fontWeight:800,
              cursor:'pointer', letterSpacing:1.5, WebkitTapHighlightColor:'transparent'}}>
            NEXT HOLE →
          </button>
        ) : (
          <button onClick={()=>setSaveModal(true)}
            style={{flex:1, height:60, borderRadius:14, border:'none',
              background:'linear-gradient(135deg,#C9A84C,#A8893A)',
              color:'#0A1628', fontSize:18, fontFamily:'Barlow Condensed', fontWeight:800,
              cursor:'pointer', letterSpacing:1, boxShadow:'0 4px 32px rgba(201,168,76,0.4)',
              WebkitTapHighlightColor:'transparent'}}>
            💾 SAVE ROUND
          </button>
        )}
      </div>

      {/* ── Modals & Overlays ──────────────────────────────────────── */}
      {scoreBugPlayer && (
        <ScoreBug
          player={scoreBugPlayer}
          hole={{...hole, number: holeIdx + 1}}
          currentScore={scores[scoreBugPlayer.id]?.[holeIdx] || 0}
          onSelect={(strokes) => setScore(scoreBugPlayer.id, strokes)}
          onClose={() => setScoreBugPlayer(null)}
        />
      )}

      {showQR && <QRModal syncCode={syncCode} onClose={()=>setShowQR(false)}/>}

      {showWolfPicker && hasWolf && (
        <WolfPickerSheet
          players={players}
          wolfPlayer={wolfPlayer}
          wolfData={wolfData}
          holeIdx={holeIdx}
          onSetPartner={handleSetPartner}
          onLoneWolf={handleLoneWolf}
          onClose={()=>setShowWolfPicker(false)}
        />
      )}

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

      <Modal open={exitModal} onClose={()=>setExitModal(false)} title="Exit Round">
        <div style={{fontFamily:'DM Sans', color:'#9BB4D4', fontSize:14, lineHeight:1.8, marginBottom:20}}>
          <div style={{marginBottom:12}}>What would you like to do?</div>
          <div style={{padding:'10px 12px', background:'rgba(229,83,75,0.06)', border:'1px solid rgba(229,83,75,0.2)', borderRadius:8, fontSize:13, color:'#E5534B'}}>
            {holesCompleted}/18 holes scored · Hole {holeIdx+1} in progress
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <Btn onClick={()=>{ setExitModal(false); onSaveRound(scores, wolfData, putts, nassauPresses, manualChips); }} variant="gold" style={{width:'100%'}}>💾 SAVE &amp; EXIT</Btn>
          <Btn onClick={()=>{ setExitModal(false); onSaveRound(scores, wolfData, putts, nassauPresses, manualChips); }} variant="surface" style={{width:'100%'}}>📊 VIEW RESULTS SO FAR</Btn>
          <Btn onClick={()=>setExitModal(false)} variant="ghost" style={{width:'100%'}}>CANCEL — KEEP PLAYING</Btn>
        </div>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type}/>}
      <style>{`@keyframes wolfPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.85;transform:scale(1.04)} }`}</style>
    </div>
  );
};

Object.assign(window, { ScoreEntry });
