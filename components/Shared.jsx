// Shared.jsx — NavBar, Button, Avatar, Modal, Toast

// PlayPal logo SVG — two golfers fist-bumping over tee
const PPLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="18" cy="27" rx="11" ry="2.5" fill="#0B3D2A"/>
    <ellipse cx="18" cy="27" rx="7" ry="1.5" fill="#0D4A33"/>
    <rect x="17" y="21" width="2.5" height="5.5" rx="1.25" fill="#D4AF47"/>
    <circle cx="18.25" cy="20.5" r="2" fill="#D4AF47"/>
    {/* left golfer green */}
    <circle cx="10.5" cy="10" r="2.5" fill="#2DD97A"/>
    <path d="M9 13 Q10.5 20 10.5 21 L13 21 Q13 17 12 13Z" fill="#2DD97A"/>
    <path d="M9 13 L7 17" stroke="#2DD97A" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M12 13 L14.5 11.5" stroke="#2DD97A" strokeWidth="1.8" strokeLinecap="round"/>
    {/* right golfer white */}
    <circle cx="25.5" cy="10" r="2.5" fill="#FFFFFF"/>
    <path d="M24 13 Q25.5 20 25.5 21 L23 21 Q23 17 24 13Z" fill="#E8EDF4"/>
    <path d="M27 13 L29 17" stroke="#E8EDF4" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M24 13 L21.5 11.5" stroke="#E8EDF4" strokeWidth="1.8" strokeLinecap="round"/>
    {/* fist bump */}
    <rect x="13.5" y="10.5" width="3.5" height="2.5" rx="1.25" fill="#2DD97A"/>
    <rect x="19" y="10.5" width="3.5" height="2.5" rx="1.25" fill="#FFFFFF"/>
    {/* caps */}
    <path d="M8.2 8.5 Q10.5 6.8 12.8 8.5" stroke="#1A5C3A" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
    <path d="M23.2 8.5 Q25.5 6.8 27.8 8.5" stroke="#B8BCC4" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
  </svg>
);

const NavBar = ({ syncCode, onHome, currentScreen }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(syncCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };
  return (
    <nav style={navStyles.bar}>
      <button onClick={onHome} style={navStyles.logo}>
        <PPLogo size={30} />
        <span style={{color:'#FFFFFF', fontFamily:'Barlow Condensed', fontSize:20, fontWeight:800, letterSpacing:2, marginLeft:6}}>PLAYPAL</span>
      </button>
      <div style={navStyles.center} />
      {syncCode && (
        <button onClick={copy} style={navStyles.sync}>
          <span style={{fontSize:9, color:'#7A9EBF', letterSpacing:1.5}}>SYNC</span>
          <span style={{fontSize:13, fontWeight:800, color:'#2DD97A', fontFamily:'Barlow Condensed', letterSpacing:2}}>{syncCode}</span>
          {copied && <span style={{fontSize:9, color:'#2DD97A'}}>✓ COPIED</span>}
        </button>
      )}
    </nav>
  );
};

const navStyles = {
  bar: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:52, background:'#070C16', borderBottom:'1px solid #1F3354', flexShrink:0, zIndex:100, position:'relative' },
  logo: { background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center' },
  center: { flex:1 },
  sync: { display:'flex', flexDirection:'column', alignItems:'flex-end', background:'rgba(45,217,122,0.07)', border:'1px solid rgba(45,217,122,0.2)', borderRadius:8, padding:'4px 10px', cursor:'pointer', gap:1 },
};

const Btn = ({ children, onClick, variant='gold', style={}, disabled=false }) => {
  const variants = {
    gold:    { background:'linear-gradient(135deg,#D4AF47,#B8962E)', color:'#0B0F1A', fontWeight:800, border:'none' },
    green:   { background:'linear-gradient(135deg,#2DD97A,#20B862)', color:'#0B0F1A', fontWeight:800, border:'none' },
    ghost:   { background:'transparent', color:'#9BB4D4', border:'1px solid #1F3354' },
    danger:  { background:'linear-gradient(135deg,#E5534B,#C0392B)', color:'#fff', fontWeight:700, border:'none' },
    surface: { background:'#112240', color:'#fff', border:'1px solid #1F3354' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      minHeight:48, padding:'12px 20px', borderRadius:12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily:'Barlow Condensed', fontSize:16, letterSpacing:1, opacity: disabled ? 0.45 : 1,
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
    background:`${player.color}18`,
    border:`2px solid ${player.color}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'Barlow Condensed', fontWeight:800, fontSize:size*0.35,
    color:player.color, flexShrink:0, letterSpacing:0.5,
  }}>{player.initials}</div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#0F1D35', border:'1px solid #1F3354', borderRadius:18, padding:24, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontFamily:'Barlow Condensed', fontSize:20, fontWeight:700, color:'#fff', letterSpacing:1 }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid #1F3354', borderRadius:8, color:'#7A9EBF', fontSize:18, cursor:'pointer', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Toast = ({ message, type='success' }) => {
  if (!message) return null;
  const colors = { success:'#2DD97A', error:'#E5534B', info:'#D4AF47' };
  return (
    <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'#0F1D35', border:`1px solid ${colors[type]}44`, borderRadius:10, padding:'12px 20px', color:'#fff', fontFamily:'DM Sans', fontSize:14, zIndex:2000, boxShadow:'0 4px 24px rgba(0,0,0,0.6)' }}>
      <span style={{ color:colors[type], marginRight:8 }}>{type==='success'?'✓':type==='error'?'✕':'ℹ'}</span>
      {message}
    </div>
  );
};

const Label = ({ children, style={} }) => (
  <span style={{ fontFamily:'Barlow Condensed', fontSize:10, fontWeight:700, letterSpacing:2.5, color:'#7A9EBF', textTransform:'uppercase', ...style }}>{children}</span>
);

const Divider = ({ label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
    <div style={{ flex:1, height:1, background:'#1F3354' }} />
    {label && <Label>{label}</Label>}
    <div style={{ flex:1, height:1, background:'#1F3354' }} />
  </div>
);

const ScorePill = ({ diff }) => {
  const colors = diff <= -2 ? '#FFD700' : diff === -1 ? '#2DD97A' : diff === 0 ? '#7A9EBF' : diff === 1 ? '#E5534B' : '#8B0000';
  const labels = diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD' : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;
  return (
    <span style={{ fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1, color:colors, background:`${colors}18`, padding:'2px 7px', borderRadius:4, border:`1px solid ${colors}44` }}>
      {labels}
    </span>
  );
};

Object.assign(window, { NavBar, Btn, Avatar, Modal, Toast, Label, Divider, ScorePill, PPLogo });
