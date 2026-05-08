// Shared.jsx — NavBar, Button, Avatar, Modal, Toast — PlayPal Premium Design System

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg:        '#F6F4EE',
  bgAlt:     '#FFFFFF',
  navBg:     '#0E2B20',
  primary:   '#0E2B20',
  secondary: '#1F3D2E',
  accent:    '#3F5F4A',
  gold:      '#C8A15A',
  goldDim:   '#B8903A',
  text:      '#0E2B20',
  textSub:   '#3F5F4A',
  textMuted: '#8A9E8A',
  border:    '#E7E3D9',
  borderMed: '#D4CFC4',
  error:     '#DC2626',
  errorBg:   'rgba(220,38,38,0.06)',
  errorBdr:  'rgba(220,38,38,0.2)',
  scoreEagle:  '#B45309',
  scoreBirdie: '#15803D',
  scorePar:    '#6B7280',
  scoreBogey:  '#DC2626',
  scoreDouble: '#991B1B',
};
window.PLAYPAL_THEME = T;

// ─── PPLogo — uses the official PlayPal logo image ────────────────────────────
const PPLogo = ({ size = 36 }) => {
  return (
    <img
      src="playpal-logo.png"
      alt="PlayPal Logo"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
};

// ─── QR Modal ─────────────────────────────────────────────────────────────────
const QRModal = ({ open, onClose, syncCode }) => {
  const containerRef = React.useRef(null);
  const instanceRef  = React.useRef(null);
  const lastCodeRef  = React.useRef(null);

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
          colorDark:    '#0E2B20',
          colorLight:   '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M,
        });
        lastCodeRef.current = syncCode;
      } catch(e) { console.error('[PlayPal QR]', e); }
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
        position:       'fixed', inset: 0,
        background:     'rgba(14,43,32,0.75)',
        zIndex:         3000,
        alignItems:     'center', justifyContent: 'center',
        padding:        24,
      }}>
      <div style={{
        background:    '#FFFFFF',
        border:        '1px solid #E7E3D9',
        borderRadius:  24,
        padding:       24,
        maxWidth:      360, width: '100%',
        display:       'flex', flexDirection: 'column',
        alignItems:    'center', gap: 18,
        boxShadow:     '0 20px 60px rgba(14,43,32,0.2)',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
          <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:18, fontWeight:800, color:'#0E2B20', letterSpacing:0.3 }}>
            JOIN THIS ROUND
          </span>
          <button onClick={onClose} style={{
            background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:8,
            color:'#3F5F4A', fontSize:16, cursor:'pointer', width:32, height:32,
            display:'flex', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent',
          }}>✕</button>
        </div>

        <div style={{
          background:     '#F6F4EE', borderRadius:14, padding:12,
          width:'100%', boxSizing:'border-box',
          display:'flex', alignItems:'center', justifyContent:'center',
          lineHeight:0, minHeight:280,
          border: '1px solid #E7E3D9',
        }}>
          <div ref={containerRef} />
        </div>

        <div style={{
          background:   'rgba(200,161,90,0.08)',
          border:       '1px solid rgba(200,161,90,0.3)',
          borderRadius: 14, padding:'10px 20px',
          textAlign:    'center', width:'100%', boxSizing:'border-box',
        }}>
          <div style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, letterSpacing:2.5, color:'#3F5F4A', marginBottom:4, fontWeight:600 }}>
            ROUND CODE
          </div>
          <div style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:32, letterSpacing:6, color:'#C8A15A' }}>
            {syncCode}
          </div>
        </div>

        <div style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A', textAlign:'center', lineHeight:1.6 }}>
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
          <PPLogo size={32} />
          <span style={{ marginLeft:9, lineHeight:1 }}>
            <span style={{ color:'#C8A15A', fontFamily:"'Plus Jakarta Sans', 'Playfair Display', Georgia, serif", fontSize:20, fontWeight:800, letterSpacing:0.3 }}>Play</span><span style={{ color:'#FFFFFF', fontFamily:"'Plus Jakarta Sans', 'Playfair Display', Georgia, serif", fontSize:20, fontWeight:800, letterSpacing:0.3 }}>Pal</span>
          </span>
        </button>
        <div style={navStyles.center} />
        {syncCode && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button
              onClick={() => setShowQR(true)}
              title="Show QR code to join round"
              style={{
                background:  'rgba(255,255,255,0.1)',
                border:      '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding:     '6px 10px',
                cursor:      'pointer',
                display:     'flex', alignItems:'center', justifyContent:'center',
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{ fontSize:18, lineHeight:1 }}>📲</span>
            </button>
            <button onClick={copy} style={navStyles.sync}>
              <span style={{ fontSize:9, color:'rgba(246,244,238,0.6)', letterSpacing:1.5, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600 }}>SYNC</span>
              <span style={{ fontSize:13, fontWeight:900, color:'#C8A15A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', letterSpacing:2 }}>
                {syncCode}
              </span>
              {copied && <span style={{ fontSize:9, color:'#C8A15A', fontWeight:700 }}>✓ COPIED</span>}
            </button>
          </div>
        )}
      </nav>

      {syncCode && (
        <QRModal open={showQR} onClose={() => setShowQR(false)} syncCode={syncCode} />
      )}
    </>
  );
};

const navStyles = {
  bar: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'0 16px', height:56, background:'#0E2B20',
    borderBottom:'1px solid rgba(255,255,255,0.08)', flexShrink:0, zIndex:100, position:'relative',
  },
  logo: {
    background:'none', border:'none', cursor:'pointer',
    padding:0, display:'flex', alignItems:'center',
    WebkitTapHighlightColor:'transparent',
  },
  center: { flex:1 },
  sync: {
    display:'flex', flexDirection:'column', alignItems:'flex-end',
    background:'rgba(200,161,90,0.12)', border:'1px solid rgba(200,161,90,0.3)',
    borderRadius:10, padding:'4px 10px', cursor:'pointer', gap:1,
    WebkitTapHighlightColor:'transparent',
  },
};

// ─── Btn ─────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant='gold', style={}, disabled=false }) => {
  const variants = {
    gold:    { background:'#C8A15A', color:'#0E2B20', fontWeight:800, border:'none', boxShadow:'0 4px 16px rgba(200,161,90,0.30)' },
    green:   { background:'#0E2B20', color:'#F6F4EE', fontWeight:800, border:'none', boxShadow:'0 4px 16px rgba(14,43,32,0.25)' },
    ghost:   { background:'transparent', color:'#0E2B20', border:'1.5px solid #0E2B20', boxShadow:'none' },
    danger:  { background:'#DC2626', color:'#FFFFFF', fontWeight:700, border:'none', boxShadow:'none' },
    surface: { background:'#F0EDE4', color:'#0E2B20', border:'1px solid #E7E3D9', boxShadow:'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      minHeight:52, padding:'13px 24px', borderRadius:14,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:15, letterSpacing:0.3, fontWeight:700,
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
    fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:size*0.35,
    color:player.color, flexShrink:0, letterSpacing:0.5,
  }}>{player.initials}</div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(14,43,32,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:20, padding:24, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(14,43,32,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:18, fontWeight:800, color:'#0E2B20', letterSpacing:0.3 }}>{title}</span>
          <button onClick={onClose} style={{ background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:8, color:'#3F5F4A', fontSize:16, cursor:'pointer', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, type='success' }) => {
  if (!message) return null;
  const colors = { success:'#15803D', error:'#DC2626', info:'#C8A15A' };
  const bgs    = { success:'rgba(21,128,61,0.06)', error:'rgba(220,38,38,0.06)', info:'rgba(200,161,90,0.08)' };
  const bdrs   = { success:'rgba(21,128,61,0.2)', error:'rgba(220,38,38,0.2)', info:'rgba(200,161,90,0.3)' };
  return (
    <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'#FFFFFF', border:`1px solid ${bdrs[type]}`, borderRadius:12, padding:'12px 20px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, zIndex:2000, boxShadow:'0 4px 24px rgba(14,43,32,0.15)' }}>
      <span style={{ color:colors[type], marginRight:8 }}>{type==='success'?'✓':type==='error'?'✕':'ℹ'}</span>
      {message}
    </div>
  );
};

// ─── Label ────────────────────────────────────────────────────────────────────
const Label = ({ children, style={} }) => (
  <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, fontWeight:700, letterSpacing:2, color:'#3F5F4A', textTransform:'uppercase', ...style }}>{children}</span>
);

// ─── Divider ──────────────────────────────────────────────────────────────────
const Divider = ({ label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
    <div style={{ flex:1, height:1, background:'#E7E3D9' }} />
    {label && <Label>{label}</Label>}
    <div style={{ flex:1, height:1, background:'#E7E3D9' }} />
  </div>
);

// ─── ScorePill ────────────────────────────────────────────────────────────────
const ScorePill = ({ diff }) => {
  const colors = diff <= -2 ? '#B45309' : diff === -1 ? '#15803D' : diff === 0 ? '#6B7280' : diff === 1 ? '#DC2626' : '#991B1B';
  const labels = diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD' : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;
  return (
    <span style={{ fontSize:10, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, letterSpacing:0.5, color:colors, background:`${colors}12`, padding:'2px 7px', borderRadius:5, border:`1px solid ${colors}33` }}>
      {labels}
    </span>
  );
};

Object.assign(window, { NavBar, Btn, Avatar, Modal, Toast, Label, Divider, ScorePill, PPLogo, QRModal, PLAYPAL_THEME: T });
