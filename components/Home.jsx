// Home.jsx — Dashboard / Landing Screen

const HomeScreen = ({ onStartRound, players, onManagePlayers, recentRounds, onJoinRound, onViewRound }) => {
  const [showPlayers, setShowPlayers]   = React.useState(false);
  const [editPlayer,  setEditPlayer]    = React.useState(null);
  const [localPlayers,setLocalPlayers]  = React.useState(players);
  const [form, setForm]                 = React.useState({ name:'', initials:'', ghin:'', ghinLogin:'', email:'', venmo:'', handicap:'', color:'#3DCB6C' });
  const [joinError,   setJoinError]     = React.useState('');
  const [joining,     setJoining]       = React.useState(false);
  const [showCourses, setShowCourses]   = React.useState(false);
  const [addCourseOpen, setAddCourseOpen] = React.useState(false);
  const [customCourses, setCustomCourses] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('pp_custom_courses') || '[]'); } catch(e) { return []; }
  });

  const [showJoin, setShowJoin] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('join') || params.has('code');
  });

  const [joinCode, setJoinCode] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('join') || params.get('code') || '';
    return raw.trim().toUpperCase();
  });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('join') && !params.has('code')) {
      setShowJoin(false);
    }
  }, []);

  React.useEffect(() => {
    if (!window.CourseSyncService) return;
    window.CourseSyncService.subscribe(function(remote) {
      if (!remote || remote.length === 0) return;
      setCustomCourses(prev => {
        const remoteIds = new Set(remote.map(c => c.id));
        const localOnly = prev.filter(c => !remoteIds.has(c.id));
        const merged = [...remote, ...localOnly];
        localStorage.setItem('pp_custom_courses', JSON.stringify(merged));
        return merged;
      });
    });
    return () => { window.CourseSyncService.unsubscribe(); };
  }, []);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { setJoinError('Enter a valid round code'); return; }
    const roundRaw = localStorage.getItem('pp_round');
    if (roundRaw) {
      try {
        const round = JSON.parse(roundRaw);
        if (round.syncCode === code) {
          onJoinRound(round); setShowJoin(false); _clearJoinParam(); return;
        }
      } catch(e) {}
    }
    if (window.RoundSyncService) {
      setJoining(true); setJoinError('');
      window.RoundSyncService.fetchRound(code, function(round, err) {
        setJoining(false);
        if (round) {
          localStorage.setItem('pp_round', JSON.stringify(round));
          onJoinRound(round); setShowJoin(false); _clearJoinParam();
        } else {
          setJoinError(err === 'Round not found'
            ? `Round "${code}" not found. Make sure the host has started the round.`
            : `Could not reach the server. Check your connection and try again.`);
        }
      });
    } else {
      setJoinError(`Round "${code}" not found on this device. Make sure you're on the same device or network.`);
    }
  };

  function _clearJoinParam() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('join'); url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    } catch(e) {}
  }

  const colors = ['#3DCB6C','#E5534B','#C9A84C','#7B9FE0','#E07BE0','#E0A87B','#7BE0D4'];

  const openEdit = (p) => {
    setEditPlayer(p);
    setForm(p ? {...p} : {name:'',initials:'',ghin:'',ghinLogin:'',email:'',venmo:'',handicap:'',color:'#3DCB6C'});
  };

  const savePlayer = () => {
    const updated = form.initials ? form : {...form, initials: form.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)};
    if (editPlayer) {
      const next = localPlayers.map(p => p.id === editPlayer.id ? {...updated, id:editPlayer.id} : p);
      setLocalPlayers(next); onManagePlayers(next);
    } else {
      const next = [...localPlayers, {...updated, id:'p'+Date.now()}];
      setLocalPlayers(next); onManagePlayers(next);
    }
    setEditPlayer(null); setShowPlayers(false);
  };

  const deletePlayer = (id) => {
    const next = localPlayers.filter(p=>p.id!==id);
    setLocalPlayers(next); onManagePlayers(next);
  };

  const handleSaveCourse = (newCourse, allCourses) => {
    setCustomCourses(allCourses); setAddCourseOpen(false); setShowCourses(true);
  };

  const CourseBuilderComponent = window.CourseBuilder;

  return (
    <div style={homeS.root}>
      {/* Hero */}
      <div style={homeS.hero}>
        <div style={homeS.logoWrap}>
          <div style={homeS.logoIcon}>🏌️</div>
          <div>
            <div style={homeS.logoText}>PLAYPAL</div>
            <div style={homeS.logoSub}>YOUR GOLF COMPANION</div>
          </div>
        </div>
        <div style={homeS.tagline}>Track every stroke. Every format. Every dollar.</div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', width:'100%', maxWidth:360}}>
          <Btn onClick={onStartRound} variant="gold" style={{flex:1, padding:'16px 24px', fontSize:18, borderRadius:14, boxShadow:'0 4px 32px rgba(201,168,76,0.3)'}}>
            ⛳ START NEW ROUND
          </Btn>
          <Btn onClick={()=>setShowCourses(true)} variant="surface" style={{padding:'16px 18px', fontSize:18, borderRadius:14}}>
            🗺️ COURSES
          </Btn>
          <Btn onClick={()=>setShowJoin(true)} variant="surface" style={{padding:'16px 18px', fontSize:18, borderRadius:14}}>
            🔗 JOIN
          </Btn>
        </div>
      </div>

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <div style={homeS.section}>
          <Label>Recent Rounds</Label>
          <div style={homeS.roundList}>
            {recentRounds.map((r, i) => {
              const tappable = !!(r.syncCode && onViewRound);
              return (
                <div key={i}
                  onClick={() => tappable && onViewRound(r.syncCode)}
                  style={{...homeS.roundCard, cursor: tappable ? 'pointer' : 'default'}}>
                  <div>
                    <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{r.courseName}</div>
                    <div style={{fontSize:12, color:'#7A98BC', marginTop:2}}>{r.date} · {r.players} players</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'Barlow Condensed', fontSize:14, color:'#C9A84C'}}>{r.formats}</div>
                    {tappable && <div style={{fontSize:11, color:'#3DCB6C', marginTop:2}}>VIEW →</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Player Profiles */}
      <div style={homeS.section}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
          <Label>Player Profiles</Label>
          <Btn onClick={()=>{openEdit(null); setShowPlayers(true);}} variant="ghost" style={{padding:'6px 14px', fontSize:13}}>+ ADD PLAYER</Btn>
        </div>
        <div style={homeS.playerGrid}>
          {localPlayers.map(p => (
            <div key={p.id} style={homeS.playerCard} onClick={()=>{ openEdit(p); setShowPlayers(true); }}>
              <Avatar player={p} size={44} />
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', letterSpacing:0.5}}>{p.name}</div>
                <div style={{fontSize:11, color:'#7A98BC'}}>HCP {p.handicap} · GHIN {p.ghin}</div>
                <div style={{fontSize:11, color:'#4A6890', marginTop:1}}>@{p.venmo}</div>
              </div>
              <div style={{fontSize:18, color:'#1E3A6E'}}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* Join Round Modal */}
      <Modal open={showJoin} onClose={()=>{ setShowJoin(false); setJoinError(''); setJoining(false); }} title="Join a Round">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.6}}>
            Enter the 6-character code shown on the scorer's device, or scan their QR code.
          </div>
          <div>
            <Label style={{display:'block', marginBottom:6}}>ROUND CODE</Label>
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && !joining && handleJoin()}
              maxLength={8} placeholder="e.g. AB3X9K" autoFocus disabled={joining}
              style={{width:'100%', background:'#162950', border:`1px solid ${joinError?'#E5534B':'#1E3A6E'}`, borderRadius:8,
                padding:'14px 16px', color:'#fff', fontFamily:'Barlow Condensed', fontWeight:800,
                fontSize:28, letterSpacing:6, outline:'none', boxSizing:'border-box', textAlign:'center', textTransform:'uppercase',
                opacity: joining ? 0.6 : 1}}
            />
            {joinError && <div style={{fontFamily:'DM Sans', fontSize:12, color:'#E5534B', marginTop:6}}>{joinError}</div>}
          </div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>{ setShowJoin(false); setJoinError(''); setJoining(false); }} variant="ghost" style={{flex:1}} disabled={joining}>CANCEL</Btn>
            <Btn onClick={handleJoin} variant="green" style={{flex:1}} disabled={joining}>
              {joining ? '⏳ JOINING…' : 'JOIN ROUND'}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Player Edit Modal */}
      <Modal open={showPlayers} onClose={()=>setShowPlayers(false)} title={editPlayer ? 'Edit Player' : 'New Player'}>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {[['name','Full Name'],['ghin','GHIN #'],['ghinLogin','GHIN Login / Email'],['email','Email Address'],['venmo','Venmo Handle'],['handicap','Handicap Index']].map(([key,label]) => (
            <div key={key}>
              <Label style={{display:'block', marginBottom:4}}>{label}</Label>
              <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
                style={{width:'100%', background:'#162950', border:'1px solid #1E3A6E', borderRadius:8, padding:'10px 12px', color:'#fff', fontFamily:'DM Sans', fontSize:14, outline:'none', boxSizing:'border-box'}}/>
            </div>
          ))}
          <div>
            <Label style={{display:'block', marginBottom:8}}>Color</Label>
            <div style={{display:'flex', gap:8}}>
              {colors.map(c=>(
                <div key={c} onClick={()=>setForm({...form, color:c})}
                  style={{width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: form.color===c ? '3px solid #fff':'3px solid transparent', boxSizing:'border-box'}}/>
              ))}
            </div>
          </div>
          <div style={{display:'flex', gap:10, marginTop:8}}>
            <Btn onClick={savePlayer} variant="green" style={{flex:1}}>SAVE PLAYER</Btn>
            {editPlayer && <Btn onClick={()=>{deletePlayer(editPlayer.id); setShowPlayers(false);}} variant="danger" style={{padding:'12px 20px'}}>DELETE</Btn>}
          </div>
        </div>
      </Modal>

      {/* Course Library Modal */}
      <Modal open={showCourses} onClose={()=>setShowCourses(false)} title="My Courses">
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.5}}>
            Add and manage custom courses before you start a round.
          </div>
          <Btn onClick={()=>setAddCourseOpen(true)} variant="gold" style={{width:'100%'}}>+ ADD COURSE</Btn>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflowY:'auto'}}>
            {customCourses.length === 0 && (
              <div style={{background:'#0A1628', border:'1px solid #1E3A6E', borderRadius:10, padding:'14px 12px', color:'#7A98BC', fontSize:13}}>
                No custom courses saved yet.
              </div>
            )}
            {customCourses.map((c) => (
              <div key={c.id} style={{background:'#0A1628', border:'1px solid #1E3A6E', borderRadius:10, padding:'12px 14px'}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{c.name}</div>
                <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>{c.location}</div>
                <div style={{fontSize:10, color:'#4A6890', marginTop:2}}>Rating {c.rating} · Slope {c.slope}</div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Add Course Modal */}
      <Modal open={addCourseOpen} onClose={()=>setAddCourseOpen(false)} title="Add Course">
        {CourseBuilderComponent ? (
          <CourseBuilderComponent onSave={handleSaveCourse} onCancel={()=>setAddCourseOpen(false)} prefill={null}/>
        ) : (
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#E5534B'}}>Course builder unavailable. Reload and try again.</div>
        )}
      </Modal>
    </div>
  );
};

const homeS = {
  root:       { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:0 },
  hero:       { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px 40px', background:'radial-gradient(ellipse at 50% 0%, rgba(61,203,108,0.08) 0%, transparent 70%)', borderBottom:'1px solid #1E3A6E', gap:16, minHeight:240 },
  logoWrap:   { display:'flex', alignItems:'center', gap:16 },
  logoIcon:   { fontSize:48 },
  logoText:   { fontFamily:'Barlow Condensed', fontSize:48, fontWeight:800, color:'#fff', letterSpacing:3, lineHeight:1 },
  logoSub:    { fontFamily:'Barlow Condensed', fontSize:13, letterSpacing:4, color:'#3DCB6C', fontWeight:600 },
  tagline:    { fontFamily:'DM Sans', fontSize:16, color:'#7A98BC', textAlign:'center' },
  section:    { padding:'24px 20px', borderBottom:'1px solid #1E3A6E' },
  roundList:  { display:'flex', flexDirection:'column', gap:10, marginTop:12 },
  roundCard:  { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'14px 16px' },
  playerGrid: { display:'flex', flexDirection:'column', gap:10 },
  playerCard: { display:'flex', alignItems:'center', gap:14, background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'14px 16px', cursor:'pointer' },
};

Object.assign(window, { HomeScreen });
