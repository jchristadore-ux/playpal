// GameTrackers.jsx — live standings + final results for MatchEngine games.
// One generic renderer covers every format the engine computes, so new
// registered formats appear here with zero UI changes.

const GameStandingsCard = ({ result, stake, final: isFinal }) => {
  const entries = result.entries || [];
  return (
    <div style={gtS.section}>
      <div style={gtS.head}>
        <span style={{ fontSize: 14 }}>{result.icon}</span>
        <Label>{result.name}</Label>
        {result.basis && (
          <span style={gtS.basisPill}>{result.basis === 'net' ? 'NET' : 'GROSS'}</span>
        )}
        {stake > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#3F5F4A', letterSpacing: 0.5 }}>
            ${stake}
          </span>
        )}
      </div>

      <div style={{
        fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12,
        fontWeight: 600,
        color: result.complete ? '#C8A15A' : '#3F5F4A',
        padding: '0 14px 8px', letterSpacing: 0.3,
      }}>
        {result.complete && result.winner ? '🏆 ' : ''}{result.status}
      </div>

      <div style={gtS.row}>
        {entries.map(e => {
          const isLeader = (result.leaderIds || []).includes(e.id) && e.played > 0;
          return (
            <div key={e.id} style={{
              ...gtS.card,
              border: isLeader ? '1px solid rgba(200,161,90,0.45)' : '1px solid #E7E3D9',
              background: isLeader ? 'rgba(200,161,90,0.05)' : '#F6F4EE',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: e.color || '#8A9E8A', flexShrink: 0 }} />
                <span style={{
                  fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 12,
                  color: '#0E2B20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{e.label}</span>
              </div>
              <div style={{
                fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 900, fontSize: 22,
                lineHeight: 1, color: isLeader ? '#C8A15A' : '#0E2B20',
              }}>
                {e.totalLabel}
              </div>
              <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 9, color: '#8A9E8A', marginTop: 3, lineHeight: 1.4 }}>
                {e.detail}
              </div>
              {isLeader && !isFinal && (
                <div style={{ fontSize: 8, fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, color: '#C8A15A', marginTop: 2 }}>★ LEAD</div>
              )}
              {isFinal && result.winner && result.winner.ids.includes(e.id) && (
                <div style={{ fontSize: 8, fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, color: '#C8A15A', marginTop: 2 }}>🏆 WINNER</div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && (
          <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#8A9E8A', padding: '4px 2px' }}>
            Waiting on setup…
          </div>
        )}
      </div>
    </div>
  );
};

// Computes every configured engine game against live scores and renders a card
// per game. `gameState` carries input-driven data (wolf picks, BBB awards).
const EngineGamesTracker = ({ games, players, course, scores, startingTee, gameState, final: isFinal }) => {
  const ME = window.MatchEngine;
  if (!ME || !games || games.length === 0) return null;
  const results = games.map(g => {
    try {
      return { game: g, result: ME.compute(g, { course, players, scores, startingTee, gameState: gameState || {} }) };
    } catch (e) {
      console.warn('[PlayPal] game compute failed:', g.formatId, e);
      return null;
    }
  }).filter(Boolean);

  return (
    <div>
      {results.map(({ game, result }) => (
        <GameStandingsCard key={game.id} result={result} stake={game.config?.stake || 0} final={isFinal} />
      ))}
    </div>
  );
};

const gtS = {
  section: { background: '#FFFFFF', borderBottom: '1px solid #E7E3D9', paddingTop: 10 },
  head:    { display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px 8px' },
  basisPill: {
    fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 800, fontSize: 8,
    letterSpacing: 1, color: '#3F5F4A', background: '#F0EDE4',
    border: '1px solid #E7E3D9', borderRadius: 4, padding: '1px 5px',
  },
  row: {
    display: 'flex', gap: 8, padding: '0 14px 14px',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
  },
  card: { borderRadius: 12, padding: '10px 12px', minWidth: 104, flexShrink: 0 },
};

Object.assign(window, { GameStandingsCard, EngineGamesTracker });
