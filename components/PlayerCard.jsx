// PlayerCard.jsx — Individual player score input card

const PlayerCard = ({ player, score, onScore, putts, onPutts, isWolf, isPartner, wolfPicked, holeIdx, par, isLandscape }) => {
  const diff = score ? score - par : null;

  const relColor = diff === null ? '#A0A0A0'
    : diff <= -2 ? '#D4AF37' : diff === -1 ? '#4ADE80' : diff === 0 ? '#A0A0A0'
    : diff === 1 ? '#FF6B6B' : '#CC3333';

  const relLabel = diff === null ? '—'
    : diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD'
    : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;

  const border = isWolf ? '2px solid #FF6B6B'
    : isPartner ? `2px solid ${player.color}`
    : `1px solid #2A2A2A`;
  const bg = isWolf ? 'rgba(255,107,107,0.05)'
    : isPartner ? `${player.color}08`
    : '#1E1E1E';

  return (
    <div style={{...pcS.card, border, background:bg, flex:1, minWidth: isLandscape ? 0 : '100%'}}>
      <div style={pcS.header}>
        <Avatar player={player} size={32}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#F5F5F5', letterSpacing:0.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{player.name}</div>
          <div style={{fontSize:10, color:'#A0A0A0', fontFamily:'Inter, system-ui, sans-serif'}}>HCP {player.handicap}</div>
        </div>
        {isWolf && <div style={pcS.wolfBadge}>🐺 WOLF</div>}
        {isPartner && !isWolf && <div style={{...pcS.wolfBadge, background:'rgba(0,168,107,0.12)', color:'#00A86B', border:'1px solid rgba(0,168,107,0.25)'}}>⚑ PARTNER</div>}
      </div>

      <div style={pcS.scoreRow}>
        <button
          onClick={() => score > 1 && onScore(score - 1)}
          style={{...pcS.scoreBtn, opacity: score > 1 ? 1 : 0.3}}
        >−</button>

        <div style={pcS.scoreDisplay}>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:64, lineHeight:1, color: score ? relColor : '#2A2A2A'}}>{score || '—'}</div>
          <div style={{fontFamily:'Inter, system-ui, sans-serif', fontSize:12, fontWeight:700, letterSpacing:1, color:relColor, marginTop:2}}>{relLabel}</div>
        </div>

        <button
          onClick={() => onScore((score || par) + 1)}
          style={{...pcS.scoreBtn, background:'#D4AF37', color:'#0D0D0D', boxShadow:'0 2px 10px rgba(212,175,55,0.3)'}}
        >+</button>
      </div>

      <div style={pcS.puttRow}>
        <Label>PUTTS</Label>
        <div style={{display:'flex', gap:6, marginLeft:8}}>
          {[1,2,3,4].map(n => (
            <div key={n} onClick={() => onPutts(putts === n ? 0 : n)}
              style={{...pcS.puttBtn, background: putts===n ? '#252525':'transparent', border: putts===n?`1px solid ${player.color}`:'1px solid #2A2A2A', color: putts===n?player.color:'#666666'}}>
              {n}
            </div>
          ))}
        </div>
        {putts >= 3 && <span style={{fontSize:10, color:'#FF6B6B', marginLeft:4, fontFamily:'Inter, system-ui, sans-serif', fontWeight:700}}>3-PUTT</span>}
      </div>
    </div>
  );
};

const pcS = {
  card: {
    borderRadius:18, padding:'14px 14px 10px', display:'flex', flexDirection:'column', gap:10,
    transition:'border-color 0.2s',
  },
  header: { display:'flex', alignItems:'center', gap:10 },
  wolfBadge: {
    fontSize:10, fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, letterSpacing:0.5,
    background:'rgba(255,107,107,0.12)', color:'#FF6B6B', border:'1px solid rgba(255,107,107,0.25)',
    padding:'2px 7px', borderRadius:5,
  },
  scoreRow: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 },
  scoreBtn: {
    width:60, height:60, borderRadius:12, border:'none', cursor:'pointer',
    fontFamily:'Inter, system-ui, sans-serif', fontSize:32, fontWeight:900, color:'#F5F5F5',
    background:'#252525', display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0, transition:'transform 0.1s', userSelect:'none',
    WebkitTapHighlightColor:'transparent',
  },
  scoreDisplay: { flex:1, display:'flex', flexDirection:'column', alignItems:'center' },
  puttRow: { display:'flex', alignItems:'center', borderTop:'1px solid #2A2A2A', paddingTop:10 },
  puttBtn: { width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, userSelect:'none' },
};

Object.assign(window, { PlayerCard });
