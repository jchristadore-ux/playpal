// App.jsx — Root application shell (extracted from index.html so it can be
// precompiled with the rest of the components instead of transpiled in-browser).

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentGreen": "#0E2B20",
  "accentGold":  "#C8A15A",
  "bgColor":     "#F6F4EE",
  "cardBg":      "#FFFFFF",
  "showSyncCode": true
} /*EDITMODE-END*/;

// Catches render-time crashes anywhere in the tree so users get a recovery
// screen instead of a blank page. Round data in localStorage is preserved.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[PlayPal] Unhandled UI error:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{
        height:'100%', display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', gap:16, background:'#F6F4EE', padding:24, textAlign:'center',
        fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
      }}>
        <img src="playpal-logo.png" alt="" width="72" height="72" style={{borderRadius:'50%'}}/>
        <div style={{fontWeight:800, fontSize:20, color:'#0E2B20', letterSpacing:1}}>SOMETHING WENT WRONG</div>
        <div style={{fontSize:14, color:'#3F5F4A', maxWidth:320, lineHeight:1.6}}>
          PlayPal hit an unexpected error. Your round data is saved on this device — reloading will pick up where you left off.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background:'#0E2B20', color:'#F6F4EE', border:'none', borderRadius:12,
            padding:'14px 28px', fontFamily:'inherit', fontWeight:800, fontSize:15,
            letterSpacing:1, cursor:'pointer',
          }}>
          RELOAD PLAYPAL
        </button>
      </div>
    );
  }
}

const App = () => {
  const deviceId = React.useMemo(() => window.__PP_DEVICE_ID, []);

  const [screen, setScreen] = React.useState(() => {
    if (window.__pp_pending_join_code) return 'home';
    const ss = sessionStorage.getItem('pp_screen');
    // 'summary', 'viewround', and 'trip' depend on in-memory state that does
    // not survive a reload — restoring them would render a blank screen.
    const restorable = ['home', 'setup', 'score', 'trips', 'stats'];
    if (ss && restorable.includes(ss)) {
      if (ss === 'score') return localStorage.getItem('pp_round') ? 'score' : 'home';
      return ss;
    }
    if (localStorage.getItem('pp_active_round') === '1' && localStorage.getItem('pp_round')) return 'score';
    return 'home';
  });

  const [players, setPlayers] = React.useState(() => {
    try {
      const saved = localStorage.getItem('pp_players');
      return saved ? JSON.parse(saved) : DEFAULT_PLAYERS;
    } catch(e) { return DEFAULT_PLAYERS; }
  });

  const [customCourses, setCustomCourses] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('pp_custom_courses') || '[]'); } catch(e) { return []; }
  });

  const [round, setRound] = React.useState(() => {
    if (window.__pp_pending_join_code) return null;
    const savedScreen = sessionStorage.getItem('pp_screen');
    const isActiveRound = savedScreen === 'score'
      || localStorage.getItem('pp_active_round') === '1';
    if (isActiveRound) {
      try {
        const saved = localStorage.getItem('pp_round');
        return saved ? JSON.parse(saved) : null;
      } catch(e) {
        localStorage.removeItem('pp_active_round');
        return null;
      }
    }
    return null;
  });

  const [finalScores,      setFinalScores]      = React.useState(null);
  const [finalWolf,        setFinalWolf]        = React.useState(null);
  const [finalPutts,       setFinalPutts]       = React.useState(null);
  const [finalPresses,     setFinalPresses]     = React.useState([]);
  const [finalChips,       setFinalChips]       = React.useState({});
  const [finalPopFlags,    setFinalPopFlags]    = React.useState(null);
  const [finalBBBData,     setFinalBBBData]     = React.useState(null);
  const [finalTeeBallData, setFinalTeeBallData] = React.useState(null);
  const [finalFirData,     setFinalFirData]     = React.useState(null);
  const [finalGirData,     setFinalGirData]     = React.useState(null);
  const [finalExtraStats,  setFinalExtraStats]  = React.useState(null);
  const [statsPlayerId,    setStatsPlayerId]    = React.useState(null);

  const [viewedRoundData, setViewedRoundData] = React.useState(null);
  const [viewSyncCode,    setViewSyncCode]    = React.useState(null);

  const [tweaks,     setTweaks]     = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);

  const [recentRounds, setRecentRounds] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('pp_recent') || '[]'); } catch(e) { return []; }
  });

  const [trips,           setTrips]           = React.useState([]);
  const [viewedTrip,      setViewedTrip]      = React.useState(null);
  const [tripRounds,      setTripRounds]      = React.useState(null); // null = loading

  React.useEffect(() => { sessionStorage.setItem('pp_screen', screen); }, [screen]);

  // ── Deep-link join — runs exactly once on mount ──────────────────────────
  React.useEffect(() => {
    const code = window.__pp_pending_join_code;
    if (!code) return;
    window.__pp_pending_join_code = null;

    _updateJoinOverlay('Looking up round…', null);

    try {
      const localRaw = localStorage.getItem('pp_round');
      if (localRaw) {
        const localRound = JSON.parse(localRaw);
        if (localRound.syncCode === code) { _completeJoin(localRound); return; }
      }
    } catch(e) {}

    window.RoundSyncService.fetchRound(code, function(fetchedRound, err) {
      if (!fetchedRound) {
        const msg = err === 'Round not found'
          ? 'Round "' + code + '" not found or no longer active.\nAsk the host to share their code again.'
          : 'Connection error. Check your internet and try again.';
        _updateJoinOverlay(null, msg);
        return;
      }
      _completeJoin(fetchedRound);
    });

    function _completeJoin(r) {
      localStorage.setItem('pp_round', JSON.stringify(r));
      sessionStorage.setItem('pp_screen', 'score');
      localStorage.setItem('pp_active_round', '1');
      setRound(r);
      setScreen('score');
      const overlay = document.getElementById('pp-join-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  }, []);

  React.useEffect(() => {
    PlayerSyncService.subscribe(function(remotePlayers) {
      if (remotePlayers && remotePlayers.length > 0) {
        setPlayers(remotePlayers);
        localStorage.setItem('pp_players', JSON.stringify(remotePlayers));
      }
    });
    return () => { PlayerSyncService.unsubscribe(); };
  }, []);

  React.useEffect(() => {
    CourseSyncService.subscribe(function(remoteCourses) {
      setCustomCourses(function(prev) {
        const remoteIds = new Set(remoteCourses.map(function(c) { return c.id; }));
        const localOnly = prev.filter(function(c) { return !remoteIds.has(c.id); });
        const merged    = remoteCourses.concat(localOnly);
        localStorage.setItem('pp_custom_courses', JSON.stringify(merged));
        return merged;
      });
    });
    return () => { CourseSyncService.unsubscribe(); };
  }, []);

  React.useEffect(() => {
    SavedRoundsSyncService.subscribe(function(remoteRounds) {
      setRecentRounds(function(prev) {
        const merged = {};
        remoteRounds.forEach(function(r) { if (r.syncCode) merged[r.syncCode] = r; });
        prev.forEach(function(r) { if (r.syncCode) merged[r.syncCode] = r; });
        const noCode = prev.filter(function(r) { return !r.syncCode; });
        const result = Object.values(merged)
          .concat(noCode)
          .sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); })
          .slice(0, 20);
        localStorage.setItem('pp_recent', JSON.stringify(result));
        return result;
      });
    });
    return () => { SavedRoundsSyncService.unsubscribe(); };
  }, []);

  React.useEffect(() => {
    if (window.GolfTripSyncService) {
      GolfTripSyncService.fetchAllTrips(function(fetched) {
        if (fetched && fetched.length > 0) {
          setTrips(fetched.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }));
        }
      });
    }
  }, []);

  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode')   setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const saveTweakKey = (key, val) => {
    const next = { ...tweaks, [key]: val };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
  };

  const handleManagePlayers = (updated) => {
    setPlayers(updated);
    localStorage.setItem('pp_players', JSON.stringify(updated));
    PlayerSyncService.save(updated, function(ok) {
      if (!ok) console.warn('[PlayPal] Player sync to RTDB failed — saved locally');
    });
  };

  const handleCourseSaved = () => {};

  const handleStartRound = (config) => {
    const { tripSelection, ...rest } = config;

    const _finishStart = function(tripId) {
      const r = { ...rest, id: Date.now(), tripId: tripId || null };
      if (window.CourseService && r.course) {
        try { window.CourseService.recordRecent(r.course); } catch(e) {}
      }
      setRound(r);
      localStorage.setItem('pp_round', JSON.stringify(r));
      sessionStorage.setItem('pp_screen', 'score');
      localStorage.setItem('pp_active_round', '1');
      setScreen('score');
      RoundSyncService.saveRound(r, function(ok) {
        if (!ok) console.warn('[PlayPal] Cloud round save failed — works locally');
      });
    };

    if (tripSelection && tripSelection.mode === 'new' && tripSelection.newTrip && tripSelection.newTrip.name) {
      const newTrip = {
        id:        'trip_' + Date.now(),
        name:      tripSelection.newTrip.name,
        location:  tripSelection.newTrip.location || '',
        startDate: new Date().toISOString().split('T')[0],
        endDate:   '',
        notes:     '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (window.GolfTripSyncService) {
        GolfTripSyncService.saveTrip(newTrip, function() {
          setTrips(function(prev) { return [newTrip, ...prev]; });
          _finishStart(newTrip.id);
        });
      } else {
        _finishStart(null);
      }
    } else if (tripSelection && tripSelection.mode === 'existing' && tripSelection.tripId) {
      _finishStart(tripSelection.tripId);
    } else {
      _finishStart(null);
    }

  };

  const handleSaveRound = (scores, wolfData, putts, presses = [], chips = {}, popFlags = {}, bbbData = {}, teeBallData = {}, firData = {}, girData = {}, extraStats = {}) => {
    setFinalScores(scores);
    setFinalWolf(wolfData);
    setFinalPutts(putts);
    setFinalPresses(presses);
    setFinalChips(chips);
    setFinalPopFlags(popFlags);
    setFinalBBBData(bbbData);
    setFinalTeeBallData(teeBallData);
    setFinalFirData(firData);
    setFinalGirData(girData);
    setFinalExtraStats(extraStats);

    RoundSyncService.unsubscribeRound();

    const holeScores = {};
    round.players.forEach(function(player) {
      holeScores[player.id] = round.course.holes.map(function(_, i) {
        return {
          strokes:    scores[player.id]?.[i] || null,
          putts:      (putts[player.id]?.[i]) || 0,
          gettingPop: !!(popFlags[player.id]?.[i]),
        };
      });
    });

    // Compute payouts at save time so trip dashboard can aggregate without re-running format logic.
    const _ptmState = window.computePTMState
      ? window.computePTMState(scores, putts || {}, round.players, round.course, round.players[0].id)
      : { holderId: null };
    const _computedPayouts = window.calcAllPayouts
      ? window.calcAllPayouts(scores, wolfData || {}, round.players, round.course, round.formats, presses || [], _ptmState.holderId, popFlags || {}, null, bbbData || {}, teeBallData || {})
      : {};

    const completedRound = {
      ...round,
      holeScores,
      payouts: _computedPayouts,
      putts:    putts || {},
      firData:  firData || {},
      girData:  girData || {},
      extraStats: extraStats || {},
      tripId:  round.tripId || null,
      date: new Date().toLocaleDateString('en-US', {
        weekday:'long', month:'long', day:'numeric', year:'numeric',
      }),
    };

    RoundSyncService.saveRound(completedRound, function() {});

    if (round.syncCode) {
      const snapshot = {
        round:         completedRound,
        scores,
        wolfData,
        putts,
        nassauPresses: presses,
        popFlags,
        bbbData,
        teeBallData,
        firData,
        girData,
        extraStats,
        savedAt:       Date.now(),
      };
      try {
        localStorage.setItem('pp_round_snap_' + round.syncCode, JSON.stringify(snapshot));
      } catch(e) {
        console.warn('[PlayPal] Could not save round snapshot locally:', e);
      }
    }

    const roundMeta = {
      courseName: round.course.name,
      date:       new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
      players:    round.players.length,
      formats:    round.formats.map(f => FORMAT_INFO[f.type].label).join(' · '),
      syncCode:   round.syncCode || null,
      tripId:     round.tripId || null,
      tripName:   round.tripId ? (trips.find(function(t){return t.id===round.tripId;})||{}).name || null : null,
      savedAt:    Date.now(),
    };

    setRecentRounds(function(prev) {
      const next = [roundMeta, ...prev.filter(r => r.syncCode !== roundMeta.syncCode)].slice(0, 20);
      localStorage.setItem('pp_recent', JSON.stringify(next));
      return next;
    });

    if (roundMeta.syncCode) {
      SavedRoundsSyncService.save(roundMeta, function(ok) {
        if (!ok) console.warn('[PlayPal] Saved round sync to RTDB failed — saved locally');
      });
    }

    localStorage.removeItem('pp_active_round');
    setScreen('summary');
  };

  const handleOpenStats = (playerId) => {
    setStatsPlayerId(playerId || null);
    setScreen('stats');
  };

  const handleViewRound = (syncCode) => {
    if (!syncCode) return;
    try {
      const raw = localStorage.getItem('pp_round_snap_' + syncCode);
      if (raw) {
        const snap = JSON.parse(raw);
        setViewedRoundData(snap);
        setViewSyncCode(syncCode);
        setScreen('viewround');
        return;
      }
    } catch(e) {
      console.warn('[PlayPal] Could not read local round snapshot:', e);
    }
    setViewedRoundData(null);
    setViewSyncCode(syncCode);
    setScreen('viewround');
  };

  const handleBackFromView = () => {
    setViewedRoundData(null);
    setViewSyncCode(null);
    setScreen('home');
  };

  const handleViewTrip = (trip) => {
    setViewedTrip(trip);
    setTripRounds(null);
    setScreen('trip');
    if (window.GolfTripSyncService) {
      GolfTripSyncService.fetchTripRounds(trip.id, function(rds) {
        setTripRounds(rds || []);
      });
    } else {
      setTripRounds([]);
    }
  };

  const handleBackFromTrip = () => {
    setViewedTrip(null);
    setTripRounds(null);
    setScreen('trips');
  };

  const handleNewRound = () => {
    setRound(null);
    setFinalScores(null);
    setViewedRoundData(null);
    setViewSyncCode(null);
    localStorage.removeItem('pp_round');
    localStorage.removeItem('pp_active_round');
    sessionStorage.removeItem('pp_screen');
    setScreen('home');
  };

  const handleExitRound = () => {
    RoundSyncService.unsubscribeRound();
    sessionStorage.removeItem('pp_screen');
    localStorage.removeItem('pp_active_round');
    setScreen('home');
  };

  const handleJoinRound = (savedRound) => {
    setRound(savedRound);
    sessionStorage.setItem('pp_screen', 'score');
    localStorage.setItem('pp_active_round', '1');
    setScreen('score');
  };

  const cssVars = {
    '--green': tweaks.accentGreen,
    '--gold':  tweaks.accentGold,
    '--bg':    tweaks.bgColor,
    '--card':  tweaks.cardBg,
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:tweaks.bgColor, ...cssVars }}>
      <NavBar
        syncCode={tweaks.showSyncCode && round && screen === 'score' ? round.syncCode : null}
        onHome={() => setScreen(round && screen === 'score' ? 'score' : 'home')}
        currentScreen={screen}
      />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

        {screen === 'home' &&
          <HomeScreen
            onStartRound={() => setScreen('setup')}
            players={players}
            onManagePlayers={handleManagePlayers}
            recentRounds={recentRounds}
            onJoinRound={handleJoinRound}
            onViewRound={handleViewRound}
            customCourses={customCourses}
            onCourseSaved={handleCourseSaved}
            onOpenStats={handleOpenStats}
          />
        }

        {screen === 'setup' &&
          <SetupScreen
            allPlayers={players}
            customCourses={customCourses}
            onStart={handleStartRound}
          />
        }

        {screen === 'stats' &&
          <StatsScreen players={players} initialPlayerId={statsPlayerId} />
        }

        {screen === 'score' && round &&
          <ScoreEntry
            round={round}
            onSaveRound={handleSaveRound}
            onExitRound={handleExitRound}
            deviceId={deviceId}
          />
        }

        {screen === 'viewround' && (
          viewedRoundData ? (
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
              <div style={{
                flexShrink:0, display:'flex', alignItems:'center', height:52,
                background:'#0E2B20', borderBottom:'1px solid rgba(255,255,255,0.1)', padding:'0 12px',
              }}>
                <button onClick={handleBackFromView} aria-label="Back to home" style={{
                  background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, cursor:'pointer',
                  fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14,
                  letterSpacing:0.5, color:'#F6F4EE', padding:'6px 12px',
                  WebkitTapHighlightColor:'transparent',
                }}>
                  ‹ BACK
                </button>
                <span style={{
                  flex:1, textAlign:'center', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
                  fontWeight:800, fontSize:15, letterSpacing:1, color:'#C8A15A',
                }}>
                  ROUND HISTORY
                </span>
                <span style={{width:80}}/>
              </div>
              <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>
                <SummaryScreen
                  round={viewedRoundData.round}
                  scores={viewedRoundData.scores}
                  wolfData={viewedRoundData.wolfData}
                  putts={viewedRoundData.putts}
                  nassauPresses={viewedRoundData.nassauPresses || []}
                  manualChips={{}}
                  popFlags={viewedRoundData.popFlags || {}}
                  bbbData={viewedRoundData.bbbData || {}}
                  teeBallData={viewedRoundData.teeBallData || {}}
                  firData={viewedRoundData.firData || {}}
                  girData={viewedRoundData.girData || {}}
                  extraStats={viewedRoundData.extraStats || {}}
                  onNewRound={null}
                  readOnly={true}
                />
              </div>
            </div>
          ) : (
            <RoundViewer
              syncCode={viewSyncCode}
              onBack={handleBackFromView}
            />
          )
        )}

        {screen === 'trips' && (
          <TripListScreen
            trips={trips}
            onView={handleViewTrip}
            onNewRound={() => setScreen('setup')}
          />
        )}

        {screen === 'trip' && viewedTrip && (
          <TripDashboard
            trip={viewedTrip}
            rounds={tripRounds}
            onBack={handleBackFromTrip}
            onViewRound={handleViewRound}
          />
        )}

        {screen === 'summary' && round && finalScores &&
          <SummaryScreen
            round={round}
            scores={finalScores}
            wolfData={finalWolf}
            putts={finalPutts}
            nassauPresses={finalPresses}
            manualChips={finalChips}
            popFlags={finalPopFlags || {}}
            bbbData={finalBBBData || {}}
            teeBallData={finalTeeBallData || {}}
            firData={finalFirData || {}}
            girData={finalGirData || {}}
            extraStats={finalExtraStats || {}}
            onNewRound={handleNewRound}
            readOnly={false}
          />
        }

      </div>

      {/* Bottom Tab Nav — hidden on score, viewround, and trip detail screens */}
      {screen !== 'score' && screen !== 'viewround' && screen !== 'trip' &&
        <nav aria-label="Main navigation" style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,0.1)', background:'#0E2B20', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
          {[
            { id:'home',    icon:'🏠', label:'HOME' },
            { id:'stats',   icon:'📈', label:'STATS' },
            { id:'trips',   icon:'🗺️', label:'TRIPS' },
            { id:'setup',   icon:'⛳', label:'NEW ROUND' },
            ...(round       ? [{ id:'score',   icon:'🏌️', label:'SCORING' }] : []),
            ...(finalScores ? [{ id:'summary', icon:'📊', label:'RESULTS' }] : []),
            ...(round       ? [{ id:'__exit',  icon:'🚪', label:'EXIT'    }] : []),
          ].map(tab =>
            <button key={tab.id}
              onClick={() => tab.id === '__exit' ? handleExitRound() : setScreen(tab.id)}
              aria-label={tab.label}
              aria-current={screen === tab.id ? 'page' : undefined}
              style={{
                flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', padding:'12px 4px 10px', cursor:'pointer',
                background:'none', border:'none', minHeight:48,
                color: tab.id === '__exit' ? '#FCA5A5'
                     : screen === tab.id  ? tweaks.accentGold
                     : 'rgba(246,244,238,0.65)',
                borderTop: screen === tab.id && tab.id !== '__exit'
                  ? `2px solid ${tweaks.accentGold}`
                  : '2px solid transparent',
                transition: 'color 0.15s',
              }}>
              <span aria-hidden="true" style={{ fontSize:20, lineHeight:1 }}>{tab.icon}</span>
              <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, fontWeight:700, letterSpacing:0.8, marginTop:4 }}>{tab.label}</span>
            </button>
          )}
        </nav>
      }

      {tweaksOpen && (
        <div style={{
          position:'fixed', bottom:20, right:20, background:'#FFFFFF',
          border:'1px solid #E7E3D9', borderRadius:16, padding:16, zIndex:9998,
          minWidth:220, boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:'#0E2B20', letterSpacing:1, marginBottom:12 }}>APPEARANCE</div>
          {[['accentGreen','Green'],['accentGold','Gold'],['bgColor','Background'],['cardBg','Card']].map(([k,label]) =>
            <div key={k} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A' }}>{label}</span>
              <input type="color" value={tweaks[k]} aria-label={label + ' color'} onChange={e => saveTweakKey(k, e.target.value)} style={{ border:'none', background:'none', cursor:'pointer', width:36, height:28, padding:'5px' }} />
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
            <span style={{ fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A' }}>Show Sync Code</span>
            <div role="switch" aria-checked={tweaks.showSyncCode} tabIndex={0}
              onClick={() => saveTweakKey('showSyncCode', !tweaks.showSyncCode)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); saveTweakKey('showSyncCode', !tweaks.showSyncCode); } }}
              style={{ width:40, height:22, borderRadius:11, background:tweaks.showSyncCode ? tweaks.accentGreen : '#2A2A2A', cursor:'pointer', display:'flex', alignItems:'center', padding:2, transition:'background 0.2s' }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', transform:tweaks.showSyncCode ? 'translateX(18px)' : 'translateX(0)', transition:'transform 0.2s' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
