// ScoreEntry.jsx — Full Score Entry Screen with real-time cross-device sync

const PlayerScoreCard = ({ p, score, hole, holeIdx, putts, gettingPop, nassauPopActive, isNassauPlayer, isWolf, isPartner, isPTMHolder, hasWolf, wolfData, formatStats, onScore, onPutt, onWolfTap, onScoreTap, onPopToggle }) => {
  const diff     = score ? score - hole.par : null;
  const relColor = diff===null?'#2A2A2A':diff<=-2?'#D4AF37':diff===-1?'#4ADE80':diff===0?'#A0A0A0':diff===1?'#FF6B6B':'#CC3333';
  const relLabel = diff===null?'—':diff<=-3?'ALB':diff===-2?'EGL':diff===-1?'BRD':diff===0?'PAR':diff===1?'BOG':diff===2?'DBL':`+${diff}`;
  const puttVal  = putts[p.id]?.[holeIdx] || 0;

  const cardBorder = isWolf ? '1.5px solid rgba(255,107,107,0.4)' : isPartner ? `1.5px solid ${p.color}44` : '1px solid #2A2A2A';
  const cardBg     = isWolf ? 'rgba(255,107,107,0.04)' : '#1E1E1E';

  return (
    <div style={{background:cardBg, border:cardBorder, borderRadius:18, overflow:'hidden', flexShrink:0}}>

      {/* Player header */}
      <div style={{display:'flex', alignItems:'center', padding:'12px 16px 8px', gap:10}}>
        <Avatar player={p} size={36}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:20, color:'#F5F5F5', letterSpacing:0.2, lineHeight:1}}>{p.name}</div>
          <div style={{fontSize:11, color:'#A0A0A0', marginTop:3, fontFamily:'Inter, system-ui, sans-serif'}}>HCP {p.handicap}</div>
        </div>
        {isWolf && !hasWolf && <span style={{fontSize:18}}>🐺</span>}
        {isPartner && !isWolf && <span style={{fontSize:16, opacity:0.8}}>⚑</span>}
        {hasWolf && isWolf && (
          <button onClick={onWolfTap} style={{
            background: !wolfData?.[holeIdx]?.confirmed ? '#FF6B6B' : 'rgba(0,168,107,0.12)',
            border: !wolfData?.[holeIdx]?.confirmed ? 'none' : '1px solid rgba(0,168,107,0.3)',
            color: !wolfData?.[holeIdx]?.confirmed ? '#F5F5F5' : '#00A86B',
            borderRadius:20, padding:'5px 12px 5px 8px', cursor:'pointer',
            fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, letterSpacing:0.5,
            display:'flex', alignItems:'center', gap:5,
            WebkitTapHighlightColor:'transparent', flexShrink:0,
          }}>
            <span style={{fontSize:14}}>🐺</span>
            {!wolfData?.[holeIdx]?.confirmed ? 'PICK →' : wolfData[holeIdx]?.lone ? 'LONE 🐺' : '✓ SET'}
          </button>
        )}
      </div>

      {/* Wolf pick required warning */}
      {isWolf && hasWolf && !wolfData?.[holeIdx]?.confirmed && (
        <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 16px 6px',
          background:'rgba(255,107,107,0.06)', borderTop:'1px solid rgba(255,107,107,0.15)'}}>
          <span style={{fontSize:11}}>⚠️</span>
          <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#FF6B6B', letterSpacing:0.5}}>PICK PARTNER OR GO LONE WOLF TO ADVANCE</span>
        </div>
      )}

      {/* PTM putt required warning */}
      {isPTMHolder && !(putts[p.id]?.[holeIdx] > 0) && (
        <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 16px 6px',
          background:'rgba(212,175,55,0.06)', borderTop:'1px solid rgba(212,175,55,0.15)'}}>
          <span style={{fontSize:11}}>⚠️</span>
          <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#D4AF37', letterSpacing:0.5}}>ENTER PUTTS TO ADVANCE</span>
        </div>
      )}

      {/* Format stat pills */}
      {formatStats && formatStats.length > 0 && (
        <div style={{display:'flex', gap:6, padding:'0 12px 10px', flexWrap:'wrap'}}>
          {formatStats.map((s,i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:4,
              background:'#121212', border:'1px solid #2A2A2A',
              borderRadius:20, padding:'3px 10px 3px 8px',
            }}>
              {s.icon && <span style={{fontSize:11, lineHeight:1}}>{s.icon}</span>}
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:13, color:s.color, lineHeight:1}}>{s.value}</span>
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:9, color:'#666666', letterSpacing:0.3, marginLeft:2}}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score stepper */}
      <div style={{display:'flex', alignItems:'center', padding:'0 12px 12px', gap:8}}>
        <button
          onClick={()=>onScore(p.id, (score||hole.par)-1)}
          disabled={score<=1}
          style={{width:52, height:52, borderRadius:12, border:'none', background:'#252525',
            color:'#F5F5F5', fontSize:28, fontFamily:'Inter, system-ui, sans-serif', fontWeight:900,
            cursor:'pointer', flexShrink:0, opacity:score>1?1:0.3,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          −
        </button>

        <div
          onClick={onScoreTap}
          style={{flex:1, cursor:'pointer', borderRadius:12,
            background:'#121212', border:'1px solid #2A2A2A',
            minHeight:72, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent', userSelect:'none', gap:2}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, lineHeight:1,
            fontSize:64, color:score?relColor:'#2A2A2A', transition:'color 0.15s'}}>
            {score||'—'}
          </div>
          {score
            ? <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, fontWeight:700, letterSpacing:1, color:relColor}}>{relLabel}</div>
            : <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:10, color:'#666666', letterSpacing:0.5}}>TAP TO ENTER</div>
          }
        </div>

        <button
          onClick={()=>onScore(p.id, (score||hole.par)+1)}
          style={{width:52, height:52, borderRadius:12, border:'none',
            background:'#D4AF37', boxShadow:'0 2px 10px rgba(212,175,55,0.3)',
            color:'#0D0D0D', fontSize:28, fontFamily:'Inter, system-ui, sans-serif', fontWeight:900,
            cursor:'pointer', flexShrink:0,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          +
        </button>
      </div>

      {/* Pop pill row */}
      {(isNassauPlayer ? nassauPopActive : true) && (
        <div style={{display:'flex', justifyContent:'flex-end', padding:'0 12px 10px'}}>
          {isNassauPlayer ? (
            <div style={{
              borderRadius:999, padding:'5px 10px', minHeight:28,
              border:'1px solid rgba(212,175,55,0.45)',
              background:'rgba(212,175,55,0.12)', color:'#D4AF37',
              fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, letterSpacing:0.5,
              display:'flex', alignItems:'center', gap:4,
            }}>
              <span>💰</span> POP ON
            </div>
          ) : (
            <button
              onClick={()=>onPopToggle(p.id)}
              style={{
                borderRadius:999, padding:'5px 10px', minHeight:28,
                border:gettingPop ? '1px solid rgba(212,175,55,0.45)' : '1px solid #2A2A2A',
                background:gettingPop ? 'rgba(212,175,55,0.12)' : '#121212',
                color:gettingPop ? '#D4AF37' : '#A0A0A0',
                fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, letterSpacing:0.5,
                cursor:'pointer', WebkitTapHighlightColor:'transparent'
              }}>
              {gettingPop ? 'POP ON' : 'POP'}
            </button>
          )}
        </div>
      )}

      {/* Putt tracker */}
      <div style={{display:'flex', alignItems:'center', padding:'8px 14px 12px',
        borderTop: isPTMHolder && puttVal === 0 ? '1px solid rgba(212,175,55,0.4)' : '1px solid #2A2A2A',
        gap:10,
        background: isPTMHolder && puttVal === 0 ? 'rgba(212,175,55,0.04)' : 'transparent'}}>
        <div style={{display:'flex', flexDirection:'column', gap:1, flexShrink:0}}>
          <Label style={{flexShrink:0}}>PUTTS</Label>
          {isPTMHolder && puttVal === 0 && (
            <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#D4AF37', letterSpacing:0.5}}>💰 REQUIRED</span>
          )}
        </div>
        <div style={{display:'flex', gap:6, marginLeft:2}}>
          {[1,2,3,4].map(n=>(
            <button key={n}
              onClick={()=>onPutt(p.id, puttVal===n ? 0 : n)}
              style={{width:40, height:40, borderRadius:9,
                border: puttVal===n ? 'none' : '1px solid #2A2A2A',
                background: puttVal===n ? p.color : '#252525',
                color: puttVal===n ? '#0D0D0D' : '#A0A0A0',
                fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:17,
                cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none',
                display:'flex', alignItems:'center', justifyContent:'center'}}>
              {n}
            </button>
          ))}
        </div>
        {puttVal >= 3 && <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#FF6B6B', marginLeft:2, letterSpacing:0.5}}>3-PUTT</span>}
      </div>
    </div>
  );
};

// ── Score Name Grid Modal ─────────────────────────────────────────────────────
const ScoreKeypad = ({ player, hole, current, onConfirm, onClose }) => {
  const scoreName = (strokes, par) => {
    const d = strokes - par;
    if (strokes === 1)  return { label:'ACE',    color:'#D4AF37' };
    if (d <= -3)        return { label:'ALB',    color:'#D4AF37' };
    if (d === -2)       return { label:'EAGLE',  color:'#D4AF37' };
    if (d === -1)       return { label:'BIRDIE', color:'#4ADE80' };
    if (d === 0)        return { label:'PAR',    color:'#A0A0A0' };
    if (d === 1)        return { label:'BOGEY',  color:'#FF6B6B' };
    if (d === 2)        return { label:'DOUBLE', color:'#CC3333' };
    if (d === 3)        return { label:'TRIPLE', color:'#8B0000' };
    return               { label:`+${d}`,       color:'#8B0000' };
  };

  const tiles = Array.from({length:9}, (_,i) => i+1);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:2000,
      display:'flex',alignItems:'center',justifyContent:'center', padding:'20px'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#1E1E1E',borderRadius:20,padding:'20px',width:'100%',maxWidth:380, border:'1px solid #2A2A2A'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif',fontWeight:800,fontSize:15,color:'#F5F5F5',letterSpacing:0.3}}>
            {player.name.toUpperCase()} — HOLE {hole.num} (PAR {hole.par})
          </div>
          <button onClick={onClose}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid #2A2A2A',borderRadius:8,color:'#A0A0A0',fontSize:18,cursor:'pointer',
              width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {tiles.map(n => {
            const s = scoreName(n, hole.par);
            const isCurrent = current === n;
            return (
              <button key={n}
                onClick={()=>{ onConfirm(player.id, n); onClose(); }}
                style={{
                  height:68, borderRadius:14, cursor:'pointer',
                  border:`2px solid ${isCurrent ? s.color : s.color+'33'}`,
                  background: isCurrent ? `${s.color}18` : '#121212',
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:2,
                  WebkitTapHighlightColor:'transparent', userSelect:'none',
                }}>
                <span style={{fontFamily:'Inter, system-ui, sans-serif',fontWeight:900,fontSize:28,color:s.color,lineHeight:1}}>{n}</span>
                <span style={{fontFamily:'Inter, system-ui, sans-serif',fontWeight:700,fontSize:10,color:s.color,letterSpacing:0.5}}>{s.label}</span>
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
  <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:2000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'#1E1E1E',borderRadius:'20px 20px 0 0',padding:'20px 20px 32px',width:'100%',maxWidth:420, border:'1px solid #2A2A2A', borderBottom:'none'}}>
      <div style={{fontFamily:'Inter, system-ui, sans-serif',fontWeight:800,fontSize:20,color:'#FF6B6B',marginBottom:4}}>
        🐺 {wolfPlayer.name.toUpperCase()} IS WOLF
      </div>
      <div style={{fontFamily:'Inter, system-ui, sans-serif',fontSize:13,color:'#A0A0A0',marginBottom:16}}>Pick a partner or go lone wolf for hole {holeIdx+1}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
        {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
          <button key={p.id} onClick={()=>onPick(p.id)}
            style={{width:'100%',padding:'14px 16px',borderRadius:14,border:`1px solid ${p.color}44`,
              background:`${p.color}0A`,color:p.color,fontFamily:'Inter, system-ui, sans-serif',
              fontWeight:700,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',gap:12,
              WebkitTapHighlightColor:'transparent'}}>
            <Avatar player={p} size={32}/>
            {p.name.toUpperCase()}
          </button>
        ))}
        <button onClick={onLone}
          style={{width:'100%',padding:'14px 16px',borderRadius:14,
            border:'1px solid rgba(255,107,107,0.4)',background:'rgba(255,107,107,0.08)',
            color:'#FF6B6B',fontFamily:'Inter, system-ui, sans-serif',fontWeight:800,fontSize:16,
            cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          🐺 GO LONE WOLF
        </button>
      </div>
      <button onClick={onClose} style={{width:'100%',height:48,borderRadius:12,border:'1px solid #2A2A2A',background:'transparent',color:'#A0A0A0',fontFamily:'Inter, system-ui, sans-serif',fontWeight:700,fontSize:14,cursor:'pointer',letterSpacing:0.5}}>CANCEL</button>
    </div>
  </div>
);

// ── Collapsible Game Trackers Drawer ─────────────────────────────────────────
const TrackersDrawer = ({ open, onToggle, formats, children }) => {
  const formatIcons = { wolf:'🐺', nassau:'💰', stableford:'⭐', passmoney:'💸', skins:'🎯' };
  const activeTypes = formats.map(f => f.type);

  return (
    <div style={{borderTop:'1px solid #2A2A2A'}}>
      <button
        onClick={onToggle}
        style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'11px 16px', background:'#0D0D0D', border:'none', cursor:'pointer',
          WebkitTapHighlightColor:'transparent',
        }}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:11,
            letterSpacing:1.5, color: open ? '#D4AF37' : '#A0A0A0'}}>
            GAME TRACKERS
          </span>
          <div style={{display:'flex', gap:4}}>
            {activeTypes.map(t => (
              <span key={t} style={{fontSize:12}}>{formatIcons[t] || '🎯'}</span>
            ))}
          </div>
        </div>
        <span style={{
          fontSize:14, color:'#666666',
          display:'inline-block',
          transform: open ? 'rotate(180deg)' : 'none',
          transition:'transform 0.2s',
        }}>▾</span>
      </button>

      {open && <div>{children}</div>}
    </div>
  );
};

// ── Nassau Hole Status Helper ─────────────────────────────────────────────────
function _nassauLiveStatusForMatch(scores, nassauConfig, players, course, currentHoleIdx) {
  const { nassauSegmentStatus } = window;
  const front = nassauSegmentStatus(scores, players, course, Array.from({length:9}, (_, i) => i), currentHoleIdx, {}, nassauConfig);
  const back  = nassauSegmentStatus(scores, players, course, Array.from({length:9}, (_, i) => i + 9), currentHoleIdx, {}, nassauConfig);
  const overall = nassauSegmentStatus(scores, players, course, Array.from({length:18}, (_, i) => i), currentHoleIdx, {}, nassauConfig);
  return { front, back, overall };
}

// ── Sync indicator ────────────────────────────────────────────────────────────
const SyncPulse = ({ syncing }) => {
  if (!syncing) return null;
  return (
    <div style={{
      position:'fixed', top:60, right:12, zIndex:500,
      display:'flex', alignItems:'center', gap:6,
      background:'rgba(0,168,107,0.1)', border:'1px solid rgba(0,168,107,0.3)',
      borderRadius:20, padding:'4px 10px',
      fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1, color:'#00A86B',
    }}>
      <div style={{width:6, height:6, borderRadius:'50%', background:'#00A86B', animation:'ppSyncPulse 0.8s ease-in-out infinite'}}/>
      SYNCING
      <style>{`@keyframes ppSyncPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
};

// ── Main ScoreEntry Screen ────────────────────────────────────────────────────
const ScoreEntry = ({ round, onSaveRound, onExitRound, deviceId }) => {
  const { getWolfForHole, computePTMState, calcWolfStandings, calcStablefordPoints, calcSkins, getAdjustedHoleScore } = window;

  const { players, course, formats, syncCode } = round;

  const nassauFmtObj = formats.find(f => f.type === 'nassau');

  const nassauMatches = React.useMemo(() => {
    if (!nassauFmtObj) return [];
    if (nassauFmtObj.nassauMatches && nassauFmtObj.nassauMatches.length > 0) return nassauFmtObj.nassauMatches;
    if (nassauFmtObj.nassauConfig) {
      return [{ id:'legacy_nm', matchType:nassauFmtObj.nassauConfig.matchType||'1v1', playersInMatch:nassauFmtObj.nassauConfig.playersInMatch||[], teams:nassauFmtObj.nassauConfig.teams||null, popHoles:nassauFmtObj.nassauConfig.popHoles||{}, stakes:nassauFmtObj.stakes||5 }];
    }
    return [];
  }, []);

  const allNassauPlayerIds = React.useMemo(() => {
    const ids = new Set();
    nassauMatches.forEach(m => (m.playersInMatch || []).forEach(id => ids.add(id)));
    return ids;
  }, []);

  // ── State initializers ────────────────────────────────────────────────────
  const _initScores  = () => { try { const s = localStorage.getItem('pp_scores_'+round.id); return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(18).fill(null)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(18).fill(null)])); } };
  const _initPutts   = () => { try { const s = localStorage.getItem('pp_putts_'+round.id);  return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(18).fill(0)]));    } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(18).fill(0)]));    } };
  const _initPop     = () => { try { const s = localStorage.getItem('pp_pop_'+round.id);    return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(18).fill(false)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(18).fill(false)])); } };
  const _initWolf    = () => { try { const s = localStorage.getItem('pp_wolf_'+round.id);   return s ? JSON.parse(s) : {}; } catch(e) { return {}; } };

  const [scores,   setScores]   = React.useState(_initScores);
  const [putts,    setPutts]    = React.useState(_initPutts);
  const [popFlags, setPopFlags] = React.useState(_initPop);
  const [wolfData, setWolfData] = React.useState(_initWolf);

  const [holeIdx,  setHoleIdx]  = React.useState(0);
  const [keypad,   setKeypad]   = React.useState(null);
  const [wolfPicker, setWolfPicker] = React.useState(false);
  const [showFinish, setShowFinish] = React.useState(false);
  const [showExit,   setShowExit]   = React.useState(false);
  const [trackersOpen, setTrackersOpen] = React.useState(false);
  const [syncing,  setSyncing]  = React.useState(false);

  // Ref to hold pending write timer for debouncing
  const syncTimerRef  = React.useRef(null);
  // Track whether we're currently processing a remote update (to avoid echo)
  const applyingRemoteRef = React.useRef(false);

  const hasWolf   = formats.some(f => f.type === 'wolf');
  const hasPTM    = formats.some(f => f.type === 'passmoney');
  const hasNassau = nassauMatches.length > 0;
  const hasStable = formats.some(f => f.type === 'stableford');
  const hasSkins  = formats.some(f => f.type === 'skins');
  const wolfFmt   = formats.find(f => f.type === 'wolf');
  const ptmFmt    = formats.find(f => f.type === 'passmoney');
  const skinsFmt  = formats.find(f => f.type === 'skins');

  const hole       = course.holes[holeIdx];
  const wolfPlayer = hasWolf ? getWolfForHole(players, holeIdx) : null;
  const wolfHoleData = wolfData[holeIdx] || { wolfId: wolfPlayer?.id, partnerId: null, confirmed: false, lone: false };

  // ── Live refs for sync reads (avoid stale closures) ───────────────────────
  const scoresRef   = React.useRef(scores);
  const puttsRef    = React.useRef(putts);
  const popRef      = React.useRef(popFlags);
  const wolfRef     = React.useRef(wolfData);
  const holeIdxRef  = React.useRef(holeIdx);

  React.useEffect(() => { scoresRef.current = scores; }, [scores]);
  React.useEffect(() => { puttsRef.current  = putts;  }, [putts]);
  React.useEffect(() => { popRef.current    = popFlags; }, [popFlags]);
  React.useEffect(() => { wolfRef.current   = wolfData; }, [wolfData]);
  React.useEffect(() => { holeIdxRef.current = holeIdx; }, [holeIdx]);

  // ── Persist to localStorage ───────────────────────────────────────────────
  React.useEffect(() => { localStorage.setItem('pp_scores_'+round.id, JSON.stringify(scores)); }, [scores]);
  React.useEffect(() => { localStorage.setItem('pp_putts_'+round.id,  JSON.stringify(putts));  }, [putts]);
  React.useEffect(() => { localStorage.setItem('pp_pop_'+round.id,    JSON.stringify(popFlags)); }, [popFlags]);
  React.useEffect(() => { localStorage.setItem('pp_wolf_'+round.id,   JSON.stringify(wolfData)); }, [wolfData]);

  // ── Write to Firestore (debounced 400ms) ──────────────────────────────────
  const scheduleCloudWrite = React.useCallback((nextScores, nextPutts, nextPop, nextWolf) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!window.RoundSyncService || !syncCode) return;
      const payload = {
        scores:         nextScores || scoresRef.current,
        putts:          nextPutts  || puttsRef.current,
        popFlags:       nextPop    || popRef.current,
        wolfData:       nextWolf   || wolfRef.current,
        currentHoleIdx: holeIdxRef.current,
        _writtenBy: deviceId,
        _ts: Date.now(),
      };
      setSyncing(true);
      window.RoundSyncService.writeLiveScores(syncCode, payload, function() {
        setSyncing(false);
      });
    }, 400);
  }, [syncCode, deviceId]);

  // ── Subscribe to remote updates ───────────────────────────────────────────
  React.useEffect(() => {
    if (!window.RoundSyncService || !syncCode) return;

    window.RoundSyncService.subscribeRound(syncCode, deviceId, function(livePayload) {
      if (!livePayload) return;
      // Remote update: merge into local state
      applyingRemoteRef.current = true;
      if (livePayload.scores)   { setScores(livePayload.scores);   localStorage.setItem('pp_scores_'+round.id, JSON.stringify(livePayload.scores)); }
      if (livePayload.putts)    { setPutts(livePayload.putts);     localStorage.setItem('pp_putts_'+round.id,  JSON.stringify(livePayload.putts)); }
      if (livePayload.popFlags) { setPopFlags(livePayload.popFlags); localStorage.setItem('pp_pop_'+round.id,  JSON.stringify(livePayload.popFlags)); }
      if (livePayload.wolfData) { setWolfData(livePayload.wolfData); localStorage.setItem('pp_wolf_'+round.id, JSON.stringify(livePayload.wolfData)); }
      if (livePayload.currentHoleIdx !== undefined) { holeIdxRef.current = livePayload.currentHoleIdx; setHoleIdx(livePayload.currentHoleIdx); }
      // Small delay before clearing flag to let React batch the state updates
      setTimeout(() => { applyingRemoteRef.current = false; }, 50);
    });

    return () => {
      window.RoundSyncService.unsubscribeRound();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [syncCode, deviceId, round.id]);

  // ── PTM state ─────────────────────────────────────────────────────────────
  const ptmState = React.useMemo(() => {
    if (!hasPTM) return { holderId: players[0]?.id, log: [] };
    return computePTMState(scores, putts, players, course, players[0]?.id);
  }, [JSON.stringify(scores), JSON.stringify(putts)]);
  // Who held the money at the START of the current hole (before any pass this hole)
  const ptmHoleHolder = ptmState.holderAtStart?.[holeIdx] ?? ptmState.holderId;

  // ── Nassau live statuses ──────────────────────────────────────────────────
  const matchLiveStatuses = React.useMemo(() => {
    if (!hasNassau) return [];
    const MATCH_COLORS_LOCAL = ['#D4AF37', '#7B9FE0', '#E07BE0'];
    return nassauMatches.map((match, idx) => {
      const matchCfg = { playersInMatch:match.playersInMatch, matchType:match.matchType, teams:match.teams||null, popHoles:match.popHoles||{} };
      const status = _nassauLiveStatusForMatch(scores, matchCfg, players, course, holeIdx);
      return { matchId:match.id, matchColor:MATCH_COLORS_LOCAL[idx]||'#D4AF47', playersInMatch:match.playersInMatch, stakes:match.stakes, front:status.front, back:status.back, overall:status.overall };
    });
  }, [JSON.stringify(scores), holeIdx]);

  // ── Format stat pills ─────────────────────────────────────────────────────
  const playerFormatStats = React.useMemo(() => {
    const result = {};
    players.forEach(p => {
      const stats = [];
      const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;
      if (hasWolf) { const wolfPts = calcWolfStandings(scores, wolfData, players, course); const pts = wolfPts[p.id]||0; stats.push({ icon:'🐺', label:'WOLF PTS', value:String(pts), color:pts>0?'#4ADE80':'#A0A0A0' }); }
      if (hasStable) { const pts = course.holes.reduce((acc,h,i) => { const g=scores[p.id]?.[i]; return acc+(g?calcStablefordPoints(getAdjustedHoleScore(scores,popFlags,p.id,i),h.par):0); }, 0); stats.push({ icon:'⭐', label:'STBL PTS', value:String(pts), color:pts>=2?'#D4AF37':'#A0A0A0' }); }
      if (hasPTM && ptmHoleHolder===p.id) stats.push({ icon:'💰', label:'HOLDS', value:'', color:'#D4AF37' });
      if (holesPlayed>0) { const total=(scores[p.id]||[]).reduce((acc,s)=>acc+(s||0),0); stats.push({ icon:'⛳', label:'STROKES', value:String(total), color:'#A0A0A0' }); }
      if (hasSkins) { const {skins}=calcSkins(scores,players,course,skinsFmt?.stakes||1,popFlags); const won=skins[p.id]||0; stats.push({ icon:'🎯', label:'SKINS', value:String(won), color:won>0?'#D4AF37':'#A0A0A0' }); }
      if (hasNassau) {
        matchLiveStatuses.forEach((ms) => {
          if (!ms.playersInMatch.includes(p.id)) return;
          const opponentId = ms.playersInMatch.find(id => id !== p.id);
          const opponent   = opponentId ? players.find(pl => pl.id === opponentId) : null;
          const oppName    = opponent ? opponent.name.split(' ')[0] : '?';
          stats.push({ icon:'💰', label:`vs ${oppName} F9`, value:ms.front, color:ms.front==='EVEN'?'#A0A0A0':ms.matchColor });
          if (holeIdx >= 9) {
            stats.push({ icon:'', label:`B9`, value:ms.back,    color:ms.back==='EVEN'?'#A0A0A0':ms.matchColor });
            stats.push({ icon:'', label:`18`, value:ms.overall, color:ms.overall==='EVEN'?'#A0A0A0':ms.matchColor });
          }
        });
      }
      result[p.id] = stats;
    });
    return result;
  }, [JSON.stringify(scores), JSON.stringify(wolfData), JSON.stringify(popFlags), holeIdx, JSON.stringify(matchLiveStatuses)]);

  // ── Score / putt / pop setters ────────────────────────────────────────────
  const setScore = (playerId, val) => {
    const clamped = Math.max(1, val);
    setScores(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(18).fill(null))]};
      next[playerId][holeIdx] = clamped;
      scheduleCloudWrite(next, null, null, null);
      return next;
    });
  };

  const setPutt = (playerId, val) => {
    setPutts(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(18).fill(0))]};
      next[playerId][holeIdx] = val;
      scheduleCloudWrite(null, next, null, null);
      return next;
    });
  };

  const togglePop = (playerId) => {
    setPopFlags(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(18).fill(false))]};
      next[playerId][holeIdx] = !next[playerId][holeIdx];
      scheduleCloudWrite(null, null, next, null);
      return next;
    });
  };

  const handleWolfPick = (partnerId) => {
    setWolfData(prev => {
      const next = {...prev, [holeIdx]:{wolfId:wolfPlayer.id,partnerId,confirmed:true,lone:false}};
      scheduleCloudWrite(null, null, null, next);
      return next;
    });
    setWolfPicker(false);
  };

  const handleLoneWolf  = () => {
    setWolfData(prev => {
      const next = {...prev, [holeIdx]:{wolfId:wolfPlayer.id,partnerId:null,confirmed:true,lone:true}};
      scheduleCloudWrite(null, null, null, next);
      return next;
    });
    setWolfPicker(false);
  };

  const handleResetWolf = () => {
    setWolfData(prev => {
      const next = {...prev};
      delete next[holeIdx];
      scheduleCloudWrite(null, null, null, next);
      return next;
    });
  };

  const prevHole = () => {
    if (holeIdx > 0) {
      const newIdx = holeIdx - 1;
      holeIdxRef.current = newIdx;
      setHoleIdx(newIdx);
      scheduleCloudWrite(null, null, null, null);
    }
  };

  const allScored = players.every(p => (scores[p.id]||[]).filter(Boolean).length === 18);
  const currentHoleScored = players.every(p => scores[p.id]?.[holeIdx]);

  const ptmPuttRequired = hasPTM && !!ptmHoleHolder && !(putts[ptmHoleHolder]?.[holeIdx] > 0);
  const wolfPickRequired = hasWolf && !wolfHoleData.confirmed;
  const canAdvance = currentHoleScored && !ptmPuttRequired && !wolfPickRequired;

  const nextHole = () => {
    if (canAdvance && holeIdx < 17) {
      const newIdx = holeIdx + 1;
      holeIdxRef.current = newIdx;
      setHoleIdx(newIdx);
      scheduleCloudWrite(null, null, null, null);
    }
  };

  const handleFinish = () => { onSaveRound(scores, wolfData, putts, [], {}, popFlags); };

  const parColor = hole.par === 3 ? '#7B9FE0' : hole.par === 5 ? '#D4AF37' : '#A0A0A0';
  const hasAnyTracker = hasWolf || hasPTM || hasNassau || hasStable || hasSkins;

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#121212'}}>

      <SyncPulse syncing={syncing}/>

      {/* Hole header */}
      <div style={{flexShrink:0, background:'#0D0D0D', borderBottom:'1px solid #2A2A2A', padding:'12px 16px 10px'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <button onClick={prevHole} disabled={holeIdx===0}
            style={{width:36, height:36, borderRadius:8, border:'none', background:holeIdx===0?'transparent':'#252525',
              color:holeIdx===0?'#2A2A2A':'#A0A0A0', fontSize:20, cursor:holeIdx===0?'default':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ‹
          </button>

          <div style={{flex:1, textAlign:'center'}}>
            <div style={{display:'flex', alignItems:'baseline', justifyContent:'center', gap:8}}>
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:32, color:'#F5F5F5', lineHeight:1}}>HOLE {hole.num}</span>
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:18, color:parColor}}>PAR {hole.par}</span>
            </div>
            <div style={{display:'flex', justifyContent:'center', gap:16, marginTop:2}}>
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:'#666666'}}>{hole.yds} yds</span>
              <span style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:11, color:'#666666'}}>HCP {hole.hdcp}</span>
            </div>
          </div>

          <button onClick={nextHole} disabled={holeIdx===17 || (currentHoleScored && !canAdvance)}
            style={{width:36, height:36, borderRadius:8, border:'none',
              background: holeIdx===17 ? 'transparent' : '#252525',
              color: holeIdx===17 ? '#2A2A2A' : currentHoleScored && !canAdvance ? '#FF6B6B44' : '#A0A0A0',
              fontSize:20, cursor: holeIdx===17 || (currentHoleScored && !canAdvance) ? 'not-allowed' : 'pointer',
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
              <div key={i} onClick={()=>{ holeIdxRef.current=i; setHoleIdx(i); scheduleCloudWrite(null,null,null,null); }}
                style={{width:i===holeIdx?20:8, height:8, borderRadius:4, cursor:'pointer', transition:'all 0.2s',
                  background:i===holeIdx?'#D4AF37':allIn?'#00A86B':some?'#2A2A2A':'#252525',
                  border:i===holeIdx?'none':`1px solid ${allIn?'#00A86B33':'#2A2A2A'}`}}>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch'}}>
        <div style={{padding:'12px 12px 0', display:'flex', flexDirection:'column', gap:10}}>
          {players.map(p => {
            const isWolf       = hasWolf && wolfPlayer?.id === p.id;
            const isPartner    = hasWolf && wolfHoleData.confirmed && wolfHoleData.partnerId === p.id;
            const isPTM        = hasPTM && ptmHoleHolder === p.id;
            const isNassauPlayer = allNassauPlayerIds.has(p.id);
            const nassauPopActive = isNassauPlayer && nassauMatches.some(match => {
              if (!match.playersInMatch.includes(p.id)) return false;
              return !!(match.popHoles?.[p.id]?.[holeIdx]);
            });
            return (
              <PlayerScoreCard
                key={p.id}
                p={p} score={scores[p.id]?.[holeIdx]||null} hole={hole} holeIdx={holeIdx}
                putts={putts} gettingPop={!!popFlags[p.id]?.[holeIdx]}
                nassauPopActive={nassauPopActive} isNassauPlayer={isNassauPlayer}
                isWolf={isWolf} isPartner={isPartner} isPTMHolder={isPTM}
                hasWolf={hasWolf} wolfData={wolfData} formatStats={playerFormatStats[p.id]||[]}
                onScore={setScore} onPutt={setPutt} onWolfTap={() => setWolfPicker(true)}
                onScoreTap={() => setKeypad(p.id)} onPopToggle={togglePop}
              />
            );
          })}
        </div>

        <div style={{marginTop:12}}>
          <RoundTracker players={players} scores={scores} course={course} holeIdx={holeIdx}/>
        </div>

        {hasAnyTracker && (
          <TrackersDrawer open={trackersOpen} onToggle={() => setTrackersOpen(v => !v)} formats={formats}>
            {hasWolf && <WolfTracker players={players} scores={scores} wolfData={wolfData} course={course} holeIdx={holeIdx} onSetPartner={handleWolfPick} onLoneWolf={handleLoneWolf} onResetWolf={handleResetWolf} format={wolfFmt}/>}
            {hasPTM  && <PTMTracker players={players} scores={scores} putts={putts} course={course} holeIdx={holeIdx} ptmInitialHolder={players[0]?.id} format={ptmFmt}/>}
            {hasNassau && <MultiNassauTracker players={players} scores={scores} nassauMatches={nassauMatches} course={course} holeIdx={holeIdx} nassauFmt={nassauFmtObj}/>}
          </TrackersDrawer>
        )}

        <div style={{padding:'16px 12px 24px'}}>
          {(allScored || holeIdx === 17) && (
            <Btn onClick={() => setShowFinish(true)} variant="gold"
              style={{width:'100%', padding:'16px', fontSize:18, letterSpacing:1}}>
              🏁 FINISH ROUND
            </Btn>
          )}
        </div>
      </div>

      {/* Next hole button */}
      {canAdvance && holeIdx < 17 && (
        <div style={{flexShrink:0, padding:'10px 12px', background:'#0D0D0D', borderTop:'1px solid #2A2A2A'}}>
          <Btn onClick={nextHole} variant="green" style={{width:'100%', padding:'13px', fontSize:16}}>
            NEXT HOLE {holeIdx + 2} →
          </Btn>
        </div>
      )}

      <div style={{flexShrink:0, padding:'6px 12px 10px', background:'#0D0D0D', borderTop:'1px solid #2A2A2A', display:'flex', justifyContent:'center'}}>
        <button onClick={()=>setShowExit(true)}
          style={{background:'none', border:'none', cursor:'pointer', fontFamily:'Inter, system-ui, sans-serif',
            fontWeight:700, fontSize:12, letterSpacing:1, color:'#666666',
            WebkitTapHighlightColor:'transparent', padding:'6px 16px'}}>
          EXIT ROUND
        </button>
      </div>

      {keypad && (
        <ScoreKeypad player={players.find(p=>p.id===keypad)} hole={hole} current={scores[keypad]?.[holeIdx]}
          onConfirm={setScore} onClose={()=>setKeypad(null)}/>
      )}

      {wolfPicker && wolfPlayer && (
        <WolfPicker wolfPlayer={wolfPlayer} players={players} holeIdx={holeIdx}
          onPick={handleWolfPick} onLone={handleLoneWolf} onClose={()=>setWolfPicker(false)}/>
      )}

      <Modal open={showExit} onClose={()=>setShowExit(false)} title="Exit Round?">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:13, color:'#A0A0A0', lineHeight:1.6}}>Your scores are saved locally. You can resume this round from the home screen.</div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>setShowExit(false)} variant="ghost" style={{flex:1}}>KEEP PLAYING</Btn>
            <Btn onClick={onExitRound} variant="danger" style={{flex:1}}>EXIT ROUND</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={showFinish} onClose={()=>setShowFinish(false)} title="Finish Round?">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:13, color:'#A0A0A0', lineHeight:1.6}}>
            {!allScored ? `Some holes haven't been scored yet. You can still finish and view results.` : `All 18 holes complete. Ready to view the final results?`}
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
