// PlayerCard.jsx — Individual player score input card

const PlayerCard = ({ player, score, onScore, putts, onPutts, isWolf, isPartner, wolfPicked, holeIdx, par, holeHdcp, isLandscape }) => {
  const strokes = getHoleStrokes(player.handicap, holeHdcp, 18);
  const net = score ? score - strokes : null;
  const diff = score ? score - par : null;

  const relColor = diff === null ? '#7A98BC'
    : diff <= -2 ? '#FFD700' : diff === -1 ? '#3DCB6C' : diff === 0 ? '#9BB4D4'
    : diff === 1 ? '#E5534B' : '#C0392B';

  const relLabel = diff === null ? '—'
    : diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD'
    : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;

  const border = isWolf ? '2px solid #E5534B'
    : isPartner ? `2px solid ${player.color}`
    : `1px solid #1E3A6E`;
  const bg = isWolf ? 'rgba(229,83,75,0.06)'
    : isPartner ? `${player.color}0A`
    : '#0F2040';

  return (
    <div style={{...pcS.card, border, background:bg, flex:1, minWidth: isLandscape ? 0 : '100%'}}>
      {/* Header */}
      <div style={pcS.header}>
        <Avatar player={player} size={32}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15, color:'#fff', letterSpacing:0.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{player.name}</div>
          <div style={{fontSize:10, color:'#7A98BC'}}>
            HCP {player.handicap}
            {strokes > 0 && <span style={{color:'#C9A84C', marginLeft:4}}>+{strokes} stroke{strokes>1?'s':''}</span>}
          </div>
        </div>
        {isWolf && <div style={pcS.wolfBadge}>🐺 WOLF</div>}
        {isPartner && !isWolf && <div style={{...pcS.wolfBadge, background:'rgba(61,203,108,0.15)', color:'#3DCB6C', border:'1px solid rgba(61,203,108,0.3)'}}>⚑ PARTNER</div>}
      </div>

      {/* Score Controls */}
      <div style={pcS.scoreRow}>
        <button
          onClick={() => score > 1 && onScore(score - 1)}
          style={{...pcS.scoreBtn, opacity: score > 1 ? 1 : 0.3}}
        >−</button>

        <div style={pcS.scoreDisplay}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:64, lineHeight:1, color: score ? relColor : '#2A4A6E'}}>{score || '—'}</div>
          <div style={{fontFamily:'Barlow Condensed', fontSize:13, fontWeight:600, letterSpacing:1.5, color:relColor, marginTop:2}}>{relLabel}</div>
          {net !== null && strokes > 0 && (
            <div style={{fontSize:10, color:'#7A98BC'}}>NET {net}</div>
          )}
        </div>

        <button
          onClick={() => onScore((score || par) + 1)}
          style={{...pcS.scoreBtn, background:'linear-gradient(135deg,#C9A84C,#A8893A)', color:'#0A1628'}}
        >+</button>
      </div>

      {/* Putt tracker */}
      <div style={pcS.puttRow}>
        <Label>PUTTS</Label>
        <div style={{display:'flex', gap:6, marginLeft:8}}>
          {[1,2,3,4].map(n => (
            <div key={n} onClick={() => onPutts(putts === n ? 0 : n)}
              style={{...pcS.puttBtn, background: putts===n ? '#162950':'transparent', border: putts===n?`1px solid ${player.color}`:'1px solid #1E3A6E', color: putts===n?player.color:'#4A6890'}}>
              {n}
            </div>
          ))}
        </div>
        {putts >= 3 && <span style={{fontSize:10, color:'#E5534B', marginLeft:4}}>3-PUTT</span>}
      </div>
    </div>
  );
};

const pcS = {
  card: {
    borderRadius:14, padding:'14px 14px 10px', display:'flex', flexDirection:'column', gap:10,
    transition:'border-color 0.2s',
  },
  header: { display:'flex', alignItems:'center', gap:10 },
  wolfBadge: {
    fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1,
    background:'rgba(229,83,75,0.15)', color:'#E5534B', border:'1px solid rgba(229,83,75,0.3)',
    padding:'2px 7px', borderRadius:5,
  },
  scoreRow: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 },
  scoreBtn: {
    width:60, height:60, borderRadius:12, border:'none', cursor:'pointer',
    fontFamily:'Barlow Condensed', fontSize:32, fontWeight:900, color:'#fff',
    background:'#162950', display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0, transition:'transform 0.1s', userSelect:'none',
    WebkitTapHighlightColor:'transparent',
  },
  scoreDisplay: { flex:1, display:'flex', flexDirection:'column', alignItems:'center' },
  puttRow: { display:'flex', alignItems:'center', borderTop:'1px solid #1E3A6E', paddingTop:10 },
  puttBtn: { width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, userSelect:'none' },
};

Object.assign(window, { PlayerCard });
