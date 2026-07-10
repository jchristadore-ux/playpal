// BottomLine.jsx — the EGT SportsCenter broadcast.
//
// A single always-on production for a TV: a mode-driven full-screen "stage"
// (PRE-ROUND → LIVE → POST-ROUND/SportsCenter, chosen automatically from the
// live data) rotating through broadcast modules, with the Bottom Line ticker
// running continuously underneath. All data comes from BottomLineProvider
// (EGT Cup rounds only); this file is pure presentation + the ticker engine.

/* eslint-disable no-undef */

const BL = (() => {
  const COLORS = {
    bg: '#05090C', panel: 'rgba(255,255,255,0.035)', panelEdge: 'rgba(255,255,255,0.09)',
    strip: '#0A1114', stripEdge: '#0E2B20',
    text: '#F6F4EE', dim: 'rgba(246,244,238,0.55)', faint: 'rgba(246,244,238,0.28)',
    gold: '#C8A15A', green: '#3DCB6C', red: '#F26D6D', hot: '#FFB84D', blue: '#6FA8FF',
  };
  const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
  return { COLORS, FONT };
})();

const toPar = n => (n === 0 ? 'E' : (n > 0 ? '+' : '') + n);
const money = n => (n < 0 ? '-$' : '+$') + Math.abs(Math.round(n || 0));
const moneyColor = n => (n > 0 ? BL.COLORS.green : n < 0 ? BL.COLORS.red : BL.COLORS.dim);

// ═══════════════════════════════════════════════════════════════════════════
// TICKER ENGINE  (Part 1 fix)
//
// A transform-only rAF strip. Cards are measured in place, spaced by a fixed
// GAP, and the track is always filled two viewports past the right edge — so
// every item is laid out in full before it reaches the visible edge and slides
// in cleanly (no pop-in, no gaps, no clipped text, even spacing). Starting the
// loop only after fonts load removes the width-remeasure jitter.
// ═══════════════════════════════════════════════════════════════════════════
function TickerEngine(trackEl, opts) {
  let feed = [], feedIdx = 0, priority = [];
  let x = 0, rightEdge = 0;
  let speed = opts.speed || 140, paused = false, raf = null, lastT = 0, started = false;
  const GAP = opts.gap || 60;
  const nodes = [];

  function makeCard(seg, left) {
    const el = opts.renderSegment(seg);
    el.style.position = 'absolute';
    el.style.left = left + 'px';
    trackEl.appendChild(el);
    const width = el.offsetWidth;         // nowrap card → stable width once fonts are ready
    const node = { el, left, width, seg, segId: seg.id, textKey: JSON.stringify(seg.parts) };
    nodes.push(node);
    return width;
  }

  function setSpeed(v) { speed = v; }
  function setPaused(v) { paused = v; }

  function setFeed(next) {
    feed = next || [];
    if (feedIdx >= feed.length) feedIdx = 0;
    // In-place refresh of any on-screen card whose values changed — flash it,
    // keep its slot (no reflow of the strip).
    const byId = {}; feed.forEach(s => { byId[s.id] = s; });
    nodes.forEach(n => {
      const s = byId[n.segId]; if (!s) return;
      const key = JSON.stringify(s.parts);
      if (n.textKey !== key) {
        const fresh = opts.renderSegment(s);
        fresh.style.position = 'absolute';
        fresh.style.left = n.left + 'px';
        fresh.classList.add('bl-flash');
        trackEl.replaceChild(fresh, n.el);
        n.el = fresh; n.textKey = key;
      }
    });
  }

  function pushAlerts(alerts) {
    if (!alerts || !alerts.length) return;
    const viewW = trackEl.parentElement ? trackEl.parentElement.offsetWidth : 1920;
    // Peel back any cards still queued beyond the right edge (not yet visible)
    // so breaking news scrolls in next — off-screen, so no visible jump.
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
    let guard = 0;
    while (rightEdge + x < viewW * 2 && guard++ < 80) {
      const seg = nextSegment(); if (!seg) break;
      const w = makeCard(seg, rightEdge);
      rightEdge += w + GAP;
    }
  }

  function recycle() {
    let dropped = 0;
    while (nodes.length && nodes[0].left + nodes[0].width + x < -GAP) {
      const n = nodes.shift();
      trackEl.removeChild(n.el);
      dropped = n.left + n.width + GAP;
    }
    if (dropped > 0) {
      nodes.forEach(n => { n.left -= dropped; n.el.style.left = n.left + 'px'; });
      rightEdge -= dropped; x += dropped;
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
    trackEl.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
  }

  function start() {
    if (started) return; started = true;
    const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
    else go();
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; lastT = 0; }

  return { setFeed, pushAlerts, setSpeed, setPaused, start, stop };
}

function renderSegmentNode(seg) {
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

// ═══════════════════════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════════════════════
function Logo({ p, size = 64 }) {
  const [err, setErr] = React.useState(false);
  React.useEffect(() => { setErr(false); }, [p && p.logo]);
  if (p && p.logo && !err) {
    return <img src={p.logo} alt={p.name || ''} onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.55))' }} />;
  }
  const initials = String((p && p.name) || '?').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: (p && p.color) || BL.COLORS.gold,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
      fontSize: size * 0.38, color: '#0A0A0A', boxShadow: '0 3px 8px rgba(0,0,0,0.5)' }}>{initials}</div>
  );
}

function Stage({ eyebrow, title, accent, children }) {
  const C = BL.COLORS;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '3.5vh 5vw 2vh', gap: '2.2vh' }}>
      <div style={{ flexShrink: 0 }}>
        {eyebrow != null && (
          <div style={{ fontSize: 'clamp(13px,1.5vw,34px)', fontWeight: 800, letterSpacing: '0.32em',
            color: accent || C.gold, marginBottom: '0.8vh' }}>{eyebrow}</div>
        )}
        {title != null && (
          <div style={{ fontSize: 'clamp(30px,4.6vw,104px)', fontWeight: 800, letterSpacing: '0.01em', lineHeight: 0.98 }}>{title}</div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

function NameAlias({ p, size = 'clamp(20px,2.4vw,58px)', dim = true }) {
  const C = BL.COLORS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
      {p.alias && dim && <span style={{ fontSize: `calc(${size} * 0.5)`, fontWeight: 700, letterSpacing: '0.14em',
        color: p.color || C.gold, textTransform: 'uppercase', marginTop: '0.3vh' }}>{p.alias}</span>}
    </div>
  );
}

function Panel({ children, style }) {
  const C = BL.COLORS;
  return <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: '1.4vh',
    padding: '2vh 2vw', ...style }}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE MODULE RENDERERS
// ═══════════════════════════════════════════════════════════════════════════
function StageModule({ m }) {
  const C = BL.COLORS;
  if (!m) return null;
  switch (m.type) {

    case 'pre-round': return (
      <Stage eyebrow={`${m.tripName} · UP NEXT`} title={<span>{m.round} · <span style={{ color: C.gold }}>{(m.courseName || '').toUpperCase()}</span></span>}>
        <div style={{ display: 'flex', gap: '4vw', flexWrap: 'wrap', alignItems: 'stretch' }}>
          <BigStat label="TEE TIME" value={m.teeTime || 'TBD'} />
          <BigStat label="DAY" value={m.date || ''} />
          <BigStat label="FORMAT" value={m.formatLabel} />
          {m.location && <BigStat label="LOCATION" value={m.location} />}
        </div>
      </Stage>
    );

    case 'format-rules': return (
      <Stage eyebrow={`${m.roundLabel} · TODAY'S GAME`} title={m.formatLabel}>
        <Panel style={{ padding: '3.5vh 3vw' }}>
          <div style={{ fontSize: 'clamp(20px,2.6vw,60px)', fontWeight: 600, lineHeight: 1.35, color: C.text }}>{m.rule}</div>
        </Panel>
      </Stage>
    );

    case 'pairings': return (
      <Stage eyebrow={`${m.roundLabel} · ${m.teams && m.teams.length ? 'TEAMS' : 'THE FIELD'}`} title={m.teams && m.teams.length ? 'MATCHUPS' : 'PAIRINGS'}>
        {m.teams && m.teams.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3vw', justifyContent: 'center' }}>
            {m.teams.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ fontSize: 'clamp(28px,4vw,90px)', fontWeight: 800, color: C.gold }}>VS</div>}
                <Panel style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2vh', alignItems: 'center' }}>
                  {t.players.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1.4vw', width: '100%' }}>
                      <Logo p={p} size="clamp(48px,5vw,120px)" />
                      <NameAlias p={p} />
                    </div>
                  ))}
                </Panel>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '2.5vw', justifyContent: 'center', flexWrap: 'wrap' }}>
            {m.players.map(p => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2vh' }}>
                <Logo p={p} size="clamp(70px,8vw,180px)" />
                <NameAlias p={p} size="clamp(18px,2vw,44px)" />
              </div>
            ))}
          </div>
        )}
        {m.carts && m.carts.length > 0 && (
          <div style={{ marginTop: '3.2vh', display: 'flex', flexDirection: 'column', gap: '1.2vh', alignItems: 'center' }}>
            <div style={{ fontSize: 'clamp(12px,1.3vw,26px)', fontWeight: 800, letterSpacing: '0.25vw', color: C.gold }}>🛺 CART PAIRINGS</div>
            <div style={{ display: 'flex', gap: '2vw', justifyContent: 'center', flexWrap: 'wrap' }}>
              {m.carts.map((c, i) => (
                <Panel key={i} style={{ display: 'flex', alignItems: 'center', gap: '1vw', padding: '1.1vh 1.8vw' }}>
                  {c.map((p, j) => (
                    <React.Fragment key={p.id}>
                      {j > 0 && <span style={{ fontSize: 'clamp(14px,1.4vw,30px)', fontWeight: 800, color: C.dim }}>+</span>}
                      <Logo p={p} size="clamp(34px,3.2vw,72px)" />
                      <NameAlias p={p} size="clamp(14px,1.4vw,32px)" />
                    </React.Fragment>
                  ))}
                  {c.length === 1 && <span style={{ fontSize: 'clamp(12px,1.2vw,24px)', fontWeight: 600, color: C.dim }}>solo</span>}
                </Panel>
              ))}
            </div>
          </div>
        )}
      </Stage>
    );

    case 'schedule': return (
      <Stage eyebrow={m.tripName} title="THE SCHEDULE">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1vh' }}>
          {m.rounds.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '1.5vw', padding: '1.1vh 1.6vw',
              background: r.done ? 'rgba(61,203,108,0.08)' : C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: '1vh' }}>
              <span style={{ fontSize: 'clamp(18px,2.2vw,48px)', fontWeight: 800, color: C.gold, minWidth: '3.5vw' }}>{r.id}</span>
              <span style={{ fontSize: 'clamp(16px,2vw,44px)', fontWeight: 700, flex: 1 }}>{r.course}</span>
              <span style={{ fontSize: 'clamp(12px,1.3vw,28px)', fontWeight: 600, color: C.dim }}>{r.date}</span>
              {r.done && <span style={{ fontSize: 'clamp(11px,1.1vw,24px)', fontWeight: 800, color: C.green, letterSpacing: '0.15em' }}>FINAL</span>}
            </div>
          ))}
        </div>
      </Stage>
    );

    case 'tee-off': return (
      <Stage eyebrow={`${m.round} · ${(m.courseName || '').toUpperCase()}`} title="FIRST TEE" accent={C.hot}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(40px,8vw,180px)', fontWeight: 800, color: C.gold, lineHeight: 1 }}>{m.teeTime || 'TBD'}</div>
          <div style={{ fontSize: 'clamp(16px,1.8vw,40px)', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, marginTop: '1.5vh' }}>GET TO THE BOX</div>
        </div>
      </Stage>
    );

    case 'prev-winner': return (
      <Stage eyebrow="PREVIOUS ROUND" title="ROUND WINNER" accent={m.winner.color}>
        <WinnerHero p={m.winner} lineTop={`${m.winner.gross} (${toPar(m.winner.toPar)})`} lineBot={m.course} />
      </Stage>
    );

    case 'live-leaderboard': return (
      <Stage eyebrow={<span><span style={{ color: C.red }}>● LIVE</span> · {(m.courseName || '').toUpperCase()}{m.currentHole ? ` · HOLE ${m.currentHole}` : ''}</span>} title="LEADERBOARD">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
          {m.lines.map((l, i) => (
            <LbRow key={l.id} rank={i + 1} p={l} right={toPar(l.toPar)}
              sub={l.done ? 'F' : `thru ${l.thru}`} rightColor={l.toPar < 0 ? C.green : l.toPar > 0 ? C.text : C.text} />
          ))}
        </div>
      </Stage>
    );

    case 'live-money': case 'standings-money': return (
      <Stage eyebrow={m.courseName ? `LIVE · ${m.courseName.toUpperCase()}` : 'TOURNAMENT'} title="RUNNING BANKROLL" accent={C.green}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
          {m.lines.map((l, i) => (
            <LbRow key={l.id} rank={i + 1} p={l} right={money(l.total)} rightColor={moneyColor(l.total)} />
          ))}
        </div>
      </Stage>
    );

    case 'format-board': return (
      <Stage eyebrow={`${m.icon || ''} ${(m.courseName || '').toUpperCase()}`} title={m.formatLabel.toUpperCase()}>
        {m.leader && <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vw', marginBottom: '2vh' }}>
          <Logo p={m.leader} size="clamp(48px,5vw,120px)" />
          <div><div style={{ fontSize: 'clamp(12px,1.3vw,28px)', fontWeight: 800, letterSpacing: '0.2em', color: C.gold }}>LEADER</div>
            <div style={{ fontSize: 'clamp(24px,3vw,72px)', fontWeight: 800 }}>{m.leader.name}</div></div>
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
          {m.lines.slice(0, 5).map((line, i) => (
            <div key={i} style={{ fontSize: 'clamp(16px,2vw,44px)', fontWeight: 700, color: C.text,
              padding: '0.8vh 1.4vw', background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: '1vh' }}>{line}</div>
          ))}
        </div>
      </Stage>
    );

    case 'on-course': return (
      <Stage eyebrow={<span><span style={{ color: C.red }}>● LIVE</span> · {(m.courseName || '').toUpperCase()}</span>} title={m.currentHole ? `ON HOLE ${m.currentHole}` : 'ON THE COURSE'}>
        <div style={{ display: 'flex', gap: '2vw', flexWrap: 'wrap', justifyContent: 'center' }}>
          {m.onCourse.map(p => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1vh', opacity: 1 }}>
              <Logo p={p} size="clamp(64px,7vw,150px)" />
              <NameAlias p={p} size="clamp(16px,1.8vw,40px)" dim={false} />
              <span style={{ fontSize: 'clamp(12px,1.2vw,26px)', color: C.dim, fontWeight: 700 }}>thru {p.thru}</span>
            </div>
          ))}
          {m.done.map(p => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1vh', opacity: 0.5 }}>
              <Logo p={p} size="clamp(64px,7vw,150px)" />
              <NameAlias p={p} size="clamp(16px,1.8vw,40px)" dim={false} />
              <span style={{ fontSize: 'clamp(12px,1.2vw,26px)', color: C.green, fontWeight: 800 }}>FINISHED</span>
            </div>
          ))}
        </div>
      </Stage>
    );

    case 'standings': return (
      <Stage eyebrow={m.tripName} title="CUP STANDINGS" accent={C.gold}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
          {m.rows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '1.4vw', padding: '1vh 1.6vw',
              background: r.rank === 1 ? 'rgba(200,161,90,0.12)' : C.panel, border: `1px solid ${r.rank === 1 ? 'rgba(200,161,90,0.4)' : C.panelEdge}`, borderRadius: '1.2vh' }}>
              <span style={{ fontSize: 'clamp(22px,2.8vw,64px)', fontWeight: 800, color: r.rank === 1 ? C.gold : C.dim, minWidth: '2.5vw' }}>{r.rank}</span>
              <Logo p={r} size="clamp(44px,4.6vw,104px)" />
              <div style={{ flex: 1, minWidth: 0 }}><NameAlias p={r} size="clamp(20px,2.4vw,56px)" /></div>
              {r.direction === 'up' && <span style={{ color: C.green, fontSize: 'clamp(16px,1.8vw,40px)', fontWeight: 800 }}>▲{r.move}</span>}
              {r.direction === 'down' && <span style={{ color: C.red, fontSize: 'clamp(16px,1.8vw,40px)', fontWeight: 800 }}>▼{Math.abs(r.move)}</span>}
              {r.money != null && <span style={{ fontSize: 'clamp(16px,1.8vw,42px)', fontWeight: 800, color: moneyColor(r.money), minWidth: '6vw', textAlign: 'right' }}>{money(r.money)}</span>}
              <span style={{ fontSize: 'clamp(24px,3vw,72px)', fontWeight: 800, minWidth: '5vw', textAlign: 'right' }}>{r.points}<span style={{ fontSize: '0.42em', color: C.dim, fontWeight: 700 }}> pts</span></span>
            </div>
          ))}
        </div>
      </Stage>
    );

    case 'round-recap': return (
      <Stage eyebrow={`${(m.course || '').toUpperCase()} · RECAP`} title="ROUND RECAP">
        <div style={{ display: 'flex', gap: '2vw', height: '100%' }}>
          <Panel style={{ flex: 1.2, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.5vh', borderColor: 'rgba(200,161,90,0.4)', background: 'rgba(200,161,90,0.08)' }}>
            <div style={{ fontSize: 'clamp(13px,1.4vw,30px)', fontWeight: 800, letterSpacing: '0.2em', color: C.gold }}>🏆 LOW ROUND</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vw' }}>
              <Logo p={m.winner} size="clamp(64px,7vw,150px)" />
              <div><NameAlias p={m.winner} size="clamp(24px,3vw,72px)" />
                <div style={{ fontSize: 'clamp(24px,3vw,72px)', fontWeight: 800, color: C.gold }}>{m.winner.gross} <span style={{ fontSize: '0.6em', color: C.dim }}>({toPar(m.winner.toPar)})</span></div></div>
            </div>
          </Panel>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.4vh' }}>
            {m.net && <RecapTile label="BEST NET" p={m.net} value={`${m.net.net} (${toPar(m.net.toPar)})`} />}
            {m.front && <RecapTile label="LOW FRONT" p={m.front} value={`${m.front.gross} (${toPar(m.front.toPar)})`} />}
            {m.back && <RecapTile label="LOW BACK" p={m.back} value={`${m.back.gross} (${toPar(m.back.toPar)})`} />}
          </div>
        </div>
      </Stage>
    );

    case 'player-of-round': return (
      <Stage eyebrow="EGT SPORTSCENTER" title="PLAYER OF THE ROUND" accent={m.player.color}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3vw' }}>
          <Logo p={m.player} size="clamp(120px,16vw,340px)" />
          <div style={{ flex: 1 }}>
            <NameAlias p={m.player} size="clamp(36px,5vw,120px)" />
            <div style={{ display: 'flex', gap: '2.5vw', marginTop: '2.5vh', flexWrap: 'wrap' }}>
              {m.net != null && <MiniStat label="NET" value={m.net} />}
              <MiniStat label="BIRDIES" value={m.birdies} accent={C.green} />
              {m.putts != null && <MiniStat label="PUTTS" value={m.putts} />}
              {m.money != null && <MiniStat label="MONEY" value={money(m.money)} accent={moneyColor(m.money)} />}
            </div>
          </div>
        </div>
      </Stage>
    );

    case 'format-winners': return (
      <Stage eyebrow={`${(m.course || '').toUpperCase()} · SIDE GAMES`} title="FORMAT WINNERS" accent={C.gold}>
        <div style={{ display: 'flex', gap: '2vw', flexWrap: 'wrap', justifyContent: 'center' }}>
          {m.winners.map((w, i) => (
            <Panel key={i} style={{ flex: '1 1 30%', minWidth: '22vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2vh' }}>
              <div style={{ fontSize: 'clamp(13px,1.4vw,30px)', fontWeight: 800, letterSpacing: '0.15em', color: C.gold }}>{w.icon} {w.formatLabel.toUpperCase()}</div>
              <Logo p={w.winner} size="clamp(70px,7vw,160px)" />
              <NameAlias p={w.winner} size="clamp(20px,2.2vw,52px)" />
            </Panel>
          ))}
        </div>
      </Stage>
    );

    case 'player-card': {
      const stats = [
        m.rank != null && { label: 'POSITION', value: ordinal(m.rank) },
        m.points != null && { label: 'CUP POINTS', value: m.points },
        m.money != null && { label: 'MONEY', value: money(m.money), color: moneyColor(m.money) },
        m.skins ? { label: 'SKINS', value: m.skins } : null,
        m.birdies ? { label: 'BIRDIES', value: m.birdies, color: C.green } : null,
        m.scoringAvg != null && { label: 'SCORING AVG', value: m.scoringAvg.toFixed(1) },
        m.firPct != null && { label: 'FAIRWAYS', value: m.firPct + '%' },
        m.girPct != null && { label: 'GREENS', value: m.girPct + '%' },
        m.puttsPerRound != null && { label: 'PUTTS/RD', value: m.puttsPerRound.toFixed(1) },
      ].filter(Boolean);
      return (
        <Stage eyebrow="PLAYER CARD" title={<span style={{ color: m.player.color }}>{(m.player.alias || m.player.name).toUpperCase()}</span>} accent={m.player.color}>
          <div style={{ display: 'flex', gap: '3vw', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1vh' }}>
              <Logo p={m.player} size="clamp(120px,15vw,320px)" />
              <div style={{ fontSize: 'clamp(20px,2.4vw,56px)', fontWeight: 800 }}>{m.player.name}</div>
              {m.rank != null && <div style={{ fontSize: 'clamp(14px,1.5vw,34px)', fontWeight: 800, color: C.gold, letterSpacing: '0.1em' }}>{ordinal(m.rank)} · CUP</div>}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.4vh 1.4vw' }}>
              {stats.map((s, i) => (
                <Panel key={i} style={{ padding: '1.6vh 1.2vw' }}>
                  <div style={{ fontSize: 'clamp(11px,1.1vw,24px)', fontWeight: 800, letterSpacing: '0.14em', color: C.dim }}>{s.label}</div>
                  <div style={{ fontSize: 'clamp(22px,2.8vw,62px)', fontWeight: 800, color: s.color || C.text, marginTop: '0.4vh' }}>{s.value}</div>
                </Panel>
              ))}
            </div>
          </div>
        </Stage>
      );
    }

    case 'stat-leaderboard': return (
      <Stage eyebrow="EGT SPORTSCENTER · STATS" title={m.title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
          {m.rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '1.4vw', padding: '1vh 1.6vw',
              background: i === 0 ? 'rgba(200,161,90,0.12)' : C.panel, border: `1px solid ${i === 0 ? 'rgba(200,161,90,0.4)' : C.panelEdge}`, borderRadius: '1.2vh' }}>
              <span style={{ fontSize: 'clamp(20px,2.6vw,60px)', fontWeight: 800, color: i === 0 ? C.gold : C.dim, minWidth: '2.5vw' }}>{i + 1}</span>
              <Logo p={r} size="clamp(44px,4.6vw,104px)" />
              <span style={{ flex: 1, fontSize: 'clamp(20px,2.4vw,56px)', fontWeight: 800 }}>{r.name}
                {r.alias && <span style={{ fontSize: '0.5em', color: r.color, fontWeight: 700, letterSpacing: '0.12em', marginLeft: '0.8vw' }}>{r.alias.toUpperCase()}</span>}</span>
              <span style={{ fontSize: 'clamp(24px,3.2vw,80px)', fontWeight: 800, color: r.tone === 'up' ? C.green : r.tone === 'down' ? C.red : C.text }}>{r.display}</span>
            </div>
          ))}
        </div>
      </Stage>
    );

    default: return null;
  }
}

function BigStat({ label, value }) {
  const C = BL.COLORS;
  return (
    <div style={{ flex: '1 1 20%', minWidth: '16vw' }}>
      <div style={{ fontSize: 'clamp(12px,1.3vw,28px)', fontWeight: 800, letterSpacing: '0.2em', color: C.gold }}>{label}</div>
      <div style={{ fontSize: 'clamp(24px,3.2vw,80px)', fontWeight: 800, lineHeight: 1.05, marginTop: '0.6vh' }}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value, accent }) {
  const C = BL.COLORS;
  return (
    <div>
      <div style={{ fontSize: 'clamp(12px,1.2vw,26px)', fontWeight: 800, letterSpacing: '0.14em', color: C.dim }}>{label}</div>
      <div style={{ fontSize: 'clamp(30px,4vw,96px)', fontWeight: 800, color: accent || C.text, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
function LbRow({ rank, p, right, sub, rightColor }) {
  const C = BL.COLORS;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vw', padding: '1vh 1.6vw',
      background: rank === 1 ? 'rgba(200,161,90,0.1)' : C.panel, border: `1px solid ${rank === 1 ? 'rgba(200,161,90,0.35)' : C.panelEdge}`, borderRadius: '1.2vh' }}>
      <span style={{ fontSize: 'clamp(20px,2.6vw,60px)', fontWeight: 800, color: rank === 1 ? C.gold : C.dim, minWidth: '2.5vw' }}>{rank}</span>
      <Logo p={p} size="clamp(44px,4.6vw,104px)" />
      <div style={{ flex: 1, minWidth: 0 }}><NameAlias p={p} size="clamp(20px,2.4vw,56px)" /></div>
      {sub && <span style={{ fontSize: 'clamp(13px,1.4vw,32px)', color: C.dim, fontWeight: 700, marginRight: '1vw' }}>{sub}</span>}
      <span style={{ fontSize: 'clamp(26px,3.4vw,84px)', fontWeight: 800, color: rightColor || C.text }}>{right}</span>
    </div>
  );
}
function RecapTile({ label, p, value }) {
  const C = BL.COLORS;
  return (
    <Panel style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.2vw' }}>
      <Logo p={p} size="clamp(44px,4.4vw,100px)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'clamp(12px,1.3vw,28px)', fontWeight: 800, letterSpacing: '0.15em', color: C.gold }}>{label}</div>
        <div style={{ fontSize: 'clamp(18px,2vw,48px)', fontWeight: 800 }}>{p.name}</div>
      </div>
      <div style={{ fontSize: 'clamp(20px,2.4vw,58px)', fontWeight: 800 }}>{value}</div>
    </Panel>
  );
}
function WinnerHero({ p, lineTop, lineBot }) {
  const C = BL.COLORS;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3vw', justifyContent: 'center' }}>
      <Logo p={p} size="clamp(130px,17vw,360px)" />
      <div>
        <NameAlias p={p} size="clamp(40px,5.5vw,130px)" />
        <div style={{ fontSize: 'clamp(28px,3.6vw,90px)', fontWeight: 800, color: C.gold, marginTop: '1vh' }}>{lineTop}</div>
        {lineBot && <div style={{ fontSize: 'clamp(16px,1.8vw,40px)', fontWeight: 700, color: C.dim }}>{lineBot}</div>}
      </div>
    </div>
  );
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ═══════════════════════════════════════════════════════════════════════════
// REALTIME WORLD
// ═══════════════════════════════════════════════════════════════════════════
function subscribeWorld(onWorld) {
  const world = { docs: [], trips: [], players: [], egtSeed: window.EGT_SEED || null };
  let scheduled = null;
  const emit = () => {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = null; onWorld(Object.assign({}, world, { now: Date.now() })); }, 400);
  };
  emit();
  if (!window.firebase || !window.PLAYPAL_FIREBASE_CONFIG) return () => {};
  window.firebase.apps.length ? window.firebase.apps[0] : window.firebase.initializeApp(window.PLAYPAL_FIREBASE_CONFIG);
  const unsubs = [];
  window.firebase.auth().signInAnonymously().then(() => {
    const fs = window.firebase.firestore();
    unsubs.push(fs.collection('playpal_rounds').onSnapshot(s => { const d = []; s.forEach(x => d.push(x.data())); world.docs = d; emit(); },
      e => console.warn('[BottomLine] rounds listener:', e)));
    unsubs.push(fs.collection('golf_trips').onSnapshot(s => { const t = []; s.forEach(x => t.push(x.data())); world.trips = t; emit(); },
      e => console.warn('[BottomLine] trips listener:', e)));
    const db = window.firebase.database(), ref = db.ref('players');
    const cb = ref.on('value', s => { const v = s.val(); world.players = v ? Object.values(v) : []; emit(); },
      e => console.warn('[BottomLine] players listener:', e));
    unsubs.push(() => ref.off('value', cb));
  }).catch(e => { console.warn('[BottomLine] auth failed:', e && e.message); onWorld(Object.assign({}, world, { now: Date.now() })); });
  return () => { unsubs.forEach(u => { try { u(); } catch (e) {} }); };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════
const MODE_LABEL = { pre: 'PRE-ROUND', live: 'LIVE', post: 'SPORTSCENTER' };
const DWELL_MS = 10000;

const BroadcastPage = () => {
  const C = BL.COLORS;
  const provider = window.BottomLineProvider;
  const trackRef = React.useRef(null);
  const engineRef = React.useRef(null);
  const factsRef = React.useRef(null);

  const [facts, setFacts] = React.useState(null);
  const [force, setForce] = React.useState(null);          // manual mode override
  const [tick, setTick] = React.useState(0);
  const [clock, setClock] = React.useState('');
  const [banner, setBanner] = React.useState(null);
  const [speed, setSpeed] = React.useState(() => Number(localStorage.getItem('bl_speed')) || 140);
  const [showControls, setShowControls] = React.useState(false);
  const bannerTimer = React.useRef(null);
  const controlsTimer = React.useRef(null);

  const mode = React.useMemo(() => facts && provider ? provider.broadcastMode(facts, { force }) : 'pre', [facts, force, provider]);
  const modules = React.useMemo(() => facts && provider ? provider.broadcastModules(facts, mode) : [], [facts, mode, provider]);
  const current = modules.length ? modules[tick % modules.length] : null;

  // Clock.
  React.useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    t(); const iv = setInterval(t, 10000); return () => clearInterval(iv);
  }, []);

  // Module rotation.
  React.useEffect(() => { setTick(0); }, [mode]);
  React.useEffect(() => {
    if (modules.length <= 1) return;
    const iv = setInterval(() => setTick(t => t + 1), DWELL_MS);
    return () => clearInterval(iv);
  }, [modules.length, mode]);

  // Ticker engine.
  React.useEffect(() => {
    const engine = TickerEngine(trackRef.current, { speed, renderSegment: renderSegmentNode });
    engineRef.current = engine; engine.start();
    return () => engine.stop();
  }, []);
  React.useEffect(() => { if (engineRef.current) engineRef.current.setSpeed(speed); localStorage.setItem('bl_speed', String(speed)); }, [speed]);

  // Realtime data → facts → feed + alerts.
  React.useEffect(() => {
    if (!provider) return;
    return subscribeWorld(world => {
      let f; try { f = provider.computeFacts(world); } catch (e) { console.warn('[BottomLine] compute failed:', e); return; }
      const prev = factsRef.current; factsRef.current = f;
      setFacts(f);
      if (engineRef.current) engineRef.current.setFeed(provider.buildFeed(f));
      const alerts = provider.diffAlerts(prev, f);
      if (alerts.length && engineRef.current) {
        engineRef.current.pushAlerts(alerts);
        const a = alerts[alerts.length - 1];
        setBanner(a);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setBanner(null), 8000);
      }
    });
  }, [provider]);

  const pokeControls = React.useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  };

  const liveNow = facts && facts.liveRounds && facts.liveRounds.length > 0;

  return (
    <div onMouseMove={pokeControls} style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: `radial-gradient(130% 100% at 50% 0%, #0B1B14 0%, ${C.bg} 60%)`,
      color: C.text, fontFamily: BL.FONT, cursor: showControls ? 'default' : 'none',
    }}>
      {/* Top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '1.2vw', padding: '1.6vh 2.4vw',
        borderBottom: `1px solid ${C.panelEdge}` }}>
        <img src="playpal-logo.png" alt="" style={{ width: 'clamp(28px,2.6vw,60px)', borderRadius: '50%', boxShadow: `0 0 0 2px rgba(200,161,90,0.5)` }} />
        <div style={{ fontSize: 'clamp(16px,1.9vw,44px)', fontWeight: 800, letterSpacing: '0.12em' }}>EGT <span style={{ color: C.gold }}>SPORTSCENTER</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5vw', background: liveNow ? 'rgba(242,109,109,0.14)' : 'rgba(200,161,90,0.12)',
          border: `1px solid ${liveNow ? 'rgba(242,109,109,0.5)' : 'rgba(200,161,90,0.4)'}`, borderRadius: 999, padding: '0.4vh 1vw',
          fontSize: 'clamp(11px,1.1vw,26px)', fontWeight: 800, letterSpacing: '0.16em', color: liveNow ? C.red : C.gold }}>
          {liveNow && <span className="bl-live-dot" />}{MODE_LABEL[mode]}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 'clamp(18px,2vw,48px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
      </div>

      {/* Stage */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {current
          ? <div key={mode + ':' + current.id} className="bl-stage-in" style={{ position: 'absolute', inset: 0 }}><StageModule m={current} /></div>
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 'clamp(18px,2vw,44px)', fontWeight: 700, letterSpacing: '0.2em' }}>EGT 2026 CUP · STANDING BY</div>}
      </div>

      {/* Breaking banner */}
      <div aria-live="polite" style={{ height: banner ? 'clamp(40px,5.5vh,84px)' : 0, transition: 'height 0.35s ease', overflow: 'hidden', flexShrink: 0 }}>
        {banner && (
          <div className="bl-banner" style={{ height: '100%', display: 'flex', alignItems: 'center', gap: '1.4vw', padding: '0 2vw',
            background: banner.tone === 'down' ? 'linear-gradient(90deg,#4A1010,#2A0A0A)' : 'linear-gradient(90deg,#4A3608,#241A04)',
            borderTop: `2px solid ${banner.tone === 'down' ? C.red : C.hot}` }}>
            <span style={{ background: banner.tone === 'down' ? C.red : C.hot, color: '#0A0A0A', fontWeight: 800, letterSpacing: '0.16em',
              padding: '0.4vh 0.9vw', borderRadius: 6, fontSize: 'clamp(12px,1.3vw,28px)', whiteSpace: 'nowrap' }}>{banner.icon} {banner.label}</span>
            <span style={{ fontSize: 'clamp(15px,1.7vw,40px)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {(banner.parts || []).map(p => p.t === 'sep' ? ' • ' : p.s).join(' ')}</span>
          </div>
        )}
      </div>

      {/* Bottom Line ticker */}
      <div style={{ flexShrink: 0, display: 'flex', height: 'clamp(64px,12vh,190px)', borderTop: `2px solid ${C.gold}`, background: C.strip }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 1.4vw', background: `linear-gradient(180deg,${C.stripEdge},#081911)`, borderRight: `2px solid ${C.gold}`, zIndex: 2, minWidth: '7vw' }}>
          <div style={{ fontSize: 'clamp(18px,2.4vw,56px)', fontWeight: 800, letterSpacing: '0.1em', color: C.gold, lineHeight: 1 }}>EGT</div>
          <div style={{ fontSize: 'clamp(7px,0.7vw,16px)', fontWeight: 700, letterSpacing: '0.3em', color: C.dim, marginTop: '0.5vh' }}>BOTTOM LINE</div>
        </div>
        <div onMouseEnter={() => { if (window.matchMedia && window.matchMedia('(hover: hover)').matches && engineRef.current) engineRef.current.setPaused(true); }}
          onMouseLeave={() => { if (engineRef.current) engineRef.current.setPaused(false); }}
          style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div ref={trackRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: 'fixed', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 20, flexWrap: 'wrap', justifyContent: 'flex-end',
        maxWidth: '60vw', opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
        {[['AUTO', null], ['PRE', 'pre'], ['LIVE', 'live'], ['POST', 'post']].map(([label, val]) => (
          <Ctrl key={label} active={force === val || (label === 'AUTO' && !force)} onClick={() => setForce(val)}>{label}</Ctrl>
        ))}
        <Ctrl onClick={() => setTick(t => t + 1)}>NEXT ▸</Ctrl>
        <Ctrl onClick={() => setSpeed(s => Math.max(60, s - 30))}>TICKER −</Ctrl>
        <Ctrl onClick={() => setSpeed(s => Math.min(420, s + 30))}>TICKER +</Ctrl>
        <Ctrl onClick={toggleFullscreen}>⛶ FULL</Ctrl>
      </div>
    </div>
  );
};

function Ctrl({ children, onClick, active }) {
  const C = BL.COLORS;
  return (
    <button onClick={onClick} style={{
      background: active ? C.gold : 'rgba(255,255,255,0.08)', color: active ? '#0A0A0A' : C.text,
      border: `1px solid ${active ? C.gold : 'rgba(255,255,255,0.2)'}`, borderRadius: 9, padding: '8px 12px',
      fontFamily: BL.FONT, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  );
}

(() => {
  const rootEl = document.getElementById('root');
  if (rootEl) ReactDOM.createRoot(rootEl).render(<BroadcastPage />);
})();
