// ScoreEntry.jsx — Full Score Entry Screen with real-time cross-device sync

// ── BBB Inline Pill ───────────────────────────────────────────────────────────
const BBBPill = ({ playerId, holeIdx, bbbData, players, onSetBBB }) => {
  const [open, setOpen] = React.useState(false);
  const [pos,  setPos]  = React.useState({ top: 0, left: 0 });
  const btnRef          = React.useRef(null);

  const holeEntry = bbbData?.[holeIdx] || { bingo:null, bango:null, bongo:null };
  const hasB  = holeEntry.bingo === playerId;
  const hasBa = holeEntry.bango === playerId;
  const hasBo = holeEntry.bongo === playerId;
  const bingoOther = holeEntry.bingo && !hasB  ? players.find(p => p.id === holeEntry.bingo)  : null;
  const bangoOther = holeEntry.bango && !hasBa ? players.find(p => p.id === holeEntry.bango)  : null;
  const bongoOther = holeEntry.bongo && !hasBo ? players.find(p => p.id === holeEntry.bongo)  : null;
  const hasAny = hasB || hasBa || hasBo;

  const cats = [
    { cat:'bingo', label:'BINGO', sub:'First on Green',    icon:'①', other:bingoOther, active:hasB  },
    { cat:'bango', label:'BANGO', sub:'Closest to Pin',    icon:'②', other:bangoOther, active:hasBa },
    { cat:'bongo', label:'BONGO', sub:'First to Hole Out', icon:'③', other:bongoOther, active:hasBo },
  ];

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 244)) });
    }
    setOpen(true);
  };

  return (
    <div style={{position:'relative', display:'inline-block'}}>
      <button ref={btnRef} onClick={handleOpen}
        style={{
          display:'flex', alignItems:'center', gap:4,
          background: hasAny ? 'rgba(200,161,90,0.12)' : '#F6F4EE',
          border: hasAny ? '1px solid rgba(200,161,90,0.4)' : '1px solid #E7E3D9',
          borderRadius:999, padding:'3px 10px 3px 8px', minHeight:28,
          cursor:'pointer', WebkitTapHighlightColor:'transparent',
        }}>
        <span style={{fontSize:11, lineHeight:1}}>🎯</span>
        {hasB  && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:13, color:'#C8A15A', lineHeight:1}}>①</span>}
        {hasBa && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:13, color:'#C8A15A', lineHeight:1}}>②</span>}
        {hasBo && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:13, color:'#C8A15A', lineHeight:1}}>③</span>}
        {!hasAny && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, color:'#8A9E8A', letterSpacing:0.5, lineHeight:1}}>BBB</span>}
        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, color:'#8A9E8A', marginLeft:1}}>▾</span>
      </button>

      {open && (
        <>
          <div style={{position:'fixed', inset:0, zIndex:300}} onClick={() => setOpen(false)}/>
          <div style={{
            position:'fixed', top:pos.top, left:pos.left, zIndex:301,
            background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16,
            padding:8, boxShadow:'0 8px 32px rgba(14,43,32,0.15)', width:236,
          }}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800,
              fontSize:10, color:'#8A9E8A', letterSpacing:1.5, padding:'4px 8px 8px'}}>
              HOLE {holeIdx+1} — AWARD POINTS
            </div>
            {cats.map(({ cat, label, sub, icon, other, active }) => (
              <button key={cat}
                onClick={() => {
                  if (!other) { onSetBBB(holeIdx, cat, active ? null : playerId); setOpen(false); }
                }}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:10,
                  padding:'10px 12px', borderRadius:12, border:'none', marginBottom:4,
                  background: active ? 'rgba(200,161,90,0.1)' : other ? 'rgba(107,114,128,0.04)' : '#F6F4EE',
                  cursor: other ? 'default' : 'pointer',
                  WebkitTapHighlightColor:'transparent', textAlign:'left',
                }}>
                <span style={{fontSize:20, lineHeight:1, opacity:other ? 0.35 : 1}}>{icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13,
                    color: active ? '#C8A15A' : other ? '#AFAFAF' : '#0E2B20'}}>
                    {label}{active ? ' ✓' : ''}
                  </div>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11,
                    color: other ? '#AFAFAF' : '#3F5F4A'}}>
                    {other ? `${other.name.split(' ')[0]} has this` : sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PlayerScoreCard = ({ p, score, hole, holeIdx, putts, gettingPop, nassauPopActive, isNassauPlayer, markeyPopCount, isWolf, isPartner, isPTMHolder, hasWolf, wolfData, formatStats, onScore, onPutt, onWolfTap, onScoreTap, onPopToggle, hasBBB, bbbData, players, onSetBBB, stats, firData, girData, onFIR, onGIR, extraStats, onExtraStat, sz = 1, narrow = false, showPopToggle = true }) => {
  const diff     = score ? score - hole.par : null;
  const relColor = diff===null?'#E7E3D9':diff<=-2?'#C8A15A':diff===-1?'#15803D':diff===0?'#3F5F4A':diff===1?'#DC2626':'#991B1B';
  const relLabel = diff===null?'—':diff<=-3?'ALB':diff===-2?'EGL':diff===-1?'BRD':diff===0?'PAR':diff===1?'BOG':diff===2?'DBL':`+${diff}`;
  const puttVal  = putts[p.id]?.[holeIdx] || 0;

  // One-screen scaling: every dimension multiplies the base (sz=1) size, with a
  // readability/touch floor so dense layouts stay usable.
  const s = (v, min = 0) => Math.max(min, Math.round(v * sz));
  const F = 'Plus Jakarta Sans, Inter, system-ui, sans-serif';
  const statBtn = s(36, narrow ? 26 : 30);

  const cardBorder = isWolf ? '1.5px solid rgba(220,38,38,0.35)' : isPartner ? `1.5px solid ${p.color}55` : '1px solid #E7E3D9';
  const cardBg     = isWolf ? 'rgba(220,38,38,0.03)' : '#FFFFFF';

  // Which per-hole stats this round records (FIR hidden on par 3s).
  const showPutts = !!stats.putts;
  const showFIR   = !!stats.fir && hole.par !== 3;
  const showGIR   = !!stats.gir;
  const puttRequired = isPTMHolder && puttVal === 0;
  const anyStatRow = showPutts || showFIR || showGIR || stats.pen || stats.ud;

  const ex  = (extraStats && extraStats[p.id] && extraStats[p.id][holeIdx]) || {};
  const pen = ex.pen || 0;

  // Compact ✓/✗ toggle shared by FIR and GIR on the single stat row.
  const HitMiss = (label, data, onSet) => {
    const cur = data?.[p.id]?.[holeIdx];
    return (
      <div style={{display:'flex', alignItems:'center', gap:s(6,4)}}>
        <Label style={{flexShrink:0, fontSize:s(10,9)}}>{label}</Label>
        <div style={{display:'flex', gap:s(5,3)}}>
          {[true, false].map(val => {
            const selected = cur === val;
            return (
              <button key={String(val)} onClick={() => onSet(p.id, selected ? null : val)}
                aria-label={`${p.name} ${label} ${val ? 'hit' : 'miss'}`} aria-pressed={selected}
                style={{
                  width:statBtn + 2, height:statBtn, borderRadius:s(9,7),
                  border: selected ? 'none' : '1px solid #E7E3D9',
                  background: selected ? (val ? '#15803D' : '#DC2626') : '#F0EDE4',
                  color: selected ? '#FFFFFF' : '#3F5F4A',
                  fontFamily:F, fontWeight:800, fontSize:s(16,13),
                  cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                {val ? '✓' : '✗'}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const triBtn = (field, val, lbl, color) => {
    const on = ex[field] === val;
    return (
      <button key={field + String(val)}
        onClick={() => onExtraStat(p.id, field, on ? null : val)}
        aria-label={`${field} ${val ? 'yes' : 'no'}`} aria-pressed={on}
        style={{
          width:statBtn - 2, height:statBtn - 2, borderRadius:s(8,6),
          border: on ? 'none' : '1px solid #E7E3D9',
          background: on ? color : '#F0EDE4',
          color: on ? '#FFFFFF' : '#3F5F4A',
          fontFamily:F, fontWeight:800, fontSize:s(13,11),
          cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
        {lbl}
      </button>
    );
  };

  const goldPill = (icon, text) => (
    <div style={{
      borderRadius:999, padding:`${s(4,3)}px ${s(10,7)}px`,
      border:'1px solid rgba(200,161,90,0.45)', background:'rgba(200,161,90,0.12)', color:'#C8A15A',
      fontFamily:F, fontWeight:800, fontSize:s(11,10), letterSpacing:0.5,
      display:'flex', alignItems:'center', gap:4,
    }}>
      <span>{icon}</span> {text}
    </div>
  );

  // Pop indicator — auto for Nassau/Markey; manual toggle only when a game
  // format that consumes pops is active (pure stat rounds hide it).
  const popNode = isNassauPlayer
    ? (nassauPopActive ? goldPill('💰', 'POP ON') : null)
    : markeyPopCount !== undefined
    ? (markeyPopCount > 0 ? goldPill('⚔️', markeyPopCount > 1 ? `${markeyPopCount} POPS` : 'POP ON') : null)
    : showPopToggle
    ? (
      <button
        onClick={()=>onPopToggle(p.id)}
        aria-pressed={gettingPop} aria-label={`Pop stroke for ${p.name}`}
        style={{
          borderRadius:999, padding:`${s(4,3)}px ${s(10,7)}px`, minHeight:s(28,24),
          border:gettingPop ? '1px solid rgba(200,161,90,0.45)' : '1px solid #E7E3D9',
          background:gettingPop ? 'rgba(200,161,90,0.12)' : '#F6F4EE',
          color:gettingPop ? '#C8A15A' : '#3F5F4A',
          fontFamily:F, fontWeight:800, fontSize:s(11,10), letterSpacing:0.5,
          cursor:'pointer', WebkitTapHighlightColor:'transparent'
        }}>
        {gettingPop ? 'POP ON' : 'POP'}
      </button>
    )
    : null;

  const hasMeta = (formatStats && formatStats.length > 0) || hasBBB || !!popNode;
  const padX = s(12, 8);

  return (
    <div style={{background:cardBg, border:cardBorder, borderRadius:s(18,12), overflow:'hidden',
      display:'flex', flexDirection:'column', minHeight:0, minWidth:0, justifyContent:'center'}}>

      {/* Player header — name + HCP on one line */}
      <div style={{display:'flex', alignItems:'center', padding:`${s(8,5)}px ${padX}px 0`, gap:s(10,6), flexShrink:0}}>
        <Avatar player={p} size={s(30,22)}/>
        <div style={{flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:6, overflow:'hidden'}}>
          <span style={{fontFamily:F, fontWeight:800, fontSize:narrow?s(16,13):s(19,14), color:'#0E2B20', letterSpacing:0.2, lineHeight:1.1,
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{narrow ? p.name.split(' ')[0] : p.name}</span>
          {!(narrow && hasWolf && isWolf) && (
            <span style={{fontFamily:F, fontSize:s(11,9), color:'#8A9E8A', flexShrink:0}}>HCP {p.handicap}</span>
          )}
        </div>
        {isWolf && !hasWolf && <span style={{fontSize:s(18,14)}}>🐺</span>}
        {isPartner && !isWolf && <span style={{fontSize:s(16,13), opacity:0.8}}>⚑</span>}
        {hasWolf && isWolf && (
          <button onClick={onWolfTap} style={{
            background: !wolfData?.[holeIdx]?.confirmed ? '#DC2626' : 'rgba(14,43,32,0.08)',
            border: !wolfData?.[holeIdx]?.confirmed ? 'none' : '1px solid rgba(14,43,32,0.25)',
            color: !wolfData?.[holeIdx]?.confirmed ? '#FFFFFF' : '#0E2B20',
            borderRadius:20, padding:`${s(5,4)}px ${s(12,8)}px ${s(5,4)}px ${s(8,6)}px`, cursor:'pointer',
            fontFamily:F, fontWeight:800, fontSize:s(12,11), letterSpacing:0.5,
            display:'flex', alignItems:'center', gap:5,
            WebkitTapHighlightColor:'transparent', flexShrink:0,
          }}>
            <span style={{fontSize:s(14,12)}}>🐺</span>
            {!wolfData?.[holeIdx]?.confirmed ? 'PICK →' : wolfData[holeIdx]?.lone ? 'LONE 🐺' : '✓ SET'}
          </button>
        )}
      </div>

      {/* Wolf pick required warning */}
      {isWolf && hasWolf && !wolfData?.[holeIdx]?.confirmed && (
        <div style={{display:'flex', alignItems:'center', gap:6, padding:`${s(4,3)}px ${padX}px 0`, flexShrink:0}}>
          <span style={{fontSize:s(11,10)}}>⚠️</span>
          <span style={{fontFamily:F, fontWeight:700, fontSize:s(11,10), color:'#DC2626', letterSpacing:0.5}}>{narrow ? 'PICK PARTNER OR LONE WOLF' : 'PICK PARTNER OR GO LONE WOLF TO ADVANCE'}</span>
        </div>
      )}

      {/* PTM putt required warning */}
      {puttRequired && (
        <div style={{display:'flex', alignItems:'center', gap:6, padding:`${s(4,3)}px ${padX}px 0`, flexShrink:0}}>
          <span style={{fontSize:s(11,10)}}>⚠️</span>
          <span style={{fontFamily:F, fontWeight:700, fontSize:s(11,10), color:'#C8A15A', letterSpacing:0.5}}>ENTER PUTTS TO ADVANCE</span>
        </div>
      )}

      {/* Meta row — format pills · BBB · pop, one wrapping line */}
      {hasMeta && (
        <div style={{display:'flex', gap:s(6,4), padding:`${s(6,4)}px ${padX}px 0`, flexWrap:'wrap', alignItems:'center', flexShrink:0}}>
          {formatStats && formatStats.map((st,i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:4,
              background:'#F6F4EE', border:'1px solid #E7E3D9',
              borderRadius:20, padding:`${s(3,2)}px ${s(10,7)}px ${s(3,2)}px ${s(8,6)}px`,
            }}>
              {st.icon && <span style={{fontSize:s(11,10), lineHeight:1}}>{st.icon}</span>}
              <span style={{fontFamily:F, fontWeight:800, fontSize:s(13,11), color:st.color, lineHeight:1}}>{st.value}</span>
              <span style={{fontFamily:F, fontSize:s(9,8), color:'#8A9E8A', letterSpacing:0.3, marginLeft:2}}>{st.label}</span>
            </div>
          ))}
          {hasBBB && <BBBPill playerId={p.id} holeIdx={holeIdx} bbbData={bbbData} players={players} onSetBBB={onSetBBB}/>}
          {popNode && <div style={{marginLeft:'auto'}}>{popNode}</div>}
        </div>
      )}

      {/* Score stepper — flexes to absorb spare height, so 2-player layouts get
          a big, premium score area while 4-player grids stay compact. */}
      <div style={{display:'flex', alignItems:'stretch', padding:`${s(8,5)}px ${padX}px`, gap:s(8,6), flex:'1 1 auto', minHeight:s(64, narrow ? 44 : 52)}}>
        <button
          onClick={()=>onScore(p.id, (score||hole.par)-1)}
          disabled={score !== null && score <= 1}
          aria-label={`Subtract stroke for ${p.name}`}
          style={{width:s(52, narrow ? 36 : 42), alignSelf:'stretch', borderRadius:s(12,10), border:'none', background:'#EAE7DE',
            color:'#0E2B20', fontSize:s(28,22), fontFamily:F, fontWeight:900,
            cursor:'pointer', flexShrink:0, opacity:(score === null || score > 1)?1:0.3,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          −
        </button>

        <div
          onClick={onScoreTap}
          role="button" tabIndex={0}
          aria-label={`Enter score for ${p.name}${score ? `, currently ${score}` : ''}`}
          onKeyDown={e=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); onScoreTap(); } }}
          style={{flex:1, cursor:'pointer', borderRadius:s(12,10),
            background:'#F6F4EE', border:'1px solid #E7E3D9',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent', userSelect:'none', gap:2, minWidth:0, overflow:'hidden'}}>
          <div key={score ?? 'none'} style={{fontFamily:F, fontWeight:900, lineHeight:1,
            fontSize:s(56, narrow ? 30 : 36), color:score?relColor:'#C8D5C0', transition:'color 0.15s',
            animation: score ? 'ppScorePop 0.22s ease-out' : 'none'}}>
            {score||'—'}
          </div>
          {score
            ? <div style={{fontFamily:F, fontSize:s(11,9), fontWeight:700, letterSpacing:1, color:relColor, whiteSpace:'nowrap'}}>{relLabel}</div>
            : !narrow && <div style={{fontFamily:F, fontSize:s(10,8), color:'#8A9E8A', letterSpacing:0.5, whiteSpace:'nowrap'}}>TAP TO ENTER</div>
          }
        </div>

        <button
          onClick={()=>onScore(p.id, (score||hole.par)+1)}
          aria-label={`Add stroke for ${p.name}`}
          style={{width:s(52, narrow ? 36 : 42), alignSelf:'stretch', borderRadius:s(12,10), border:'none',
            background:'#C8A15A', boxShadow:'0 2px 10px rgba(200,161,90,0.3)',
            color:'#0E2B20', fontSize:s(28,22), fontFamily:F, fontWeight:900,
            cursor:'pointer', flexShrink:0,
            WebkitTapHighlightColor:'transparent', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          +
        </button>
      </div>

      {/* Stat row — putts · FIR · GIR · PEN · SAND · U&D on one wrapping line */}
      {anyStatRow && (
        <div style={{display:'flex', alignItems:'center', flexWrap:'wrap', columnGap:s(14, narrow ? 8 : 10), rowGap:s(6,4),
          padding:`${s(6,4)}px ${padX}px ${s(9,6)}px`, flexShrink:0,
          borderTop: puttRequired ? '1px solid rgba(200,161,90,0.4)' : '1px solid #E7E3D9',
          background: puttRequired ? 'rgba(200,161,90,0.04)' : 'transparent'}}>
          {showPutts && (
            <div style={{display:'flex', alignItems:'center', gap:s(8,5)}}>
              <div style={{display:'flex', flexDirection:'column', gap:1, flexShrink:0}}>
                <Label style={{flexShrink:0, fontSize:s(10,9)}}>PUTTS</Label>
                {puttRequired && (
                  <span style={{fontFamily:F, fontWeight:700, fontSize:s(9,8), color:'#C8A15A', letterSpacing:0.5}}>💰 REQ</span>
                )}
              </div>
              <div style={{display:'flex', gap:s(5,3)}}>
                {[1,2,3,4].map(n=>(
                  <button key={n}
                    onClick={()=>onPutt(p.id, puttVal===n ? 0 : n)}
                    aria-label={`${p.name}: ${n} putt${n>1?'s':''}`} aria-pressed={puttVal===n}
                    style={{width:statBtn, height:statBtn, borderRadius:s(9,7),
                      border: puttVal===n ? 'none' : '1px solid #E7E3D9',
                      background: puttVal===n ? p.color : '#F0EDE4',
                      color: puttVal===n ? '#0E2B20' : '#3F5F4A',
                      fontFamily:F, fontWeight:800, fontSize:s(16,13),
                      cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none',
                      display:'flex', alignItems:'center', justifyContent:'center'}}>
                    {n}
                  </button>
                ))}
              </div>
              {puttVal >= 3 && <span style={{fontFamily:F, fontWeight:700, fontSize:s(11,9), color:'#DC2626', letterSpacing:0.5}}>3-PUTT</span>}
            </div>
          )}
          {showFIR && HitMiss('FIR', firData, onFIR)}
          {showGIR && HitMiss('GIR', girData, onGIR)}
          {stats.pen && (
            <div style={{display:'flex', alignItems:'center', gap:s(6,4)}}>
              <Label style={{flexShrink:0, fontSize:s(10,9)}}>PEN</Label>
              <button onClick={() => onExtraStat(p.id, 'pen', Math.max(0, pen - 1))} disabled={pen === 0} aria-label="One fewer penalty"
                style={{width:statBtn - 4, height:statBtn - 2, borderRadius:s(8,6), border:'1px solid #E7E3D9', background:'#F0EDE4', color:'#3F5F4A', fontWeight:900, fontSize:s(16,13), cursor:'pointer', opacity:pen===0?0.35:1, WebkitTapHighlightColor:'transparent'}}>−</button>
              <span style={{fontFamily:F, fontWeight:800, fontSize:s(15,12), color:pen>0?'#DC2626':'#8A9E8A', minWidth:14, textAlign:'center'}}>{pen}</span>
              <button onClick={() => onExtraStat(p.id, 'pen', pen + 1)} aria-label="One more penalty"
                style={{width:statBtn - 4, height:statBtn - 2, borderRadius:s(8,6), border:'1px solid #E7E3D9', background:'#F0EDE4', color:'#3F5F4A', fontWeight:900, fontSize:s(16,13), cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>+</button>
            </div>
          )}
          {stats.ud && (
            <div style={{display:'flex', alignItems:'center', gap:s(6,4)}}>
              <Label style={{flexShrink:0, fontSize:s(10,9)}}>U&D</Label>
              {triBtn('ud', true, '✓', '#15803D')}
              {triBtn('ud', false, '✗', '#DC2626')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Score Name Grid Modal ─────────────────────────────────────────────────────
const ScoreKeypad = ({ player, hole, current, onConfirm, onClose }) => {
  const scoreName = (strokes, par) => {
    const d = strokes - par;
    if (strokes === 1)  return { label:'ACE',    color:'#C8A15A' };
    if (d <= -3)        return { label:'ALB',    color:'#C8A15A' };
    if (d === -2)       return { label:'EAGLE',  color:'#C8A15A' };
    if (d === -1)       return { label:'BIRDIE', color:'#15803D' };
    if (d === 0)        return { label:'PAR',    color:'#3F5F4A' };
    if (d === 1)        return { label:'BOGEY',  color:'#DC2626' };
    if (d === 2)        return { label:'DOUBLE', color:'#991B1B' };
    if (d === 3)        return { label:'TRIPLE', color:'#7F1D1D' };
    return               { label:`+${d}`,       color:'#7F1D1D' };
  };

  const tiles = Array.from({length:9}, (_,i) => i+1);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(14,43,32,0.8)',zIndex:2000,
      display:'flex',alignItems:'center',justifyContent:'center', padding:'20px'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#FFFFFF',borderRadius:20,padding:'20px',width:'100%',maxWidth:380, border:'1px solid #E7E3D9'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:15,color:'#0E2B20',letterSpacing:0.3}}>
            {player.name.toUpperCase()} — HOLE {hole.num} (PAR {hole.par})
          </div>
          <button onClick={onClose}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid #E7E3D9',borderRadius:8,color:'#3F5F4A',fontSize:18,cursor:'pointer',
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
                  background: isCurrent ? `${s.color}18` : '#F6F4EE',
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:2,
                  WebkitTapHighlightColor:'transparent', userSelect:'none',
                }}>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:900,fontSize:28,color:s.color,lineHeight:1}}>{n}</span>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:10,color:s.color,letterSpacing:0.5}}>{s.label}</span>
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
  <div style={{position:'fixed',inset:0,background:'rgba(14,43,32,0.8)',zIndex:2000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'#FFFFFF',borderRadius:'20px 20px 0 0',padding:'20px 20px calc(24px + env(safe-area-inset-bottom, 0px))',width:'100%',maxWidth:420, border:'1px solid #E7E3D9', borderBottom:'none', animation:'ppSheetUp 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)'}}>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:20,color:'#DC2626',marginBottom:4}}>
        🐺 {wolfPlayer.name.toUpperCase()} IS WOLF
      </div>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontSize:13,color:'#3F5F4A',marginBottom:16}}>Pick a partner or go lone wolf for hole {holeIdx+1}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
        {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
          <button key={p.id} onClick={()=>onPick(p.id)}
            style={{width:'100%',padding:'14px 16px',borderRadius:14,border:`1px solid ${p.color}44`,
              background:`${p.color}0A`,color:p.color,fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
              fontWeight:700,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',gap:12,
              WebkitTapHighlightColor:'transparent'}}>
            <Avatar player={p} size={32}/>
            {p.name.toUpperCase()}
          </button>
        ))}
        <button onClick={onLone}
          style={{width:'100%',padding:'14px 16px',borderRadius:14,
            border:'1px solid rgba(220,38,38,0.35)',background:'rgba(220,38,38,0.06)',
            color:'#DC2626',fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:16,
            cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          🐺 GO LONE WOLF
        </button>
      </div>
      <button onClick={onClose} style={{width:'100%',height:48,borderRadius:12,border:'1px solid #E7E3D9',background:'transparent',color:'#3F5F4A',fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:14,cursor:'pointer',letterSpacing:0.5}}>CANCEL</button>
    </div>
  </div>
);

// ── Game Trackers Bottom Sheet ───────────────────────────────────────────────
// Overlays the one-screen score grid instead of expanding inline, so the score
// entry surface itself never scrolls. Scrolling inside the sheet is fine.
const TrackersSheet = ({ open, onClose, formats, children }) => {
  const formatIcons = { wolf:'🐺', nassau:'💰', stableford:'⭐', passmoney:'💸', skins:'🎯', bingobangobongo:'🎯', teeball:'🏌️', markeymatch:'⚔️' };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:'fixed', inset:0, background:'rgba(14,43,32,0.55)', zIndex:1500,
        display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'ppFadeIn 0.15s ease-out'}}>
      <div role="dialog" aria-modal="true" aria-label="Game trackers"
        style={{background:'#F6F4EE', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:520,
          maxHeight:'78vh', display:'flex', flexDirection:'column', overflow:'hidden',
          animation:'ppSheetUp 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
          boxShadow:'0 -12px 40px rgba(14,43,32,0.25)'}}>
        <div style={{flexShrink:0, padding:'10px 16px 8px', background:'#FFFFFF', borderBottom:'1px solid #E7E3D9'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'#D4CFC4', margin:'0 auto 8px'}}/>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13,
                letterSpacing:1.5, color:'#0E2B20'}}>
                GAME TRACKERS
              </span>
              <div style={{display:'flex', gap:4}}>
                {formats.map(f => (
                  <span key={f.type} style={{fontSize:13}}>{formatIcons[f.type] || '🎯'}</span>
                ))}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close game trackers"
              style={{background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:8, color:'#3F5F4A',
                fontSize:16, cursor:'pointer', width:32, height:32,
                display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent'}}>✕</button>
          </div>
        </div>
        <div style={{overflowY:'auto', WebkitOverflowScrolling:'touch',
          paddingBottom:'env(safe-area-inset-bottom, 0px)'}}>
          {children}
        </div>
      </div>
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
      position:'fixed', top:'calc(64px + env(safe-area-inset-top, 0px))', right:12, zIndex:500,
      display:'flex', alignItems:'center', gap:6,
      background:'rgba(14,43,32,0.1)', border:'1px solid rgba(14,43,32,0.3)',
      borderRadius:20, padding:'4px 10px',
      fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1, color:'#0E2B20',
    }}>
      <div style={{width:6, height:6, borderRadius:'50%', background:'#C8A15A', animation:'ppSyncPulse 0.8s ease-in-out infinite'}}/>
      SYNCING
      <style>{`@keyframes ppSyncPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
};

// ── Main ScoreEntry Screen ────────────────────────────────────────────────────
const ScoreEntry = ({ round, onSaveRound, onExitRound, deviceId }) => {
  const { getWolfForHole, computePTMState, calcWolfStandings, calcStablefordPoints, calcSkins, getAdjustedHoleScore } = window;

  const { players, course, formats, syncCode } = round;
  const games = round.games || [];

  // 9- or 18-hole layouts: every hole loop and array below sizes off the course.
  const holeCount = course.holes.length;
  const lastSeq = holeCount - 1;

  // Play order: which actual hole index is played in what position. Starting on the
  // 10th tee plays holes 10→18 then 1→9. Data arrays stay indexed by actual hole idx.
  const startingTee = round.startingTee === 10 && holeCount === 18 ? 10 : 1;
  const playOrder = React.useMemo(() => (
    startingTee === 10
      ? [9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8]
      : Array.from({ length: holeCount }, (_, i) => i)
  ), [startingTee, holeCount]);

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
  const _initScores  = () => { try { const s = localStorage.getItem('pp_scores_'+round.id); return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } };
  const _initPutts   = () => { try { const s = localStorage.getItem('pp_putts_'+round.id);  return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(0)]));    } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(0)]));    } };
  const _initPop     = () => { try { const s = localStorage.getItem('pp_pop_'+round.id);    return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(false)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(false)])); } };
  const _initWolf    = () => { try { const s = localStorage.getItem('pp_wolf_'+round.id);   return s ? JSON.parse(s) : {}; } catch(e) { return {}; } };
  const _initBBB     = () => { try { const s = localStorage.getItem('pp_bbb_'+round.id);    return s ? JSON.parse(s) : {}; } catch(e) { return {}; } };
  const _initTeeBall = () => { try { const s = localStorage.getItem('pp_teeball_'+round.id);return s ? JSON.parse(s) : {}; } catch(e) { return {}; } };
  const _initFIR     = () => { try { const s = localStorage.getItem('pp_fir_'+round.id);     return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } };
  const _initGIR     = () => { try { const s = localStorage.getItem('pp_gir_'+round.id);     return s ? JSON.parse(s) : Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } catch(e) { return Object.fromEntries(players.map(p=>[p.id,Array(holeCount).fill(null)])); } };
  const _initExtra   = () => { try { const s = localStorage.getItem('pp_extra_'+round.id);   return s ? JSON.parse(s) : {}; } catch(e) { return {}; } };

  const [scores,      setScores]      = React.useState(_initScores);
  const [putts,       setPutts]       = React.useState(_initPutts);
  const [popFlags,    setPopFlags]    = React.useState(_initPop);
  const [wolfData,    setWolfData]    = React.useState(_initWolf);
  const [bbbData,     setBBBData]     = React.useState(_initBBB);
  const [teeBallData, setTeeBallData] = React.useState(_initTeeBall);
  const [firData,     setFIRData]     = React.useState(_initFIR);
  const [girData,     setGIRData]     = React.useState(_initGIR);
  const [extraStats,  setExtraStats]  = React.useState(_initExtra);  // {pid:{holeIdx:{pen,sand,ud,drv,lp}}}

  const [holeIdx,  setHoleIdx]  = React.useState(() => playOrder[0]);
  const [keypad,   setKeypad]   = React.useState(null);
  const [wolfPicker, setWolfPicker] = React.useState(false);
  const [showFinish, setShowFinish] = React.useState(false);
  const [showExit,   setShowExit]   = React.useState(false);
  const [trackersOpen, setTrackersOpen] = React.useState(false);
  const [showScorecard, setShowScorecard] = React.useState(false);
  const [syncing,  setSyncing]  = React.useState(false);

  // Ref to hold pending write timer for debouncing
  const syncTimerRef  = React.useRef(null);
  // Track whether we're currently processing a remote update (to avoid echo)
  const applyingRemoteRef = React.useRef(false);

  const hasWolf    = formats.some(f => f.type === 'wolf');
  const hasPTM     = formats.some(f => f.type === 'passmoney');
  const hasNassau  = nassauMatches.length > 0;
  const hasStable  = formats.some(f => f.type === 'stableford');
  const hasSkins   = formats.some(f => f.type === 'skins');
  const hasBBB     = formats.some(f => f.type === 'bingobangobongo');
  const hasTeeBall = formats.some(f => f.type === 'teeball');
  const hasMarkey  = formats.some(f => f.type === 'markeymatch');
  const markeyFmt  = formats.find(f => f.type === 'markeymatch');
  const wolfFmt    = formats.find(f => f.type === 'wolf');
  const ptmFmt    = formats.find(f => f.type === 'passmoney');
  const skinsFmt  = formats.find(f => f.type === 'skins');
  const bbbFmt    = formats.find(f => f.type === 'bingobangobongo');
  const teeBallFmt= formats.find(f => f.type === 'teeball');

  // Which per-hole stats this round records. Putts stay on whenever Pass-the-Money
  // is in play (the holder is derived from putts), regardless of the saved config.
  const statsCfg = React.useMemo(() => window.StatsService.resolveRoundStatsConfig(round), [round]);
  const cardStats = React.useMemo(() => ({
    putts: statsCfg.putts || hasPTM,
    fir:   statsCfg.fir,
    gir:   statsCfg.gir,
    pen:   statsCfg.pen,
    ud:    statsCfg.ud,
  }), [statsCfg, hasPTM]);

  const hole       = course.holes[holeIdx];
  const wolfPlayer = hasWolf ? getWolfForHole(players, holeIdx) : null;
  const wolfHoleData = wolfData[holeIdx] || { wolfId: wolfPlayer?.id, partnerId: null, confirmed: false, lone: false };

  // ── Live refs for sync reads (avoid stale closures) ───────────────────────
  const scoresRef    = React.useRef(scores);
  const puttsRef     = React.useRef(putts);
  const popRef       = React.useRef(popFlags);
  const wolfRef      = React.useRef(wolfData);
  const bbbRef       = React.useRef(bbbData);
  const teeBallRef   = React.useRef(teeBallData);
  const firRef       = React.useRef(firData);
  const girRef       = React.useRef(girData);
  const extraRef     = React.useRef(extraStats);
  const holeIdxRef   = React.useRef(holeIdx);

  React.useEffect(() => { scoresRef.current   = scores;      }, [scores]);
  React.useEffect(() => { puttsRef.current    = putts;       }, [putts]);
  React.useEffect(() => { popRef.current      = popFlags;    }, [popFlags]);
  React.useEffect(() => { wolfRef.current     = wolfData;    }, [wolfData]);
  React.useEffect(() => { bbbRef.current      = bbbData;     }, [bbbData]);
  React.useEffect(() => { teeBallRef.current  = teeBallData; }, [teeBallData]);
  React.useEffect(() => { firRef.current      = firData;     }, [firData]);
  React.useEffect(() => { girRef.current      = girData;     }, [girData]);
  React.useEffect(() => { extraRef.current    = extraStats;  }, [extraStats]);
  React.useEffect(() => { holeIdxRef.current  = holeIdx;     }, [holeIdx]);

  // ── Persist to localStorage ───────────────────────────────────────────────
  React.useEffect(() => { localStorage.setItem('pp_scores_'+round.id,   JSON.stringify(scores));      }, [scores]);
  React.useEffect(() => { localStorage.setItem('pp_putts_'+round.id,    JSON.stringify(putts));       }, [putts]);
  React.useEffect(() => { localStorage.setItem('pp_pop_'+round.id,      JSON.stringify(popFlags));    }, [popFlags]);
  React.useEffect(() => { localStorage.setItem('pp_wolf_'+round.id,     JSON.stringify(wolfData));    }, [wolfData]);
  React.useEffect(() => { localStorage.setItem('pp_bbb_'+round.id,      JSON.stringify(bbbData));     }, [bbbData]);
  React.useEffect(() => { localStorage.setItem('pp_teeball_'+round.id,  JSON.stringify(teeBallData)); }, [teeBallData]);
  React.useEffect(() => { localStorage.setItem('pp_fir_'+round.id,      JSON.stringify(firData));     }, [firData]);
  React.useEffect(() => { localStorage.setItem('pp_gir_'+round.id,      JSON.stringify(girData));     }, [girData]);
  React.useEffect(() => { localStorage.setItem('pp_extra_'+round.id,    JSON.stringify(extraStats));  }, [extraStats]);

  // ── Write to Firestore (debounced 400ms) ──────────────────────────────────
  const scheduleCloudWrite = React.useCallback((nextScores, nextPutts, nextPop, nextWolf, nextBBB, nextTeeBall, nextFIR, nextGIR, nextExtra) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!window.RoundSyncService || !syncCode) return;
      const payload = {
        scores:         nextScores   || scoresRef.current,
        putts:          nextPutts    || puttsRef.current,
        popFlags:       nextPop      || popRef.current,
        wolfData:       nextWolf     || wolfRef.current,
        bbbData:        nextBBB      || bbbRef.current,
        teeBallData:    nextTeeBall  || teeBallRef.current,
        firData:        nextFIR      || firRef.current,
        girData:        nextGIR      || girRef.current,
        extraStats:     nextExtra    || extraRef.current,
        currentHoleIdx: holeIdxRef.current,
        roundId: round.id,
        _writtenBy: deviceId,
        _ts: Date.now(),
      };
      setSyncing(true);
      window.RoundSyncService.writeLiveScores(syncCode, payload, function() {
        setSyncing(false);
      });
    }, 400);
  }, [syncCode, deviceId, round.id]);

  // ── Subscribe to remote updates ───────────────────────────────────────────
  React.useEffect(() => {
    if (!window.RoundSyncService || !syncCode) return;
    let cancelled = false;

    window.RoundSyncService.subscribeRound(syncCode, deviceId, function(livePayload) {
      if (!livePayload) return;
      // A snapshot can arrive after cleanup (rapid exit/rejoin) — drop it.
      if (cancelled) return;
      // Payloads tagged with a different round id belong to a stale listener
      // or a reused sync code; v1.1.0 clients send no roundId, so only
      // reject on a present-and-mismatched tag.
      if (livePayload.roundId && livePayload.roundId !== round.id) return;
      // Remote update: merge into local state
      applyingRemoteRef.current = true;
      if (livePayload.scores)      { setScores(livePayload.scores);           localStorage.setItem('pp_scores_'+round.id,   JSON.stringify(livePayload.scores)); }
      if (livePayload.putts)       { setPutts(livePayload.putts);             localStorage.setItem('pp_putts_'+round.id,    JSON.stringify(livePayload.putts)); }
      if (livePayload.popFlags)    { setPopFlags(livePayload.popFlags);       localStorage.setItem('pp_pop_'+round.id,      JSON.stringify(livePayload.popFlags)); }
      if (livePayload.wolfData)    { setWolfData(livePayload.wolfData);       localStorage.setItem('pp_wolf_'+round.id,     JSON.stringify(livePayload.wolfData)); }
      if (livePayload.bbbData)     { setBBBData(livePayload.bbbData);         localStorage.setItem('pp_bbb_'+round.id,      JSON.stringify(livePayload.bbbData)); }
      if (livePayload.teeBallData) { setTeeBallData(livePayload.teeBallData); localStorage.setItem('pp_teeball_'+round.id, JSON.stringify(livePayload.teeBallData)); }
      if (livePayload.firData)     { setFIRData(livePayload.firData);         localStorage.setItem('pp_fir_'+round.id,     JSON.stringify(livePayload.firData)); }
      if (livePayload.girData)     { setGIRData(livePayload.girData);         localStorage.setItem('pp_gir_'+round.id,     JSON.stringify(livePayload.girData)); }
      if (livePayload.extraStats)  { setExtraStats(livePayload.extraStats);   localStorage.setItem('pp_extra_'+round.id,   JSON.stringify(livePayload.extraStats)); }
      if (livePayload.currentHoleIdx !== undefined) { holeIdxRef.current = livePayload.currentHoleIdx; setHoleIdx(livePayload.currentHoleIdx); }
      // Small delay before clearing flag to let React batch the state updates
      setTimeout(() => { applyingRemoteRef.current = false; }, 50);
    });

    return () => {
      cancelled = true;
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
    const MATCH_COLORS_LOCAL = ['#C8A15A', '#7B9FE0', '#E07BE0'];
    return nassauMatches.map((match, idx) => {
      const matchCfg = { playersInMatch:match.playersInMatch, matchType:match.matchType, teams:match.teams||null, popHoles:match.popHoles||{} };
      const status = _nassauLiveStatusForMatch(scores, matchCfg, players, course, holeIdx);
      return { matchId:match.id, matchType:match.matchType, teams:match.teams||null, matchColor:MATCH_COLORS_LOCAL[idx]||'#D4AF47', playersInMatch:match.playersInMatch, stakes:match.stakes, front:status.front, back:status.back, overall:status.overall };
    });
  }, [JSON.stringify(scores), holeIdx]);

  // ── Format stat pills ─────────────────────────────────────────────────────
  const playerFormatStats = React.useMemo(() => {
    const result = {};
    players.forEach(p => {
      const stats = [];
      const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;
      if (hasWolf) { const wolfPts = calcWolfStandings(scores, wolfData, players, course); const pts = wolfPts[p.id]||0; stats.push({ icon:'🐺', label:'WOLF PTS', value:String(pts), color:pts>0?'#15803D':'#3F5F4A' }); }
      if (hasStable) { const pts = course.holes.reduce((acc,h,i) => { const g=scores[p.id]?.[i]; return acc+(g?calcStablefordPoints(getAdjustedHoleScore(scores,popFlags,p.id,i),h.par):0); }, 0); stats.push({ icon:'⭐', label:'STBL PTS', value:String(pts), color:pts>=2?'#C8A15A':'#3F5F4A' }); }
      if (hasPTM && ptmHoleHolder===p.id) stats.push({ icon:'💰', label:'HOLDS', value:'', color:'#C8A15A' });
      if (holesPlayed>0) { const total=(scores[p.id]||[]).reduce((acc,s)=>acc+(s||0),0); stats.push({ icon:'⛳', label:'STROKES', value:String(total), color:'#3F5F4A' }); }
      if (hasSkins) { const {skins}=calcSkins(scores,players,course,skinsFmt?.stakes||1,popFlags); const won=skins[p.id]||0; stats.push({ icon:'🎯', label:'SKINS', value:String(won), color:won>0?'#C8A15A':'#3F5F4A' }); }
      if (hasNassau) {
        matchLiveStatuses.forEach((ms) => {
          if (!ms.playersInMatch.includes(p.id)) return;
          let oppName;
          if (ms.matchType === '2v2' && ms.teams) {
            const oppIds = (ms.teams.team1 || []).includes(p.id) ? (ms.teams.team2 || []) : (ms.teams.team1 || []);
            oppName = oppIds.map(id => players.find(pl => pl.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ') || '?';
          } else {
            const opponentId = ms.playersInMatch.find(id => id !== p.id);
            const opponent   = opponentId ? players.find(pl => pl.id === opponentId) : null;
            oppName = opponent ? opponent.name.split(' ')[0] : '?';
          }
          stats.push({ icon:'💰', label:`vs ${oppName} F9`, value:ms.front, color:ms.front==='EVEN'?'#3F5F4A':ms.matchColor });
          if (holeIdx >= 9) {
            stats.push({ icon:'', label:`B9`, value:ms.back,    color:ms.back==='EVEN'?'#3F5F4A':ms.matchColor });
            stats.push({ icon:'', label:`18`, value:ms.overall, color:ms.overall==='EVEN'?'#3F5F4A':ms.matchColor });
          }
        });
      }
      // BBB points are shown via the interactive BBBPill on each player card
      if (hasTeeBall) {
        const tbSt = window.calcTeeBallStandings(teeBallData, players);
        const pts = tbSt[p.id] || 0;
        stats.push({ icon:'🏌️', label:'TEE BALL', value:String(pts), color:pts>0?'#C8A15A':'#3F5F4A' });
      }
      if (hasMarkey && markeyFmt?.markeyMatchConfig) {
        const cfg = markeyFmt.markeyMatchConfig;
        const inT1 = (cfg.team1||[]).includes(p.id);
        const inT2 = (cfg.team2||[]).includes(p.id);
        if (inT1 || inT2) {
          const matchStates = window.calcMarkeyMatchState(scores, cfg.markeyPopStrokes, players, markeyFmt);
          const overall = matchStates[0];
          if (overall) {
            const leading = overall.team1Holes > overall.team2Holes ? 'A' : overall.team2Holes > overall.team1Holes ? 'B' : null;
            const diff = Math.abs(overall.team1Holes - overall.team2Holes);
            const myTeam = inT1 ? 'A' : 'B';
            const label = leading ? (leading === myTeam ? `+${diff}` : `-${diff}`) : 'AS';
            const color = leading === myTeam ? '#15803D' : leading && leading !== myTeam ? '#DC2626' : '#3F5F4A';
            stats.push({ icon:'⚔️', label:`MARKEY (${matchStates.length}M)`, value:label, color });
          }
        }
      }
      result[p.id] = stats;
    });
    return result;
  }, [JSON.stringify(scores), JSON.stringify(wolfData), JSON.stringify(popFlags), JSON.stringify(bbbData), JSON.stringify(teeBallData), holeIdx, JSON.stringify(matchLiveStatuses)]);

  // ── Score / putt / pop setters ────────────────────────────────────────────
  const setScore = (playerId, val) => {
    window.ppHaptic && window.ppHaptic();
    const clamped = Math.max(1, val);
    setScores(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(holeCount).fill(null))]};
      next[playerId][holeIdx] = clamped;
      scheduleCloudWrite(next, null, null, null);
      return next;
    });
  };

  const setPutt = (playerId, val) => {
    window.ppHaptic && window.ppHaptic();
    setPutts(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(holeCount).fill(0))]};
      next[playerId][holeIdx] = val;
      scheduleCloudWrite(null, next, null, null);
      return next;
    });
  };

  const togglePop = (playerId) => {
    setPopFlags(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(holeCount).fill(false))]};
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

  const handleSetBBB = (hIdx, field, value) => {
    setBBBData(prev => {
      const existing = prev[hIdx] || { bingo:null, bango:null, bongo:null, confirmed:false };
      const updated  = { ...existing, [field]: value };
      // Mark confirmed whenever any category is set so calcBBBStandings counts it
      const bbbFields = ['bingo', 'bango', 'bongo'];
      if (bbbFields.includes(field)) {
        updated.confirmed = bbbFields.some(k => k === field ? !!value : !!updated[k]);
      }
      const next = { ...prev, [hIdx]: updated };
      scheduleCloudWrite(null, null, null, null, next, null);
      return next;
    });
  };

  const handleSetTeeBall = (hIdx, winner, confirmed) => {
    setTeeBallData(prev => {
      const existing = prev[hIdx] || { winner:null, confirmed:false };
      const next = { ...prev, [hIdx]: { ...existing, winner, confirmed: !!confirmed } };
      scheduleCloudWrite(null, null, null, null, null, next);
      return next;
    });
  };

  const setFIR = (playerId, val) => {
    setFIRData(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(holeCount).fill(null))]};
      next[playerId][holeIdx] = val;
      scheduleCloudWrite(null, null, null, null, null, null, next, null);
      return next;
    });
  };

  const setGIR = (playerId, val) => {
    setGIRData(prev => {
      const next = {...prev, [playerId]: [...(prev[playerId]||Array(holeCount).fill(null))]};
      next[playerId][holeIdx] = val;
      scheduleCloudWrite(null, null, null, null, null, null, null, next);
      return next;
    });
  };

  const setExtraStat = (playerId, field, val) => {
    setExtraStats(prev => {
      const mine = { ...(prev[playerId] || {}) };
      const holeEntry = { ...(mine[holeIdx] || {}) };
      if (val === null || val === undefined || val === 0 || val === '') delete holeEntry[field];
      else holeEntry[field] = val;
      if (Object.keys(holeEntry).length === 0) delete mine[holeIdx];
      else mine[holeIdx] = holeEntry;
      const next = { ...prev, [playerId]: mine };
      scheduleCloudWrite(null, null, null, null, null, null, null, null, next);
      return next;
    });
  };

  // Current position within the play order (0–17), independent of which tee we started on.
  const seqPos = playOrder.indexOf(holeIdx);

  const prevHole = () => {
    if (seqPos > 0) {
      const newIdx = playOrder[seqPos - 1];
      holeIdxRef.current = newIdx;
      setHoleIdx(newIdx);
      scheduleCloudWrite(null, null, null, null);
    }
  };

  const allScored = players.every(p => (scores[p.id]||[]).filter(Boolean).length === holeCount);
  const currentHoleScored = players.every(p => scores[p.id]?.[holeIdx]);

  const ptmPuttRequired = hasPTM && !!ptmHoleHolder && !(putts[ptmHoleHolder]?.[holeIdx] > 0);
  const wolfPickRequired = hasWolf && !wolfHoleData.confirmed;
  const canAdvance = currentHoleScored && !ptmPuttRequired && !wolfPickRequired;

  const nextHole = () => {
    if (canAdvance && seqPos < lastSeq) {
      window.ppHaptic && window.ppHaptic(12);
      const newIdx = playOrder[seqPos + 1];
      holeIdxRef.current = newIdx;
      setHoleIdx(newIdx);
      scheduleCloudWrite(null, null, null, null);
    }
  };

  // ── Reconnect flush — if a live-score write failed offline, re-push the
  // latest state as soon as the connection returns.
  React.useEffect(() => {
    const onOnline = () => scheduleCloudWrite(null, null, null, null);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [scheduleCloudWrite]);

  const handleFinish = () => { onSaveRound(scores, wolfData, putts, [], {}, popFlags, bbbData, teeBallData, firData, girData, extraStats); };

  const parColor = hole.par === 3 ? '#2563EB' : hole.par === 5 ? '#C8A15A' : '#3F5F4A';
  const hasGames = games.length > 0;
  const hasAnyTracker = hasGames || hasWolf || hasPTM || hasNassau || hasStable || hasSkins || hasBBB || hasTeeBall || hasMarkey;

  // ── One-screen adaptive layout ────────────────────────────────────────────
  // The player grid is measured with a ResizeObserver; the measured cell size
  // drives a scale factor so the interface resizes itself to always fit —
  // large and generous for 2 players, efficient for 4+ — with no scrolling.
  const gridRef = React.useRef(null);
  const [gridBox, setGridBox] = React.useState(() => ({
    w: Math.max(280, window.innerWidth - 20),
    h: Math.max(320, window.innerHeight - 300),
  }));
  React.useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setGridBox(prev => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1)
        ? prev : { w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nPlayers    = players.length;
  const isLandscape = gridBox.w > gridBox.h * 1.5;
  const gridCols    = isLandscape ? Math.min(nPlayers, 4) : (nPlayers <= 3 ? 1 : 2);
  const gridRows    = Math.ceil(nPlayers / gridCols) || 1;
  const GAP         = isLandscape ? 8 : 10;
  const cardW       = (gridBox.w - GAP * (gridCols - 1)) / gridCols;
  const cardH       = (gridBox.h - GAP * (gridRows - 1)) / gridRows;
  const showPopToggle = hasAnyTracker; // pops only affect game math — hide in casual rounds
  const narrowCard = cardW < 260;
  const compactHeader = gridBox.h < 400; // short viewports (landscape phones)

  // Height budget (at sz=1): header 40 + stepper 86 + meta 36 = 162, plus the
  // wolf/PTM warning strip and however many rows the stat groups wrap into at
  // the current card width. Wrap count depends on the scale, so iterate.
  const statGroupWidths = [
    cardStats.putts && 210, cardStats.fir && 128, cardStats.gir && 128,
    cardStats.pen && 132, cardStats.ud && 122,
  ].filter(Boolean);
  const statRowsAt = (scale) => {
    if (!statGroupWidths.length) return 0;
    const innerW = cardW - 24 * scale;
    let rows = 1, cur = 0;
    statGroupWidths.forEach(g => {
      const w = g * scale;
      if (cur > 0 && cur + w > innerW) { rows++; cur = w; }
      else cur += w + 14 * scale;
    });
    return rows;
  };
  const baseFixedH = 162 + (hasWolf ? 28 : 0) + (hasPTM ? 24 : 0);
  const widthCap   = (cardW / 340) * 1.15;
  let szCalc = Math.min(cardH / (baseFixedH + (statGroupWidths.length ? 52 : 0)), widthCap);
  for (let i = 0; i < 3; i++) {
    const next = Math.min(cardH / (baseFixedH + statRowsAt(szCalc) * 52), widthCap);
    if (Math.abs(next - szCalc) < 0.01) { szCalc = next; break; }
    szCalc = next;
  }
  const sz = Math.max(0.60, Math.min(1.5, szCalc));

  // Always-visible primary action — tells the golfer exactly what's next.
  const primary = !currentHoleScored
    ? { label:'ENTER SCORES TO CONTINUE', disabled:true, variant:'surface' }
    : wolfPickRequired
    ? { label:'🐺 PICK WOLF TO CONTINUE', onClick:()=>setWolfPicker(true), variant:'danger' }
    : ptmPuttRequired
    ? { label:'💰 ENTER PUTTS TO CONTINUE', disabled:true, variant:'surface' }
    : (allScored || seqPos === lastSeq)
    ? { label:'🏁 FINISH ROUND', onClick:()=>setShowFinish(true), variant:'gold' }
    : { label:`NEXT HOLE ${course.holes[playOrder[seqPos + 1]].num} →`, onClick:nextHole, variant:'green' };

  const footBtn = (icon, label, onClick, ariaLabel) => (
    <button onClick={onClick} aria-label={ariaLabel}
      style={{width:54, borderRadius:12, border:'1px solid #E7E3D9', background:'#FFFFFF',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
        cursor:'pointer', WebkitTapHighlightColor:'transparent', padding:'6px 0', flexShrink:0}}>
      <span aria-hidden="true" style={{fontSize:17, lineHeight:1}}>{icon}</span>
      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, letterSpacing:0.8, color:'#3F5F4A'}}>{label}</span>
    </button>
  );

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#F6F4EE'}}>

      <SyncPulse syncing={syncing}/>

      {/* Hole header */}
      <div style={{flexShrink:0, background:'#0E2B20', borderBottom:'1px solid rgba(255,255,255,0.08)',
        padding:`${compactHeader?4:5}px calc(12px + env(safe-area-inset-right, 0px)) ${compactHeader?4:5}px calc(12px + env(safe-area-inset-left, 0px))`}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <button onClick={prevHole} disabled={seqPos===0} aria-label="Previous hole"
            style={{width:40, height:compactHeader?30:34, borderRadius:10, border:'none', background:seqPos===0?'transparent':'rgba(255,255,255,0.12)',
              color:seqPos===0?'rgba(255,255,255,0.2)':'#F6F4EE', fontSize:20, cursor:seqPos===0?'default':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ‹
          </button>

          <div style={{flex:1, textAlign:'center', minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', justifyContent:'center', gap:8}}>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:compactHeader?16:18, color:'#F6F4EE', lineHeight:1}}>HOLE {hole.num}</span>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:compactHeader?12:13, color:parColor}}>PAR {hole.par}</span>
              {compactHeader && (
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'rgba(246,244,238,0.6)'}}>{hole.yds} yds · HCP {hole.hdcp}</span>
              )}
            </div>
            {!compactHeader && (
              <div style={{display:'flex', justifyContent:'center', gap:14, marginTop:2}}>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'rgba(246,244,238,0.6)'}}>{hole.yds} yds</span>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'rgba(246,244,238,0.6)'}}>HCP {hole.hdcp}</span>
              </div>
            )}
          </div>

          <button onClick={nextHole} disabled={seqPos===lastSeq || (currentHoleScored && !canAdvance)} aria-label="Next hole"
            style={{width:40, height:compactHeader?30:34, borderRadius:10, border:'none',
              background: seqPos===lastSeq ? 'transparent' : 'rgba(255,255,255,0.12)',
              color: seqPos===lastSeq ? 'rgba(255,255,255,0.2)' : currentHoleScored && !canAdvance ? 'rgba(220,38,38,0.5)' : '#F6F4EE',
              fontSize:20, cursor: seqPos===lastSeq || (currentHoleScored && !canAdvance) ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ›
          </button>
        </div>

        {/* Hole dots */}
        <div style={{display:'flex', justifyContent:'center', gap:4, marginTop:compactHeader?5:8, flexWrap:'wrap'}}>
          {playOrder.map((i) => {
            const allIn = players.every(p => scores[p.id]?.[i]);
            const some  = players.some(p => scores[p.id]?.[i]);
            return (
              <button key={i} onClick={()=>{ holeIdxRef.current=i; setHoleIdx(i); scheduleCloudWrite(null,null,null,null); }}
                aria-label={`Go to hole ${course.holes[i].num}`} aria-current={i===holeIdx ? 'true' : undefined}
                style={{width:i===holeIdx?20:9, height:9, borderRadius:5, cursor:'pointer', transition:'all 0.2s', padding:0,
                  background:i===holeIdx?'#C8A15A':allIn?'rgba(246,244,238,0.9)':some?'rgba(246,244,238,0.4)':'rgba(255,255,255,0.2)',
                  border:i===holeIdx?'none':`1px solid ${allIn?'rgba(246,244,238,0.4)':'rgba(255,255,255,0.15)'}`}}>
              </button>
            );
          })}
        </div>
      </div>

      {/* Player grid — sized to always fit the viewport, no scrolling */}
      <div style={{flex:1, minHeight:0,
        padding:`${GAP}px calc(${GAP}px + env(safe-area-inset-right, 0px)) ${GAP}px calc(${GAP}px + env(safe-area-inset-left, 0px))`}}>
        <div ref={gridRef} style={{width:'100%', height:'100%', display:'grid',
          gridTemplateColumns:`repeat(${gridCols}, 1fr)`, gridAutoRows:'1fr', gap:GAP}}>
          {players.map(p => {
            const isWolf       = hasWolf && wolfPlayer?.id === p.id;
            const isPartner    = hasWolf && wolfHoleData.confirmed && wolfHoleData.partnerId === p.id;
            const isPTM        = hasPTM && ptmHoleHolder === p.id;
            const isNassauPlayer = allNassauPlayerIds.has(p.id);
            const nassauPopActive = isNassauPlayer && nassauMatches.some(match => {
              if (!match.playersInMatch.includes(p.id)) return false;
              return !!(match.popHoles?.[p.id]?.[holeIdx]);
            });
            const markeyPopCount = hasMarkey && markeyFmt?.markeyMatchConfig
              ? (markeyFmt.markeyMatchConfig.markeyPopStrokes?.[p.id]?.[holeIdx] || 0)
              : undefined;
            return (
              <PlayerScoreCard
                key={p.id}
                p={p} score={scores[p.id]?.[holeIdx]||null} hole={hole} holeIdx={holeIdx}
                putts={putts} gettingPop={!!popFlags[p.id]?.[holeIdx]}
                nassauPopActive={nassauPopActive} isNassauPlayer={isNassauPlayer}
                markeyPopCount={markeyPopCount}
                isWolf={isWolf} isPartner={isPartner} isPTMHolder={isPTM}
                hasWolf={hasWolf} wolfData={wolfData} formatStats={playerFormatStats[p.id]||[]}
                onScore={setScore} onPutt={setPutt} onWolfTap={() => setWolfPicker(true)}
                onScoreTap={() => setKeypad(p.id)} onPopToggle={togglePop}
                hasBBB={hasBBB} bbbData={hasBBB ? bbbData : null} players={players} onSetBBB={handleSetBBB}
                stats={cardStats} firData={firData} girData={girData} onFIR={setFIR} onGIR={setGIR}
                extraStats={extraStats} onExtraStat={setExtraStat}
                sz={sz} narrow={narrowCard} showPopToggle={showPopToggle}
              />
            );
          })}
        </div>
      </div>

      {/* Action bar — utilities left, one clear primary action right */}
      <div style={{flexShrink:0, display:'flex', gap:8, alignItems:'stretch',
        padding:'8px calc(12px + env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))',
        background:'#FFFFFF', borderTop:'1px solid #E7E3D9'}}>
        {footBtn('🚪', 'EXIT', ()=>setShowExit(true), 'Exit round')}
        {footBtn('📊', 'CARD', ()=>setShowScorecard(true), 'Open live scorecard')}
        {hasAnyTracker && footBtn('🎯', 'GAMES', ()=>setTrackersOpen(true), 'Open game trackers')}
        <Btn onClick={primary.onClick} disabled={!!primary.disabled} variant={primary.variant}
          style={{flex:1, minHeight:52, padding:'10px 12px', fontSize:15, letterSpacing:0.5}}>
          {primary.label}
        </Btn>
      </div>

      <TrackersSheet open={trackersOpen} onClose={() => setTrackersOpen(false)} formats={formats}>
        <RoundTracker players={players} scores={scores} course={course} holeIdx={holeIdx}/>
        {hasGames   && <EngineGamesTracker games={games} players={players} course={course} scores={scores} startingTee={startingTee} gameState={{ wolf: wolfData, bbb: bbbData }}/>}
        {hasWolf    && <WolfTracker      players={players} scores={scores} wolfData={wolfData}     course={course} holeIdx={holeIdx} onSetPartner={handleWolfPick} onLoneWolf={handleLoneWolf} onResetWolf={handleResetWolf} format={wolfFmt}/>}
        {hasPTM     && <PTMTracker       players={players} scores={scores} putts={putts}           course={course} holeIdx={holeIdx} ptmInitialHolder={players[0]?.id} format={ptmFmt}/>}
        {hasNassau  && <MultiNassauTracker players={players} scores={scores} nassauMatches={nassauMatches} course={course} holeIdx={holeIdx} nassauFmt={nassauFmtObj}/>}
        {hasBBB     && <BBBTracker          players={players} scores={scores} course={course} holeIdx={holeIdx} bbbData={bbbData}         format={bbbFmt}/>}
        {hasTeeBall && <TeeBallTracker      players={players} scores={scores} course={course} holeIdx={holeIdx} teeBallData={teeBallData} onSetTeeBall={handleSetTeeBall} format={teeBallFmt}/>}
        {hasMarkey  && <MarkeyMatchTracker  players={players} scores={scores} format={markeyFmt} holeIdx={holeIdx}/>}
      </TrackersSheet>

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
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', lineHeight:1.6}}>Your scores are saved locally. You can resume this round from the home screen.</div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>setShowExit(false)} variant="ghost" style={{flex:1}}>KEEP PLAYING</Btn>
            <Btn onClick={onExitRound} variant="danger" style={{flex:1}}>EXIT ROUND</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={showFinish} onClose={()=>setShowFinish(false)} title="Finish Round?">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', lineHeight:1.6}}>
            {!allScored ? `Some holes haven't been scored yet. You can still finish and view results.` : `All ${holeCount} holes complete. Ready to view the final results?`}
          </div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>setShowFinish(false)} variant="ghost" style={{flex:1}}>KEEP PLAYING</Btn>
            <Btn onClick={handleFinish} variant="gold" style={{flex:1}}>VIEW RESULTS</Btn>
          </div>
        </div>
      </Modal>

      {showScorecard && (
        <LiveScorecardModal
          onClose={() => setShowScorecard(false)}
          players={players} course={course}
          scores={scores} putts={putts} popFlags={popFlags} wolfData={wolfData}
          nassauMatches={nassauMatches} holeIdx={holeIdx}
          hasWolf={hasWolf} hasPTM={hasPTM} hasNassau={hasNassau}
          hasStable={hasStable} hasSkins={hasSkins}
          hasBBB={hasBBB} hasTeeBall={hasTeeBall} hasMarkey={hasMarkey}
          wolfFmt={wolfFmt} ptmFmt={ptmFmt} skinsFmt={skinsFmt} nassauFmtObj={nassauFmtObj}
          bbbFmt={bbbFmt} teeBallFmt={teeBallFmt} markeyFmt={markeyFmt}
          bbbData={bbbData} teeBallData={teeBallData}
        />
      )}
    </div>
  );
};

Object.assign(window, { ScoreEntry });
