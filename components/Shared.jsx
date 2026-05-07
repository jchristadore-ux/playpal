// Shared.jsx — NavBar, Button, Avatar, Modal, Toast

// PlayPal logo — gold coin with golf cup and teal flag
const PPLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="ppCoinGrad" cx="40%" cy="35%" r="65%">
        <stop offset="0%"   stopColor="#F0C84A"/>
        <stop offset="45%"  stopColor="#C8A84B"/>
        <stop offset="100%" stopColor="#8A6A10"/>
      </radialGradient>
      <radialGradient id="ppCoinSheen" cx="30%" cy="25%" r="55%">
        <stop offset="0%"   stopColor="#FFF1A0" stopOpacity="0.45"/>
        <stop offset="100%" stopColor="#FFF1A0" stopOpacity="0"/>
      </radialGradient>
    </defs>
    {/* Coin body */}
    <circle cx="18" cy="18" r="15" fill="url(#ppCoinGrad)"/>
    {/* Milled-edge notch marks */}
    {Array.from({length:16}).map((_,i) => {
      const angle = (i * 22.5 * Math.PI) / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return <line key={i}
        x1={18 + 12.8 * cos} y1={18 + 12.8 * sin}
        x2={18 + 14.6 * cos} y2={18 + 14.6 * sin}
        stroke="#7A5C08" strokeWidth="1.3" strokeLinecap="round"/>;
    })}
    {/* Coin sheen */}
    <circle cx="18" cy="18" r="15" fill="url(#ppCoinSheen)"/>
    {/* Rim */}
    <circle cx="18" cy="18" r="15" stroke="#7A5C08" strokeWidth="0.5" fill="none"/>
    {/* Golf cup/hole */}
    <ellipse cx="18" cy="20" rx="5" ry="3.2" fill="#0A0A0A"/>
    <ellipse cx="18" cy="20" rx="3.5" ry="2" fill="none" stroke="#2A2A2A" strokeWidth="0.5"/>
    {/* Flagpole */}
    <rect x="17.25" y="2" width="1.5" height="18" rx="0.75" fill="#2BBFB0"/>
    {/* Flag */}
    <polygon points="18.75,2 27,6 18.75,10" fill="#2BBFB0"/>
  </svg>
);

// ─── QR Modal ─────────────────────────────────────────────────────────────────
const QRModal = ({ open, onClose, syncCode }) => {
  const containerRef  = React.useRef(null);
  const instanceRef   = React.useRef(null);
  const lastCodeRef   = React.useRef(null);

  React.useEffect(() => {
    if (!open || !syncCode) return;
    if (!containerRef.current) return;
    if (lastCodeRef.current === syncCode && instanceRef.current) return;

    const base    = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    const joinUrl = base + 'join.html?code=' + syncCode;

    const render = () => {
      if (!window.QRCode) return false;
      containerRef.current.innerHTML = '';
      instanceRef.current = null;
      try {
        instanceRef.current = new window.QRCode(containerRef.current, {
          text:         joinUrl,
          width:        256,
          height:       256,
          colorDark:    '#000000',
          colorLight:   '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M,
        });
        lastCodeRef.current = syncCode;
      } catch(e) {
        console.error('[PlayPal QR]', e);
      }
      return true;
    };

    if (!render()) {
      const interval = setInterval(() => { if (render()) clearInterval(interval); }, 150);
      const timeout  = setTimeout(() => clearInterval(interval), 10000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [open, syncCode]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        display:        open ? 'flex' : 'none',
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.88)',
        zIndex:         3000,
        alignItems:     'center',
        justifyContent: 'center',
        padding:        24,
      }}>
      <div style={{
        background:     '#1E1E1E',
        border:         '1px solid #2A2A2A',
        borderRadius:   20,
        padding:        24,
        maxWidth:       360,
        width:          '100%',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            18,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
          <span style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:18, fontWeight:800, color:'#F5F5F5', letterSpacing:0.5 }}>
            JOIN THIS ROUND
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border:'1px solid #2A2A2A', borderRadius:8,
            color:'#A0A0A0', fontSize:18, cursor:'pointer', width:32, height:32,
            display:'flex', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent',
          }}>✕</button>
        </div>

        <div style={{
          background:     '#ffffff',
          borderRadius:   14,
          padding:        12,
          width:          '100%',
          boxSizing:      'border-box',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          lineHeight:     0,
          minHeight:      280,
        }}>
          <div ref={containerRef} />
        </div>

        <div style={{
          background:   'rgba(0,168,107,0.07)',
          border:       '1px solid rgba(0,168,107,0.25)',
          borderRadius: 12,
          padding:      '10px 20px',
          textAlign:    'center',
          width:        '100%',
          boxSizing:    'border-box',
        }}>
          <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:10, letterSpacing:2.5, color:'#A0A0A0', marginBottom:4, fontWeight:600 }}>
            ROUND CODE
          </div>
          <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontWeight:900, fontSize:32, letterSpacing:6, color:'#00A86B' }}>
            {syncCode}
          </div>
        </div>

        <div style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:12, color:'#A0A0A0', textAlign:'center', lineHeight:1.6 }}>
          Scan with any camera app — or share the code above.
        </div>
      </div>
    </div>
  );
};

// ─── NavBar ───────────────────────────────────────────────────────────────────
const NavBar = ({ syncCode, onHome, currentScreen }) => {
  const [copied, setCopied] = React.useState(false);
  const [showQR, setShowQR] = React.useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(syncCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <nav style={navStyles.bar}>
        <button onClick={onHome} style={navStyles.logo}>
          <PPLogo size={30} />
          <span style={{ marginLeft:8, lineHeight:1 }}>
            <span style={{ color:'#C8A84B', fontFamily:"'Playfair Display', Georgia, serif", fontSize:19, fontWeight:800, letterSpacing:0.5 }}>Play</span><span style={{ color:'#8A95B0', fontFamily:"'Playfair Display', Georgia, serif", fontSize:19, fontWeight:800, letterSpacing:0.5 }}>Pal</span>
          </span>
        </button>
        <div style={navStyles.center} />
        {syncCode && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button
              onClick={() => setShowQR(true)}
              title="Show QR code to join round"
              style={{
                background:  'rgba(0,168,107,0.08)',
                border:      '1px solid rgba(0,168,107,0.2)',
                borderRadius: 10,
                padding:     '6px 10px',
                cursor:      'pointer',
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{ fontSize:18, lineHeight:1 }}>📲</span>
            </button>
            <button onClick={copy} style={navStyles.sync}>
              <span style={{ fontSize:9, color:'#A0A0A0', letterSpacing:1.5, fontFamily:'Inter, system-ui, sans-serif', fontWeight:600 }}>SYNC</span>
              <span style={{ fontSize:13, fontWeight:900, color:'#00A86B', fontFamily:'Inter, system-ui, sans-serif', letterSpacing:2 }}>
                {syncCode}
              </span>
              {copied && <span style={{ fontSize:9, color:'#00A86B', fontWeight:700 }}>✓ COPIED</span>}
            </button>
          </div>
        )}
      </nav>

      {syncCode && (
        <QRModal
          open={showQR}
          onClose={() => setShowQR(false)}
          syncCode={syncCode}
        />
      )}
    </>
  );
};

const navStyles = {
  bar: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'0 16px', height:54, background:'#0D0D0D',
    borderBottom:'1px solid #2A2A2A', flexShrink:0, zIndex:100, position:'relative',
  },
  logo: {
    background:'none', border:'none', cursor:'pointer',
    padding:0, display:'flex', alignItems:'center',
  },
  center: { flex:1 },
  sync: {
    display:'flex', flexDirection:'column', alignItems:'flex-end',
    background:'rgba(0,168,107,0.07)', border:'1px solid rgba(0,168,107,0.2)',
    borderRadius:10, padding:'4px 10px', cursor:'pointer', gap:1,
  },
};

// ─── Btn ─────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant='gold', style={}, disabled=false }) => {
  const variants = {
    gold:    { background:'#D4AF37', color:'#0D0D0D', fontWeight:800, border:'none', boxShadow:'0 4px 16px rgba(212,175,55,0.30)' },
    green:   { background:'#00A86B', color:'#F5F5F5', fontWeight:800, border:'none', boxShadow:'0 4px 16px rgba(0,168,107,0.35)' },
    ghost:   { background:'transparent', color:'#00A86B', border:'1.5px solid #00A86B', boxShadow:'none' },
    danger:  { background:'#FF6B6B', color:'#F5F5F5', fontWeight:700, border:'none', boxShadow:'none' },
    surface: { background:'#252525', color:'#F5F5F5', border:'1px solid #2A2A2A', boxShadow:'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      minHeight:56, padding:'14px 24px', borderRadius:18,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily:'Inter, system-ui, sans-serif', fontSize:15, letterSpacing:0.5, fontWeight:700,
      opacity: disabled ? 0.45 : 1,
      transition:'transform 0.1s, box-shadow 0.1s',
      WebkitTapHighlightColor:'transparent',
      ...variants[variant], ...style,
    }}
    onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
    onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >{children}</button>
  );
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ player, size=40 }) => (
  <div style={{
    width:size, height:size, borderRadius:'50%',
    background:`${player.color}18`,
    border:`2px solid ${player.color}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'Inter, system-ui, sans-serif', fontWeight:800, fontSize:size*0.35,
    color:player.color, flexShrink:0, letterSpacing:0.5,
  }}>{player.initials}</div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#1E1E1E', border:'1px solid #2A2A2A', borderRadius:20, padding:24, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:18, fontWeight:800, color:'#F5F5F5', letterSpacing:0.3 }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid #2A2A2A', borderRadius:8, color:'#A0A0A0', fontSize:18, cursor:'pointer', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, type='success' }) => {
  if (!message) return null;
  const colors = { success:'#00A86B', error:'#FF6B6B', info:'#D4AF37' };
  return (
    <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'#1E1E1E', border:`1px solid ${colors[type]}44`, borderRadius:12, padding:'12px 20px', color:'#F5F5F5', fontFamily:'Inter, system-ui, sans-serif', fontSize:14, zIndex:2000, boxShadow:'0 4px 24px rgba(0,0,0,0.6)' }}>
      <span style={{ color:colors[type], marginRight:8 }}>{type==='success'?'✓':type==='error'?'✕':'ℹ'}</span>
      {message}
    </div>
  );
};

// ─── Label ────────────────────────────────────────────────────────────────────
const Label = ({ children, style={} }) => (
  <span style={{ fontFamily:'Inter, system-ui, sans-serif', fontSize:10, fontWeight:700, letterSpacing:2, color:'#A0A0A0', textTransform:'uppercase', ...style }}>{children}</span>
);

// ─── Divider ──────────────────────────────────────────────────────────────────
const Divider = ({ label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
    <div style={{ flex:1, height:1, background:'#2A2A2A' }} />
    {label && <Label>{label}</Label>}
    <div style={{ flex:1, height:1, background:'#2A2A2A' }} />
  </div>
);

// ─── ScorePill ────────────────────────────────────────────────────────────────
const ScorePill = ({ diff }) => {
  const colors = diff <= -2 ? '#D4AF37' : diff === -1 ? '#4ADE80' : diff === 0 ? '#A0A0A0' : diff === 1 ? '#FF6B6B' : '#CC3333';
  const labels = diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD' : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;
  return (
    <span style={{ fontSize:10, fontFamily:'Inter, system-ui, sans-serif', fontWeight:700, letterSpacing:0.5, color:colors, background:`${colors}18`, padding:'2px 7px', borderRadius:5, border:`1px solid ${colors}44` }}>
      {labels}
    </span>
  );
};

Object.assign(window, { NavBar, Btn, Avatar, Modal, Toast, Label, Divider, ScorePill, PPLogo, QRModal });
