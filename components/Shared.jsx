// Shared.jsx — NavBar, Button, Avatar, Modal, Toast

// ─── Self-contained QR Code generator (SVG output, no CDN required) ──────────
// Encodes a URL as a QR code SVG string. Version 2, EC Level M, Mask 2.
// Sufficient for URLs up to ~34 bytes (covers all PlayPal join URLs).
(function() {
  if (window.__ppQRGenerate) return;

  // Galois Field GF(256) tables
  const EXP = new Uint8Array(512);
  const LOG  = new Uint8Array(256);
  (function() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const gfMul = (a, b) => (a && b) ? EXP[(LOG[a] + LOG[b]) % 255] : 0;

  function gfPoly(degree) {
    let p = [1];
    for (let i = 0; i < degree; i++) {
      const q = [1, EXP[i]];
      const r = new Array(p.length + q.length - 1).fill(0);
      for (let j = 0; j < p.length; j++)
        for (let k = 0; k < q.length; k++)
          r[j + k] ^= gfMul(p[j], q[k]);
      p = r;
    }
    return p;
  }

  function rsEncode(data, nec) {
    const gen = gfPoly(nec);
    const msg = data.concat(new Array(nec).fill(0));
    for (let i = 0; i < data.length; i++) {
      const c = msg[i];
      if (c) for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], c);
    }
    return msg.slice(data.length);
  }

  const SZ = 25; // Version 2 = 17 + 2*4

  function makeMatrix() {
    const m = Array.from({length: SZ}, () => new Int8Array(SZ).fill(-1));

    // Finder pattern at (r, c) top-left corner
    function finder(r, c) {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const row = r + dr, col = c + dc;
        if (row < 0 || row >= SZ || col < 0 || col >= SZ) continue;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const inSep    = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        if (inSep)        m[row][col] = 0;
        else if (onBorder || inCenter) m[row][col] = 1;
        else              m[row][col] = 0;
      }
    }
    finder(0, 0); finder(0, SZ - 7); finder(SZ - 7, 0);

    // Timing strips
    for (let i = 8; i <= SZ - 9; i++) {
      m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Dark module (version 2)
    m[4 * 2 + 9][8] = 1;

    return m;
  }

  function encodeBytes(text) {
    // UTF-8 encode
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80)       bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
      else                { bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f)); }
    }

    // Build bit stream — version 2, EC M: 28 data codewords
    const bits = [];
    const pushBits = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    pushBits(0b0100, 4);        // byte mode indicator
    pushBits(bytes.length, 8);  // character count
    bytes.forEach(b => pushBits(b, 8));
    // Terminator (up to 4 zero bits)
    for (let i = 0; i < 4 && bits.length < 224; i++) bits.push(0);
    // Pad to byte boundary
    while (bits.length % 8) bits.push(0);
    // Pad codewords
    const PAD = [0xec, 0x11];
    let pi = 0;
    while (bits.length < 224) pushBits(PAD[pi++ % 2], 8);

    // Pack bits to bytes
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
      data.push(b);
    }
    return data.concat(rsEncode(data, 16)); // 16 EC codewords for v2 M
  }

  function placeAndMask(matrix, codewords) {
    const bits = [];
    codewords.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });

    let bi = 0;
    // Mask pattern 2: row % 2 === 0
    const maskFn = (r) => r % 2 === 0;

    // Data placement: right-to-left column pairs, alternating up/down
    let upward = true;
    for (let right = SZ - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip vertical timing column
      for (let vert = 0; vert < SZ; vert++) {
        const row = upward ? (SZ - 1 - vert) : vert;
        for (let d = 0; d < 2; d++) {
          const col = right - d;
          if (col < 0 || matrix[row][col] !== -1) continue;
          const bit = bi < bits.length ? bits[bi++] : 0;
          matrix[row][col] = bit ^ (maskFn(row) ? 1 : 0);
        }
      }
      upward = !upward;
    }

    // Format information: version 2, EC=M (bits 01), mask=2 (bits 010)
    // Format bits before masking with 101010000010010: 01 010 → 01010 → with BCH → 010000100100101
    // Pre-computed for EC=M mask=2: 101000100100101
    const fmt = [1,0,1,0,0,0,1,0,0,1,0,0,1,0,1];
    // Top-left area
    for (let i = 0; i <= 5; i++) { matrix[8][i] = fmt[i]; matrix[i][8] = fmt[14 - i]; }
    matrix[8][7] = fmt[6]; matrix[7][8] = fmt[8]; matrix[8][8] = fmt[7];
    // Bottom-left / top-right
    for (let i = 0; i < 7; i++) {
      matrix[SZ - 1 - i][8] = fmt[i];
      matrix[8][SZ - 1 - i] = fmt[14 - i];
    }

    return matrix;
  }

  window.__ppQRGenerate = function(text, cellPx) {
    cellPx = cellPx || 9;
    try {
      const codewords = encodeBytes(text);
      const matrix    = placeAndMask(makeMatrix(), codewords);
      const quiet     = 4;
      const dim       = (SZ + quiet * 2) * cellPx;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}">`;
      svg += `<rect width="${dim}" height="${dim}" fill="#fff"/>`;
      for (let r = 0; r < SZ; r++) {
        for (let c = 0; c < SZ; c++) {
          if (matrix[r][c] === 1) {
            svg += `<rect x="${(c + quiet) * cellPx}" y="${(r + quiet) * cellPx}" width="${cellPx}" height="${cellPx}" fill="#0A1628"/>`;
          }
        }
      }
      svg += '</svg>';
      return svg;
    } catch(e) {
      console.error('[PlayPal QR]', e);
      return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f00" opacity="0.2"/><text x="100" y="100" text-anchor="middle" fill="#E5534B" font-size="12">QR Error</text></svg>';
    }
  };
})();

// ─── QR Modal ────────────────────────────────────────────────────────────────
const QRModal = ({ open, onClose, syncCode }) => {
  if (!open || !syncCode) return null;

  const base    = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  const joinUrl = base + 'join.html?code=' + syncCode;
  const qrSvg   = window.__ppQRGenerate ? window.__ppQRGenerate(joinUrl, 9) : '';

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:3000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
      }}>
      <div style={{
        background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:20,
        padding:28, maxWidth:380, width:'100%',
        display:'flex', flexDirection:'column', alignItems:'center', gap:20,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
          <span style={{
            fontFamily:'Barlow Condensed', fontSize:20, fontWeight:800,
            color:'#fff', letterSpacing:1,
          }}>JOIN THIS ROUND</span>
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'#7A98BC',
            fontSize:22, cursor:'pointer', lineHeight:1, padding:'0 4px',
            WebkitTapHighlightColor:'transparent',
          }}>✕</button>
        </div>

        <div
          style={{
            background:'#fff', borderRadius:14, padding:14, width:'100%',
            boxSizing:'border-box', display:'flex', alignItems:'center', justifyContent:'center',
            lineHeight:0,
          }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <div style={{
          background:'rgba(61,203,108,0.07)', border:'1px solid rgba(61,203,108,0.25)',
          borderRadius:10, padding:'10px 20px', textAlign:'center',
          width:'100%', boxSizing:'border-box',
        }}>
          <div style={{
            fontFamily:'Barlow Condensed', fontSize:11, letterSpacing:2,
            color:'#7A98BC', marginBottom:4,
          }}>ROUND CODE</div>
          <div style={{
            fontFamily:'Barlow Condensed', fontWeight:900, fontSize:34,
            letterSpacing:6, color:'#3DCB6C',
          }}>{syncCode}</div>
        </div>

        <div style={{
          fontFamily:'DM Sans', fontSize:12, color:'#7A98BC',
          textAlign:'center', lineHeight:1.6,
        }}>
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
          <span style={{
            color:'#3DCB6C', fontFamily:'Barlow Condensed',
            fontSize:22, fontWeight:800, letterSpacing:1,
          }}>🏌️ PLAYPAL</span>
        </button>
        <div style={navStyles.center} />
        {syncCode && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button
              onClick={() => setShowQR(true)}
              title="Show QR code to join round"
              style={{
                background:'rgba(61,203,108,0.07)',
                border:'1px solid rgba(61,203,108,0.2)',
                borderRadius:8, padding:'6px 10px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                WebkitTapHighlightColor:'transparent',
              }}>
              <span style={{ fontSize:18, lineHeight:1 }}>📲</span>
            </button>
            <button onClick={copy} style={navStyles.sync}>
              <span style={{ fontSize:10, color:'#7A98BC', letterSpacing:1 }}>SYNC</span>
              <span style={{
                fontSize:13, fontWeight:700, color:'#3DCB6C',
                fontFamily:'Barlow Condensed', letterSpacing:2,
              }}>{syncCode}</span>
              {copied && <span style={{ fontSize:10, color:'#3DCB6C' }}>✓ COPIED</span>}
            </button>
          </div>
        )}
      </nav>

      <QRModal
        open={showQR}
        onClose={() => setShowQR(false)}
        syncCode={syncCode}
      />
    </>
  );
};

const navStyles = {
  bar: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'0 16px', height:48, background:'#050E1C',
    borderBottom:'1px solid #1E3A6E', flexShrink:0, zIndex:100, position:'relative',
  },
  logo: {
    background:'none', border:'none', cursor:'pointer',
    padding:0, display:'flex', alignItems:'center', gap:6,
  },
  center: { flex:1 },
  sync: {
    display:'flex', flexDirection:'column', alignItems:'flex-end',
    background:'rgba(61,203,108,0.07)', border:'1px solid rgba(61,203,108,0.2)',
    borderRadius:8, padding:'4px 10px', cursor:'pointer', gap:1,
  },
};

const Btn = ({ children, onClick, variant = 'gold', style = {}, disabled = false }) => {
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
      fontFamily:'Barlow Condensed', fontSize:16, letterSpacing:1,
      opacity: disabled ? 0.5 : 1,
      transition:'transform 0.1s, opacity 0.1s',
      WebkitTapHighlightColor:'transparent',
      ...variants[variant], ...style,
    }}
    onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
    onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >{children}</button>
  );
};

const Avatar = ({ player, size = 40 }) => (
  <div style={{
    width:size, height:size, borderRadius:'50%',
    background:`linear-gradient(135deg, ${player.color}33, ${player.color}66)`,
    border:`2px solid ${player.color}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'Barlow Condensed', fontWeight:800, fontSize:size * 0.35,
    color:player.color, flexShrink:0, letterSpacing:0.5,
  }}>{player.initials}</div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
      zIndex:1000, display:'flex', alignItems:'center',
      justifyContent:'center', padding:20,
    }}>
      <div style={{
        background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:16,
        padding:24, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto',
      }}>
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:20,
        }}>
          <span style={{
            fontFamily:'Barlow Condensed', fontSize:20, fontWeight:700,
            color:'#fff', letterSpacing:1,
          }}>{title}</span>
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'#7A98BC',
            fontSize:22, cursor:'pointer',
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Toast = ({ message, type = 'success' }) => {
  if (!message) return null;
  const colors = { success:'#3DCB6C', error:'#E5534B', info:'#C9A84C' };
  return (
    <div style={{
      position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)',
      background:'#0F2040', border:`1px solid ${colors[type]}`, borderRadius:10,
      padding:'12px 20px', color:'#fff', fontFamily:'DM Sans', fontSize:14,
      zIndex:2000, boxShadow:'0 4px 24px rgba(0,0,0,0.4)',
    }}>
      <span style={{ color:colors[type], marginRight:8 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      {message}
    </div>
  );
};

const Label = ({ children, style = {} }) => (
  <span style={{
    fontFamily:'Barlow Condensed', fontSize:11, fontWeight:600,
    letterSpacing:2, color:'#7A98BC', textTransform:'uppercase', ...style,
  }}>{children}</span>
);

const Divider = ({ label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
    <div style={{ flex:1, height:1, background:'#1E3A6E' }} />
    {label && <Label>{label}</Label>}
    <div style={{ flex:1, height:1, background:'#1E3A6E' }} />
  </div>
);

const ScorePill = ({ diff }) => {
  const colors = diff <= -2 ? '#FFD700' : diff === -1 ? '#3DCB6C' : diff === 0 ? '#7A98BC' : diff === 1 ? '#E5534B' : '#8B0000';
  const labels = diff <= -3 ? 'ALB' : diff === -2 ? 'EGL' : diff === -1 ? 'BRD' : diff === 0 ? 'PAR' : diff === 1 ? 'BOG' : diff === 2 ? 'DBL' : `+${diff}`;
  return (
    <span style={{
      fontSize:10, fontFamily:'Barlow Condensed', fontWeight:700, letterSpacing:1,
      color:colors, background:`${colors}18`, padding:'2px 7px',
      borderRadius:4, border:`1px solid ${colors}44`,
    }}>
      {labels}
    </span>
  );
};

Object.assign(window, { NavBar, Btn, Avatar, Modal, Toast, Label, Divider, ScorePill, QRModal });
