// Shared.jsx — NavBar, Button, Avatar, Modal, Toast

const NavBar = ({ syncCode, onHome, currentScreen }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(syncCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };
  return (
    <nav style={navStyles.bar}>
      <button onClick={onHome} style={navStyles.logo}>
        <span style={{color:'#3DCB6C', fontFamily:'Barlow Condensed', fontSize:22, fontWeight:800, letterSpacing:1}}>🏌️ PLAYPAL</span>
      </button>
      <div style={navStyles.center} />
      {syncCode && (
        <button onClick={copy} style={navStyles.sync}>
          <span style={{fontSize:10, color:'#7A98BC', letterSpacing:1}}>SYNC</span>
          <span style={{fontSize:13, fontWeight:700, color:'#3DCB6C', fontFamily:'Barlow Condensed', letterSpacing:2}}>{syncCode}</span>
          {copied && <span style={{fontSize:10, color:'#3DCB6C'}}>✓ COPIED</span>}
        </button>
      )}
    </nav>
  );
};

const navStyles = {
  bar: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:48, background:'#050E1C', borderBottom:'1px solid #1E3A6E', flexShrink:0, zIndex:100, position:'relative' },
  logo: { background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:6 },
  center: { flex:1 },
  sync: { display:'flex', flexDirection:'column', alignItems:'flex-end', background:'rgba(61,203,108,0.07)', border:'1px solid rgba(61,203,108,0.2)', borderRadius:8, padding:'4px 10px', cursor:'pointer', gap:1 },
};

const Btn = ({ children, onClick, variant='gold', style={}, disabled=false }) => {
  const variants = {
    gold:    { background:'linear-gradient(135deg,#C9A84C,#A8893A)', color:'#0A1628', fontWeight:800 },
    green:   { background:'linear-gradient(135deg,#3DCB6C,#2BA854)', color:'#0A1628', fontWeight:800 },
    ghost:   { background:'transparent', color:'#9BB4D4', border:'1px solid #1E3A6E' },
    danger:  { background:'linear-gradient(135deg,#E5534B,#C0392B)', color:'#fff', fontWeight:700 },
    surface: { background:'#162950', color:'#fff', border:'1px solid #1E3A6E' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      minHeight:48, padding:'12px 20px', borderRadius:12, border:'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily:'Barlow Condensed', fontSize:16, letterSpacing:1, opacity: disabled ? 0.5 : 1,
      transition:'transform 0.1s, opacity 0.1s', WebkitTapHighlightColor:'transparent',
      ...variants[variant], ...style,
    }}
    onMouseDown={e => { if(!disabled) e.currentTarget.style.transform='scale(0.97)'; }}
    onMouseUp={e => { e.currentTarget.style.transform='scale(1)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
    >{children}</button>
  );
};

const Avatar = ({ player, size=40 }) => (
  <div style={{
    width:size, height:size, borderRadius:'50%',
    background:`linear-gradient(135deg, ${player.color}33, ${player.color}66)`,
    border:`2px solid ${player.color}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'Barlow Condensed', fontWeight:800, fontSize:size*0.35,
    color:player.color, flexShrink:0, letterSpacing:0.5,
  }}>{player.initials}</div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:16, padding:24, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontFamily:'Barlow Condensed', fontSize:20, fontWeight:700, color:'#fff', letterSpacing:1 }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#7A98BC', fontSize:22, cursor:'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Toast = ({ message, type='success' }) => {
  if (!message) return null;
  const colors = { success:'#3DCB6C', error:'#E5534B', info:'#C9A84C' };
  return (
    <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'#0F2040', border:`1px solid ${colors[type]}`, borderRadius:10, padding:'12px 20px', color:'#fff', fontFamily:'DM Sans', fontSize:14, zIndex:2000, boxShadow:'0 4px 24px rgba(0,0,0,0.4)' }}>
      <span style={{ color:colors[type], marginRight:8 }}>{type==='success'?'✓':type==='error'?'✕':'ℹ'}</span>
      {message}
    </div>
  );
};

const Label = ({ children, style={} }) => (
  <span style={{ fontFamily:'Barlow Condensed', fontSize:11, fontWeight:600, letterSpacing:2, color:'#7A98BC', textTransform:'uppercase', ...style }}>{children}</span>
);

const Divider = ({ label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
    <div style={{ flex:1, height:1, background:'#1E3A6E' }} />
    {label && <Label>{label}</Label>}
    <div style={{ flex:1, height:1, background:'#1E3A6E' }} />
  </div>
);

const ScorePill = ({ diff }) => {
  const s = scoreName(diff + 4, 4); // use fake par=4 since we pass diff
  const colors = diff <= -2 ? '#FFD700' : diff === -1 ? '#3DCB6C' : diff === 0 ? '#7A98BC' : diff === 1 ? '#E5534B' : '#8B0000';
  const labels = diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD' : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;
  return (
    <span style={{ fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1, color:colors, background:`${colors}18`, padding:'2px 7px', borderRadius:4, border:`1px solid ${colors}44` }}>
      {labels}
    </span>
  );
};

Object.assign(window, { NavBar, Btn, Avatar, Modal, Toast, Label, Divider, ScorePill });
