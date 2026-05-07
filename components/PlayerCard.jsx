// PlayerCard.jsx — Individual player score input card

const PlayerCard = ({ player, score, onScore, putts, onPutts, isWolf, isPartner, wolfPicked, holeIdx, par, isLandscape }) => {
  const diff = score ? score - par : null;

  const relColor = diff === null ? '#6B7280'
    : diff <= -2 ? '#C8A15A' : diff === -1 ? '#15803D' : diff === 0 ? '#6B7280'
    : diff === 1 ? '#DC2626' : '#991B1B';

  const relLabel = diff === null ? '—'
    : diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD'
    : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;

  const border = isWolf ? '2px solid rgba(220,38,38,0.6)'
    : isPartner ? `2px solid ${player.color}`
    : `1px solid #E7E3D9`;
  const bg = isWolf ? 'rgba(220,38,38,0.03)'
    : isPartner ? `${player.color}08`
    : '#FFFFFF';

  return (
    <div style={{...pcS.card, border, background:bg, flex:1, minWidth: isLandscape ? 0 : '100%'}}>
      <div style={pcS.header}>
        <Avatar player={player} size={32}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20', letterSpacing:0.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{player.name}</div>
          <div style={{fontSize:10, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>HCP {player.handicap}</div>
        </div>
        {isWolf && <div style={pcS.wolfBadge}>🐺 WOLF</div>}
        {isPartner && !isWolf && <div style={{...pcS.wolfBadge, background:`${player.color}12`, color:player.color, border:`1px solid ${player.color}44`}}>⚑ PARTNER</div>}
      </div>

      <div style={pcS.scoreRow}>
        <button
          onClick={() => score > 1 && onScore(score - 1)}
          style={{...pcS.scoreBtn, opacity: score > 1 ? 1 : 0.3}}
        >−</button>

        <div style={pcS.scoreDisplay}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:64, lineHeight:1, color: score ? relColor : '#E7E3D9'}}>{score || '—'}</div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, fontWeight:700, letterSpacing:1, color:relColor, marginTop:2}}>{relLabel}</div>
        </div>

        <button
          onClick={() => onScore((score || par) + 1)}
          style={{...pcS.scoreBtn, background:'#C8A15A', color:'#0E2B20', boxShadow:'0 2px 10px rgba(200,161,90,0.25)'}}
        >+</button>
      </div>

      <div style={pcS.puttRow}>
        <Label>PUTTS</Label>
        <div style={{display:'flex', gap:6, marginLeft:8}}>
          {[1,2,3,4].map(n => (
            <div key={n} onClick={() => onPutts(putts === n ? 0 : n)}
              style={{...pcS.puttBtn, background: putts===n ? `${player.color}18` : 'transparent', border: putts===n?`1px solid ${player.color}`:'1px solid #E7E3D9', color: putts===n?player.color:'#8A9E8A'}}>
              {n}
            </div>
          ))}
        </div>
        {putts >= 3 && <span style={{fontSize:10, color:'#DC2626', marginLeft:4, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700}}>3-PUTT</span>}
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
    fontSize:10, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, letterSpacing:0.5,
    background:'rgba(220,38,38,0.08)', color:'#DC2626', border:'1px solid rgba(220,38,38,0.25)',
    padding:'2px 7px', borderRadius:5,
  },
  scoreRow: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 },
  scoreBtn: {
    width:60, height:60, borderRadius:12, border:'none', cursor:'pointer',
    fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:32, fontWeight:900, color:'#0E2B20',
    background:'#EAE7DE', display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0, transition:'transform 0.1s', userSelect:'none',
    WebkitTapHighlightColor:'transparent',
  },
  scoreDisplay: { flex:1, display:'flex', flexDirection:'column', alignItems:'center' },
  puttRow: { display:'flex', alignItems:'center', borderTop:'1px solid #E7E3D9', paddingTop:10 },
  puttBtn: { width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, userSelect:'none' },
};

Object.assign(window, { PlayerCard });
