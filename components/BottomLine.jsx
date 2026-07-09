// BottomLine.jsx — the EGT Bottom Line: an always-on, ESPN-style broadcast
// ticker for TV displays. Subscribes to every realtime data source PlayPal
// has (Firestore rounds + trips, RTDB players), recomputes cached facts via
// BottomLineProvider only when data actually changes, and scrolls the feed
// right-to-left forever with a requestAnimationFrame engine (transform-only,
// 60fps, no layout work per frame). Alerts diffed between snapshots inject
// breaking-news cards into the stream and flash the banner.
//
// The scrolling strip is managed imperatively (DOM nodes appended/recycled
// off a queue) because React reconciliation per frame would fight the rAF
// loop; React owns everything else on the page.

/* eslint-disable no-undef */

const BL = (() => {
  const COLORS = {
    bg: '#05090C', strip: '#0A1114', stripEdge: '#0E2B20',
    text: '#F6F4EE', dim: 'rgba(246,244,238,0.55)', gold: '#C8A15A',
    up: '#3DCB6C', down: '#F26D6D', hot: '#FFB84D',
    divider: 'rgba(246,244,238,0.14)',
  };
  const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
  return { COLORS, FONT };
})();

// ── Imperative ticker engine ─────────────────────────────────────────────────
// Cycles an array of segments forever. setFeed() swaps the source array
// without interrupting the scroll: already-rendered cards keep moving, new
// data enters from the right. pushAlerts() queues cards to appear next.
function TickerEngine(trackEl, opts) {
  let feed = [];          // current segment list (looped)
  let feedIdx = 0;
  let priority = [];      // alert segments to inject next
  let x = 0;              // current translateX (negative = scrolled left)
  let rightEdge = 0;      // x-position (track coords) where the next card goes
  let speed = opts.speed || 150; // px/sec
  let paused = false;
  let raf = null, lastT = 0;
  const nodes = [];       // { el, left, width, segId, textKey }

  function setSpeed(v) { speed = v; }
  function setPaused(v) { paused = v; }

  function setFeed(next) {
    feed = next || [];
    if (feedIdx >= feed.length) feedIdx = 0;
    // Refresh cards already on screen whose segment content changed: flash it.
    const byId = {};
    feed.forEach(s => { byId[s.id] = s; });
    nodes.forEach(n => {
      const s = byId[n.segId];
      if (!s) return;
      const key = JSON.stringify(s.parts);
      if (n.textKey !== key) {
        const fresh = opts.renderSegment(s);
        fresh.style.position = 'absolute';
        fresh.style.left = n.left + 'px';
        fresh.classList.add('bl-flash');
        trackEl.replaceChild(fresh, n.el);
        n.el = fresh;
        n.textKey = key;
        // width may drift slightly; measured lazily on next fill
      }
    });
  }

  function pushAlerts(alerts) {
    if (!alerts || !alerts.length) return;
    // Cards buffered beyond the right edge of the viewport aren't visible yet —
    // pull them back (and rewind the feed cursor) so breaking news scrolls in
    // next. Off-screen removal means no visible jump.
    const viewW = trackEl.parentElement ? trackEl.parentElement.offsetWidth : 1920;
    while (nodes.length && nodes[nodes.length - 1].left + x > viewW + 40) {
      const n = nodes.pop();
      trackEl.removeChild(n.el);
      rightEdge = n.left;
      if (n.seg && n.seg.alert) priority.unshift(n.seg);
      else if (feed.length) feedIdx = (feedIdx - 1 + feed.length) % feed.length;
    }
    priority.push(...alerts);
    if (priority.length > 12) priority = priority.slice(-12);
  }

  function nextSegment() {
    if (priority.length) return priority.shift();
    if (!feed.length) return null;
    const s = feed[feedIdx % feed.length];
    feedIdx = (feedIdx + 1) % feed.length;
    return s;
  }

  function fill(viewW) {
    // Keep cards appended until the track extends one viewport past the right edge.
    let guard = 0;
    while (rightEdge + x < viewW * 1.4 && guard++ < 60) {
      const seg = nextSegment();
      if (!seg) break;
      const el = opts.renderSegment(seg);
      el.style.position = 'absolute';
      el.style.left = rightEdge + 'px';
      trackEl.appendChild(el);
      const w = el.offsetWidth;
      nodes.push({ el, left: rightEdge, width: w, seg, segId: seg.id, textKey: JSON.stringify(seg.parts) });
      rightEdge += w;
    }
  }

  function recycle() {
    // Drop cards fully off the left edge, then rebase coordinates so the
    // numbers never grow unbounded. Rebase + transform land in the same
    // frame, so there is no visual jump.
    let dropped = 0;
    while (nodes.length && nodes[0].left + nodes[0].width + x < -60) {
      const n = nodes.shift();
      trackEl.removeChild(n.el);
      dropped = n.left + n.width;
    }
    if (dropped > 0) {
      nodes.forEach(n => { n.left -= dropped; n.el.style.left = n.left + 'px'; });
      rightEdge -= dropped;
      x += dropped;
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!lastT) { lastT = t; return; }
    const dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    const viewW = trackEl.parentElement ? trackEl.parentElement.offsetWidth : 1920;
    if (!paused) x -= speed * dt;
    fill(viewW);
    recycle();
    trackEl.style.transform = `translate3d(${x}px,0,0)`;
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; lastT = 0; }

  return { setFeed, pushAlerts, setSpeed, setPaused, start, stop };
}

// ── Segment card renderer (plain DOM — used inside the rAF strip) ───────────
function renderSegmentNode(seg) {
  const C = BL.COLORS;
  const card = document.createElement('div');
  card.className = 'bl-card' + (seg.alert ? ' bl-alert' : '');

  const label = document.createElement('div');
  label.className = 'bl-label' + (seg.alert ? ` bl-label-${seg.tone || 'hot'}` : '');
  label.textContent = `${seg.icon || ''} ${seg.label || ''}`.trim();
  card.appendChild(label);

  const line = document.createElement('div');
  line.className = 'bl-line';
  (seg.parts || []).forEach(part => {
    const span = document.createElement('span');
    switch (part.t) {
      case 'name': span.className = 'bl-name'; break;
      case 'val':  span.className = 'bl-val';  break;
      case 'up':   span.className = 'bl-up';   break;
      case 'down': span.className = 'bl-down'; break;
      case 'dim':  span.className = 'bl-dim';  break;
      case 'sep':  span.className = 'bl-sep'; span.textContent = '•'; line.appendChild(span); return;
      default:     span.className = 'bl-text';
    }
    span.textContent = part.s;
    line.appendChild(span);
  });
  card.appendChild(line);

  const divider = document.createElement('div');
  divider.className = 'bl-divider';
  card.appendChild(divider);
  return card;
}

// ── Realtime world subscriptions ─────────────────────────────────────────────
// Feeds raw data into onWorld({docs, trips, players}) whenever anything changes.
function subscribeWorld(onWorld) {
  const world = { docs: [], trips: [], players: [], egtSeed: window.EGT_SEED || null };
  let scheduled = null;
  const emit = () => {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = null; onWorld(Object.assign({}, world, { now: Date.now() })); }, 400);
  };

  // Emit immediately so the ticker starts on the EGT seed (schedule, courses)
  // even before — or without — a network connection; live data layers in.
  emit();

  if (!window.firebase || !window.PLAYPAL_FIREBASE_CONFIG) return () => {};
  const app = window.firebase.apps.length
    ? window.firebase.apps[0]
    : window.firebase.initializeApp(window.PLAYPAL_FIREBASE_CONFIG);
  const unsubs = [];

  window.firebase.auth().signInAnonymously().then(() => {
    const fs = window.firebase.firestore();
    unsubs.push(fs.collection('playpal_rounds').onSnapshot(snap => {
      const docs = [];
      snap.forEach(d => docs.push(d.data()));
      world.docs = docs;
      emit();
    }, err => console.warn('[BottomLine] rounds listener error:', err)));

    unsubs.push(fs.collection('golf_trips').onSnapshot(snap => {
      const trips = [];
      snap.forEach(d => trips.push(d.data()));
      world.trips = trips;
      emit();
    }, err => console.warn('[BottomLine] trips listener error:', err)));

    const db = window.firebase.database();
    const ref = db.ref('players');
    const cb = ref.on('value', snap => {
      const val = snap.val();
      world.players = val ? Object.values(val) : [];
      emit();
    }, err => console.warn('[BottomLine] players listener error:', err));
    unsubs.push(() => ref.off('value', cb));
  }).catch(err => {
    console.warn('[BottomLine] Firebase auth failed:', err && err.message);
    onWorld(Object.assign({}, world, { now: Date.now() }));
  });

  return () => { unsubs.forEach(u => { try { u(); } catch (e) {} }); };
}

// ── Page ─────────────────────────────────────────────────────────────────────
const BottomLinePage = () => {
  const C = BL.COLORS;
  const trackRef = React.useRef(null);
  const engineRef = React.useRef(null);
  const factsRef = React.useRef(null);

  const [clock, setClock] = React.useState('');
  const [dateLine, setDateLine] = React.useState('');
  const [headline, setHeadline] = React.useState(null);   // {title, sub}
  const [liveCount, setLiveCount] = React.useState(0);
  const [banner, setBanner] = React.useState(null);        // breaking alert
  const [speed, setSpeed] = React.useState(() => Number(localStorage.getItem('bl_speed')) || 150);
  const [showControls, setShowControls] = React.useState(false);
  const bannerTimer = React.useRef(null);
  const controlsTimer = React.useRef(null);

  // Clock.
  React.useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
      setDateLine(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase());
    };
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  }, []);

  // Ticker engine.
  React.useEffect(() => {
    const engine = TickerEngine(trackRef.current, { speed, renderSegment: renderSegmentNode });
    engineRef.current = engine;
    engine.start();
    return () => engine.stop();
  }, []);

  React.useEffect(() => {
    if (engineRef.current) engineRef.current.setSpeed(speed);
    localStorage.setItem('bl_speed', String(speed));
  }, [speed]);

  // Realtime world → cached facts → feed (+ alert diffing).
  React.useEffect(() => {
    const provider = window.BottomLineProvider;
    if (!provider) return;
    const unsub = subscribeWorld(world => {
      let facts;
      try { facts = provider.computeFacts(world); } catch (e) { console.warn('[BottomLine] compute failed:', e); return; }
      const prev = factsRef.current;
      factsRef.current = facts;

      const feed = provider.buildFeed(facts);
      if (engineRef.current) engineRef.current.setFeed(feed);

      const alerts = provider.diffAlerts(prev, facts);
      if (alerts.length && engineRef.current) {
        engineRef.current.pushAlerts(alerts);
        const a = alerts[alerts.length - 1];
        setBanner(a);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setBanner(null), 8000);
      }

      // Header headline: what's happening right now.
      setLiveCount(facts.liveRounds.length);
      const live = facts.liveRounds[0];
      if (live) {
        const leader = live.lines[0];
        setHeadline({
          title: `LIVE · ${live.course.name.toUpperCase()}`,
          sub: leader
            ? `${leader.name} leads at ${provider.fmtToPar(leader.toPar)}${leader.thru < live.course.holes.length ? ` thru ${leader.thru}` : ''}`
            : 'Round underway',
        });
      } else if (facts.egt && facts.egt.live && facts.egt.live.standings && facts.egt.live.standings.length) {
        const s = facts.egt.live.standings[0];
        setHeadline({ title: facts.egt.model.trip.name, sub: `${s.name} leads the Cup · ${s.points} pts` });
      } else if (facts.egt && facts.egt.model) {
        setHeadline({ title: facts.egt.model.trip.name, sub: facts.egt.model.trip.venue || '' });
      } else {
        setHeadline(null);
      }
    });
    return unsub;
  }, []);

  // Auto-hiding controls (mouse move shows them; TVs never see a cursor).
  const pokeControls = React.useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  };

  return (
    <div
      onMouseMove={pokeControls}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: `radial-gradient(120% 90% at 50% 0%, #0B1B14 0%, ${C.bg} 62%)`,
        color: C.text, fontFamily: BL.FONT, overflow: 'hidden', cursor: showControls ? 'default' : 'none',
      }}>

      {/* ── Broadcast header ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2vh', padding: '2vh 4vw', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2vw' }}>
          <img src="playpal-logo.png" alt="" style={{ width: '4.4vw', minWidth: 40, borderRadius: '50%', boxShadow: `0 0 0 0.22vw rgba(200,161,90,0.55)` }} />
          <div style={{ fontSize: 'clamp(28px, 4.6vw, 110px)', fontWeight: 800, letterSpacing: '0.14em', lineHeight: 1 }}>
            EGT <span style={{ color: C.gold }}>BOTTOM LINE</span>
          </div>
          {liveCount > 0 && (
            <div className="bl-live-pill" style={{
              display: 'flex', alignItems: 'center', gap: '0.5vw', background: 'rgba(242,109,109,0.14)',
              border: '1px solid rgba(242,109,109,0.5)', borderRadius: 999, padding: '0.5vh 1vw',
              fontSize: 'clamp(12px, 1.2vw, 28px)', fontWeight: 800, letterSpacing: '0.18em', color: '#F26D6D',
            }}>
              <span className="bl-live-dot" /> LIVE
            </div>
          )}
        </div>

        <div style={{ fontSize: 'clamp(34px, 6.5vw, 160px)', fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {clock}
        </div>
        <div style={{ fontSize: 'clamp(13px, 1.4vw, 34px)', fontWeight: 700, letterSpacing: '0.3em', color: C.dim }}>
          {dateLine}
        </div>

        {headline && (
          <div style={{ textAlign: 'center', marginTop: '1vh' }}>
            <div style={{ fontSize: 'clamp(16px, 2vw, 48px)', fontWeight: 800, letterSpacing: '0.12em', color: C.gold }}>
              {headline.title}
            </div>
            {headline.sub ? (
              <div style={{ fontSize: 'clamp(13px, 1.5vw, 36px)', fontWeight: 600, letterSpacing: '0.06em', color: C.dim, marginTop: '0.6vh' }}>
                {headline.sub}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Breaking banner ── */}
      <div aria-live="polite" style={{ height: banner ? 'clamp(44px, 6vh, 90px)' : 0, transition: 'height 0.35s ease', overflow: 'hidden', flexShrink: 0 }}>
        {banner && (
          <div className="bl-banner" style={{
            height: '100%', display: 'flex', alignItems: 'center', gap: '1.4vw', padding: '0 2vw',
            background: banner.tone === 'down' ? 'linear-gradient(90deg, #4A1010, #2A0A0A)' : 'linear-gradient(90deg, #4A3608, #241A04)',
            borderTop: `2px solid ${banner.tone === 'down' ? C.down : C.hot}`,
          }}>
            <span style={{
              background: banner.tone === 'down' ? C.down : C.hot, color: '#0A0A0A', fontWeight: 800,
              letterSpacing: '0.16em', padding: '0.4vh 0.9vw', borderRadius: 6,
              fontSize: 'clamp(12px, 1.3vw, 30px)', whiteSpace: 'nowrap',
            }}>
              {banner.icon} {banner.label}
            </span>
            <span style={{ fontSize: 'clamp(15px, 1.8vw, 42px)', fontWeight: 800, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {(banner.parts || []).map(p => p.t === 'sep' ? ' • ' : p.s).join(' ')}
            </span>
          </div>
        )}
      </div>

      {/* ── The Bottom Line ── */}
      <div style={{ flexShrink: 0, display: 'flex', height: 'clamp(72px, 14vh, 220px)', borderTop: `2px solid ${BL.COLORS.gold}`, background: C.strip }}>
        {/* fixed brand block */}
        <div style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 1.6vw', background: `linear-gradient(180deg, ${C.stripEdge}, #081911)`,
          borderRight: `2px solid ${C.gold}`, zIndex: 2, minWidth: '7vw',
        }}>
          <div style={{ fontSize: 'clamp(20px, 2.6vw, 64px)', fontWeight: 800, letterSpacing: '0.1em', color: C.gold, lineHeight: 1 }}>EGT</div>
          <div style={{ fontSize: 'clamp(8px, 0.75vw, 18px)', fontWeight: 700, letterSpacing: '0.3em', color: C.dim, marginTop: '0.6vh' }}>BOTTOM LINE</div>
        </div>
        {/* scrolling strip */}
        <div
          onMouseEnter={() => { if (window.matchMedia && window.matchMedia('(hover: hover)').matches && engineRef.current) engineRef.current.setPaused(true); }}
          onMouseLeave={() => { if (engineRef.current) engineRef.current.setPaused(false); }}
          style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div ref={trackRef} style={{ position: 'absolute', inset: 0, willChange: 'transform', contain: 'strict' }} />
        </div>
      </div>

      {/* ── Auto-hiding controls ── */}
      <div style={{
        position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10,
        opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.3s',
      }}>
        {[
          { label: 'SLOWER', fn: () => setSpeed(s => Math.max(60, s - 30)) },
          { label: 'FASTER', fn: () => setSpeed(s => Math.min(420, s + 30)) },
          { label: 'FULLSCREEN', fn: toggleFullscreen },
        ].map(b => (
          <button key={b.label} onClick={b.fn} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: BL.COLORS.text,
            borderRadius: 10, padding: '10px 16px', fontFamily: BL.FONT, fontWeight: 700, fontSize: 13,
            letterSpacing: '0.1em', cursor: 'pointer',
          }}>{b.label}</button>
        ))}
      </div>
    </div>
  );
};

(() => {
  const rootEl = document.getElementById('root');
  if (rootEl) ReactDOM.createRoot(rootEl).render(<BottomLinePage />);
})();
