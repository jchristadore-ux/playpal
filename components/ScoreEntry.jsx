// ============================================================
// ScoreEntry.jsx — PATCH FILE
// Apply these two targeted replacements exactly.
// All other code in ScoreEntry.jsx is unchanged.
// ============================================================

// ──────────────────────────────────────────────────────────────
// PATCH 1: PlayerScoreCard — remove getHoleStrokes, net, HCP
//          strokes display, and NET {net} line
// ──────────────────────────────────────────────────────────────

// REMOVE this block at the top of PlayerScoreCard:
// ─────────────────────────────────────────────────────
//   const { getHoleStrokes } = window;
//   const strokes  = getHoleStrokes(p.handicap, hole.hdcp);
//   const diff     = score ? score - hole.par : null;
//   const net      = score ? score - strokes : null;
// ─────────────────────────────────────────────────────
// REPLACE WITH:
//   const diff = score ? score - hole.par : null;


// REMOVE from player header sub-section:
// ─────────────────────────────────────────────────────
//   <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>
//     HCP {p.handicap}
//     {strokes > 0 && <span style={{color:'#C9A84C', marginLeft:5}}>+{strokes} stroke{strokes>1?'s':''}</span>}
//   </div>
// ─────────────────────────────────────────────────────
// REPLACE WITH:
//   <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>HCP {p.handicap}</div>


// REMOVE from score display block:
// ─────────────────────────────────────────────────────
//   {net!==null && strokes>0 && (
//     <div style={{fontSize:11, color:'#4A6890', marginTop:1}}>NET {net}</div>
//   )}
// ─────────────────────────────────────────────────────
// DELETE ENTIRELY — no replacement


// ──────────────────────────────────────────────────────────────
// PATCH 2: playerFormatStats useMemo — fix calcStablefordPoints
//          calls to remove handicap args
// ──────────────────────────────────────────────────────────────

// REMOVE:
// ─────────────────────────────────────────────────────
//       if (formats.some(f => f.type === 'stableford')) {
//         const pts = course.holes.reduce((acc, h, i) => {
//           const g = scores[p.id]?.[i];
//           return acc + (g ? calcStablefordPoints(g, h.par, p.handicap, h.hdcp) : 0);
//         }, 0);
// ─────────────────────────────────────────────────────
// REPLACE WITH:
//       if (formats.some(f => f.type === 'stableford')) {
//         const pts = course.holes.reduce((acc, h, i) => {
//           const g = scores[p.id]?.[i];
//           return acc + (g ? calcStablefordPoints(g, h.par) : 0);
//         }, 0);


// ──────────────────────────────────────────────────────────────
// PATCH 3: ScoreEntry const declaration — remove getHoleStrokes
// ──────────────────────────────────────────────────────────────

// REMOVE:
//   const { getWolfForHole, getHoleStrokes, computePTMState } = window;
// REPLACE WITH:
//   const { getWolfForHole, computePTMState } = window;


// ──────────────────────────────────────────────────────────────
// COMPLETE CORRECTED PlayerScoreCard COMPONENT (drop-in replace)
// ──────────────────────────────────────────────────────────────

const PlayerScoreCard = ({ p, score, hole, holeIdx, putts, isWolf, isPartner, isPTMHolder, hasWolf, wolfData, formatStats, onScore, onPutt, onWolfTap, onScoreTap }) => {
  const diff     = score ? score - hole.par : null;
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
          <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>HCP {p.handicap}</div>
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          {isWolf      && <span style={{fontSize:22}}>🐺</span>}
          {isPartner && !isWolf && <span style={{fontSize:20, opacity:0.85}}>⚑</span>}
          {hasWolf && isWolf && (
            <button onClick={onWolfTap} style={{
              background: !wolfData?.[holeIdx]?.confirmed
                ? 'rgba(229,83,75,0.15)' : 'rgba(61,203,108,0.1)',
              border: !wolfData?.[holeIdx]?.confirmed
                ? '1px solid rgba(229,83,75,0.5)' : '1px solid rgba(61,203,108,0.3)',
              color: !wolfData?.[holeIdx]?.confirmed ? '#E5534B' : '#3DCB6C',
              borderRadius:8, padding:'5px 10px', cursor:'pointer',
              fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:0.5,
              WebkitTapHighlightColor:'transparent',
            }}>
              {!wolfData?.[holeIdx]?.confirmed ? 'PICK TEAM' : wolfData[holeIdx]?.lone ? 'LONE 🐺' : '✓ SET'}
            </button>
          )}
        </div>
      </div>

      {/* ── Format stats strip ── */}
      {formatStats && formatStats.length > 0 && (
        <div style={{display:'flex', gap:0, borderTop:'1px solid #0A1628', borderBottom:'1px solid #0A1628'}}>
          {formatStats.map((s,i) => (
            <div key={i} style={{flex:1, padding:'6px 8px', display:'flex', flexDirection:'column', alignItems:'center',
              borderRight: i < formatStats.length-1 ? '1px solid #0A1628' : 'none'}}>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:16, color:s.color, lineHeight:1}}>{s.value}</div>
              <div style={{fontFamily:'Barlow Condensed', fontSize:8, color:'#4A6890', letterSpacing:0.5, marginTop:1}}>{s.label}</div>
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
              style={{width:44, height:44, borderRadius:10, border:'none',
                background: puttVal===n ? p.color : '#162950',
                color: puttVal===n ? '#0A1628' : '#7A98BC',
                fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18,
                cursor:'pointer', WebkitTapHighlightColor:'transparent', userSelect:'none'}}>
              {n}
            </button>
          ))}
        </div>
        {puttVal >= 3 && <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, color:'#E5534B', marginLeft:4, letterSpacing:0.5}}>3-PUTT</span>}
      </div>
    </div>
  );
};


// ──────────────────────────────────────────────────────────────
// CORRECTED playerFormatStats useMemo block (drop-in replace)
// ──────────────────────────────────────────────────────────────

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
        const wolfPts = calcWolfStandings(scores, wolfData, players, course);
        const pts = wolfPts[p.id] || 0;
        stats.push({ icon: '🐺', label: 'WOLF PTS', value: String(pts), color: pts > 0 ? '#3DCB6C' : '#7A98BC' });
      }

      if (formats.some(f => f.type === 'stableford')) {
        const pts = course.holes.reduce((acc, h, i) => {
          const g = scores[p.id]?.[i];
          return acc + (g ? calcStablefordPoints(g, h.par) : 0);
        }, 0);
        stats.push({ icon: '⭐', label: 'STBL PTS', value: String(pts), color: pts >= 2 ? '#C9A84C' : '#7A98BC' });
      }

      if (formats.some(f => f.type === 'skins')) {
        const skinsFmt = formats.find(f => f.type === 'skins');
        const { skins } = calcSkins(scores, players, course, skinsFmt?.stakes || 1);
        const won = skins[p.id] || 0;
        stats.push({ icon: '🎯', label: 'SKINS', value: String(won), color: won > 0 ? '#C9A84C' : '#7A98BC' });
      }

      result[p.id] = stats;
    });
    return result;
  }, [JSON.stringify(scores), JSON.stringify(wolfData), holeIdx]);
