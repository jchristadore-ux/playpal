// TripDashboard.jsx — Golf Trip list and individual trip dashboard.
// Reuses Avatar, Btn from Shared.jsx and aggregation helpers from tripUtils.js.

const FF = 'Plus Jakarta Sans, Inter, system-ui, sans-serif';

const _fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch (e) { return iso; }
};

const _fmtPay = (v) =>
  v > 0  ? `+$${Math.abs(v).toFixed(0)}`
: v < 0  ? `-$${Math.abs(v).toFixed(0)}`
: '—';

const _vsParStr = (n) => n === 0 ? 'E' : n > 0 ? `+${n.toFixed ? n.toFixed(1) : n}` : `${n.toFixed ? n.toFixed(1) : n}`;

const _vsParColor = (n) => n < 0 ? '#15803D' : n > 0 ? '#DC2626' : '#0E2B20';

// ─── Trip List ────────────────────────────────────────────────────────────────

const TripListScreen = ({ trips, onView, onNewRound }) => {
  const sorted = (trips || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F6F4EE', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, background: '#0E2B20', padding: '20px 20px 18px' }}>
        <div style={{ fontFamily: FF, fontWeight: 900, fontSize: 26, color: '#C8A15A', letterSpacing: 0.5 }}>GOLF TRIPS</div>
        <div style={{ fontFamily: FF, fontSize: 13, color: 'rgba(246,244,238,0.55)', marginTop: 4 }}>
          Multi-round records &amp; standings
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>
        {sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px', gap: 16 }}>
            <div style={{ fontSize: 52 }}>🗺️</div>
            <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 20, color: '#0E2B20' }}>No trips yet</div>
            <div style={{ fontFamily: FF, fontSize: 14, color: '#3F5F4A', lineHeight: 1.65, maxWidth: 280 }}>
              When you start a round, choose a Golf Trip to group it with others. Standings, earnings, and awards will appear here.
            </div>
            <Btn onClick={onNewRound} variant="gold" style={{ marginTop: 8, width: '100%', maxWidth: 260 }}>⛳ START A ROUND</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(trip => (
              <div key={trip.id} onClick={() => onView(trip)}
                style={{
                  background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16,
                  padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  gap: 14, WebkitTapHighlightColor: 'transparent',
                }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: 'rgba(200,161,90,0.1)', border: '1px solid rgba(200,161,90,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>🗺️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 17, color: '#0E2B20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trip.name}
                  </div>
                  {trip.location && (
                    <div style={{ fontFamily: FF, fontSize: 12, color: '#3F5F4A', marginTop: 2 }}>📍 {trip.location}</div>
                  )}
                  {trip.startDate && (
                    <div style={{ fontFamily: FF, fontSize: 11, color: '#8A9E8A', marginTop: 2 }}>
                      {_fmtDate(trip.startDate)}{trip.endDate ? ' — ' + _fmtDate(trip.endDate) : ''}
                    </div>
                  )}
                </div>
                <span style={{ color: '#C8A15A', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>›</span>
              </div>
            ))}

            <div style={{ marginTop: 8 }}>
              <Btn onClick={onNewRound} variant="green" style={{ width: '100%' }}>⛳ NEW ROUND</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Trip Dashboard ───────────────────────────────────────────────────────────

const TripDashboard = ({ trip, rounds, onBack, onViewRound }) => {
  const [tab, setTab] = React.useState('overview');
  const loading = rounds === null;

  const leaderboard = React.useMemo(
    () => (!loading && rounds && rounds.length ? buildTripLeaderboard(rounds) : []),
    [rounds],
  );

  const awards = React.useMemo(
    () => (!loading && rounds && rounds.length ? calculateTripAwards(rounds) : []),
    [rounds],
  );

  const uniquePlayers = React.useMemo(() => {
    if (!rounds) return [];
    const seen = {};
    rounds.forEach(rd => {
      const r = rd.round || rd;
      (r.players || []).forEach(p => { if (!seen[p.id]) seen[p.id] = p; });
    });
    return Object.values(seen);
  }, [rounds]);

  const getRoundWinner = (rd) => {
    const r = rd.round || rd;
    if (!r.holeScores || !r.course) return null;
    let best = null, bestVsPar = Infinity;
    (r.players || []).forEach(p => {
      const hs = r.holeScores[p.id];
      if (!hs) return;
      const vsPar = hs.reduce((a, h, i) =>
        h.strokes ? a + h.strokes - (((r.course.holes || [])[i] || {}).par || 4) : a, 0);
      if (vsPar < bestVsPar) { bestVsPar = vsPar; best = { player: p, vsPar }; }
    });
    return best;
  };

  const TABS = [
    { id: 'overview',  label: 'OVERVIEW' },
    { id: 'standings', label: 'STANDINGS' },
    { id: 'rounds',    label: 'ROUNDS' },
    { id: 'awards',    label: 'AWARDS' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F6F4EE', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, background: '#0E2B20', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 52, gap: 12 }}>
          <button onClick={onBack} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: '6px 12px', fontFamily: FF, fontWeight: 700, fontSize: 13,
            color: '#F6F4EE', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', letterSpacing: 0.5,
          }}>‹ TRIPS</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FF, fontWeight: 900, fontSize: 15, color: '#C8A15A', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trip.name}
            </div>
            {trip.location && (
              <div style={{ fontFamily: FF, fontSize: 11, color: 'rgba(246,244,238,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trip.location}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 2 }}>
          {TABS.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, textAlign: 'center', padding: '10px 2px', cursor: 'pointer',
                fontFamily: FF, fontWeight: 700, fontSize: 9, letterSpacing: 1.2,
                color: tab === t.id ? '#C8A15A' : 'rgba(246,244,238,0.4)',
                borderBottom: tab === t.id ? '2px solid #C8A15A' : '2px solid transparent',
                WebkitTapHighlightColor: 'transparent', transition: 'color 0.15s',
              }}>
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 0', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid #E7E3D9', borderTopColor: '#C8A15A', borderRadius: '50%', animation: 'ppSpin 0.8s linear infinite' }}/>
            <div style={{ fontFamily: FF, fontSize: 12, color: '#8A9E8A', letterSpacing: 1.5, fontWeight: 700 }}>LOADING TRIP DATA…</div>
            <style>{`@keyframes ppSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Empty */}
        {!loading && rounds && rounds.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 44 }}>⛳</div>
            <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 18, color: '#0E2B20' }}>No rounds yet</div>
            <div style={{ fontFamily: FF, fontSize: 13, color: '#3F5F4A', lineHeight: 1.65, maxWidth: 280 }}>
              Start a round and select "{trip.name}" to add it to this trip.
            </div>
          </div>
        )}

        {/* ── OVERVIEW ────────────────────────────────── */}
        {!loading && rounds && rounds.length > 0 && tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Trip meta */}
            {(trip.startDate || trip.location || trip.notes) && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trip.location && (
                  <div style={{ fontFamily: FF, fontSize: 13, color: '#3F5F4A' }}>📍 {trip.location}</div>
                )}
                {trip.startDate && (
                  <div style={{ fontFamily: FF, fontSize: 13, color: '#3F5F4A' }}>
                    📅 {_fmtDate(trip.startDate)}{trip.endDate ? ' — ' + _fmtDate(trip.endDate) : ''}
                  </div>
                )}
                {trip.notes && (
                  <div style={{ fontFamily: FF, fontSize: 12, color: '#8A9E8A', lineHeight: 1.55 }}>{trip.notes}</div>
                )}
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'ROUNDS',  value: rounds.length },
                { label: 'PLAYERS', value: uniquePlayers.length },
                {
                  label: 'AVG SCORE',
                  value: leaderboard.length
                    ? (leaderboard.reduce((a, p) => a + p.avgStrokes, 0) / leaderboard.length).toFixed(1)
                    : '—',
                },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 14, padding: '14px 8px', textAlign: 'center' }}>
                  <div style={{ fontFamily: FF, fontWeight: 900, fontSize: 22, color: '#0E2B20' }}>{stat.value}</div>
                  <div style={{ fontFamily: FF, fontSize: 8, letterSpacing: 1.5, color: '#8A9E8A', fontWeight: 700, marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Players */}
            {uniquePlayers.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ fontFamily: FF, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: '#8A9E8A', marginBottom: 12 }}>PLAYERS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {uniquePlayers.map(p => (
                    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <Avatar player={p} size={40}/>
                      <div style={{ fontFamily: FF, fontSize: 11, fontWeight: 700, color: '#0E2B20' }}>{p.name.split(' ')[0]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current standings preview */}
            {leaderboard.length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E7E3D9', background: 'rgba(200,161,90,0.04)' }}>
                  <div style={{ fontFamily: FF, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: '#C8A15A' }}>CURRENT STANDINGS</div>
                </div>
                {leaderboard.slice(0, 4).map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid #F6F4EE' }}>
                    <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 15, width: 24, textAlign: 'center', flexShrink: 0, color: i === 0 ? '#C8A15A' : '#8A9E8A' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <Avatar player={p} size={34}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FF, fontWeight: 700, fontSize: 15, color: '#0E2B20' }}>{p.name}</div>
                      <div style={{ fontFamily: FF, fontSize: 11, color: '#8A9E8A' }}>{p.rounds} round{p.rounds !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 17, color: _vsParColor(p.avgVsPar) }}>
                        {_vsParStr(p.avgVsPar)}
                      </div>
                      <div style={{ fontFamily: FF, fontSize: 10, color: '#8A9E8A' }}>avg</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STANDINGS ───────────────────────────────── */}
        {!loading && rounds && rounds.length > 0 && tab === 'standings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Avg Score Leaderboard */}
            <div style={{ fontFamily: FF, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: '#8A9E8A', marginBottom: 2 }}>AVG SCORE</div>
            {leaderboard.map((p, i) => (
              <div key={p.id} style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 15, width: 26, textAlign: 'center', flexShrink: 0, color: i === 0 ? '#C8A15A' : '#8A9E8A' }}>
                  {i === 0 ? '🥇' : i + 1}
                </div>
                <Avatar player={p} size={38}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FF, fontWeight: 700, fontSize: 16, color: '#0E2B20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontFamily: FF, fontSize: 11, color: '#3F5F4A' }}>
                    {p.rounds} round{p.rounds !== 1 ? 's' : ''} · {p.birdies}🐦 {p.eagles > 0 ? p.eagles + '🦅' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 18, color: _vsParColor(p.avgVsPar) }}>
                    {_vsParStr(p.avgVsPar)}
                  </div>
                  <div style={{ fontFamily: FF, fontSize: 10, color: '#8A9E8A' }}>{p.avgStrokes.toFixed(1)} avg</div>
                </div>
              </div>
            ))}

            {/* Earnings sub-board */}
            {leaderboard.some(p => p.totalEarnings !== 0) && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E7E3D9', background: 'rgba(200,161,90,0.04)' }}>
                  <div style={{ fontFamily: FF, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: '#C8A15A' }}>TRIP EARNINGS</div>
                </div>
                {leaderboard.slice().sort((a, b) => b.totalEarnings - a.totalEarnings).map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid #F6F4EE' }}>
                    <div style={{ fontFamily: FF, fontWeight: 700, fontSize: 13, color: '#8A9E8A', width: 22, textAlign: 'center' }}>{i + 1}</div>
                    <Avatar player={p} size={28}/>
                    <div style={{ flex: 1, fontFamily: FF, fontWeight: 700, fontSize: 14, color: '#0E2B20' }}>{p.name}</div>
                    <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 16, color: p.totalEarnings > 0 ? '#15803D' : p.totalEarnings < 0 ? '#DC2626' : '#8A9E8A' }}>
                      {_fmtPay(p.totalEarnings)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Birdies sub-board */}
            {leaderboard.some(p => p.birdies > 0) && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, overflow: 'hidden', marginTop: 2 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E7E3D9', background: 'rgba(21,128,61,0.03)' }}>
                  <div style={{ fontFamily: FF, fontSize: 9, letterSpacing: 2, fontWeight: 700, color: '#15803D' }}>BIRDIES &amp; EAGLES</div>
                </div>
                {leaderboard.slice().sort((a, b) => (b.birdies + b.eagles * 2) - (a.birdies + a.eagles * 2)).map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid #F6F4EE' }}>
                    <Avatar player={p} size={26}/>
                    <div style={{ flex: 1, fontFamily: FF, fontWeight: 700, fontSize: 14, color: '#0E2B20' }}>{p.name}</div>
                    <div style={{ fontFamily: FF, fontSize: 13, color: '#3F5F4A' }}>
                      {p.birdies > 0 && <span style={{ marginRight: 8 }}>🐦 {p.birdies}</span>}
                      {p.eagles > 0 && <span>🦅 {p.eagles}</span>}
                      {p.birdies === 0 && p.eagles === 0 && <span style={{ color: '#8A9E8A' }}>—</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ROUNDS ──────────────────────────────────── */}
        {!loading && rounds && rounds.length > 0 && tab === 'rounds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rounds.map(rd => {
              const r = rd.round || rd;
              const winner = getRoundWinner(rd);
              const fmtList = (r.formats || []).map(f => {
                const info = typeof FORMAT_INFO !== 'undefined' ? FORMAT_INFO[f.type] : null;
                return info ? info.label : f.type;
              }).join(' · ');
              const syncCode = rd.syncCode || r.syncCode;
              const canView = !!onViewRound && !!syncCode;
              return (
                <div key={syncCode || r.id || Math.random()}
                  onClick={() => canView && onViewRound(syncCode)}
                  style={{
                    background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16,
                    padding: '16px', cursor: canView ? 'pointer' : 'default',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 15, color: '#0E2B20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.course?.name || 'Unknown Course'}
                      </div>
                      <div style={{ fontFamily: FF, fontSize: 11, color: '#8A9E8A', marginTop: 3 }}>{r.date || ''}</div>
                      {fmtList && (
                        <div style={{ fontFamily: FF, fontSize: 10, color: '#3F5F4A', marginTop: 5, letterSpacing: 0.4 }}>
                          {fmtList}
                        </div>
                      )}
                    </div>
                    {canView && <span style={{ color: '#C8A15A', fontSize: 20, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>›</span>}
                  </div>
                  {winner && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #F6F4EE' }}>
                      <Avatar player={winner.player} size={24}/>
                      <div style={{ fontFamily: FF, fontSize: 12, color: '#3F5F4A' }}>
                        <span style={{ fontWeight: 700, color: '#0E2B20' }}>{winner.player.name.split(' ')[0]}</span>
                        {' '}won{' '}
                        <span style={{ fontWeight: 700, color: _vsParColor(winner.vsPar) }}>
                          {winner.vsPar === 0 ? 'E' : winner.vsPar > 0 ? '+' + winner.vsPar : winner.vsPar}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── AWARDS ──────────────────────────────────── */}
        {!loading && rounds && rounds.length > 0 && tab === 'awards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {awards.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px', fontFamily: FF, fontSize: 13, color: '#8A9E8A' }}>
                Complete more rounds to unlock trip awards.
              </div>
            ) : awards.map(award => (
              <div key={award.id} style={{ background: '#FFFFFF', border: '1px solid #E7E3D9', borderRadius: 16, padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 54, height: 54, borderRadius: 14, flexShrink: 0,
                  background: 'rgba(200,161,90,0.1)', border: '1px solid rgba(200,161,90,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                }}>
                  {award.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FF, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#C8A15A', marginBottom: 6 }}>
                    {award.title.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar player={award.winner} size={28}/>
                    <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 16, color: '#0E2B20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {award.winner.name}
                    </div>
                  </div>
                  <div style={{ fontFamily: FF, fontSize: 12, color: '#3F5F4A', marginTop: 5 }}>{award.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

Object.assign(window, { TripListScreen, TripDashboard });
