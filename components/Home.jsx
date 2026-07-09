// Home.jsx — Dashboard / Landing Screen

const HomeScreen = ({ onStartRound, players, onManagePlayers, recentRounds, onJoinRound, onViewRound, customCourses, onCourseSaved, onOpenStats }) => {
  const [showPlayers, setShowPlayers]   = React.useState(false);
  const [editPlayer,  setEditPlayer]    = React.useState(null);
  const [localPlayers,setLocalPlayers]  = React.useState(players);
  const [form, setForm]                 = React.useState({ name:'', initials:'', ghin:'', ghinLogin:'', email:'', venmo:'', handicap:'', color:'#15803D', preferredTee:'', dominantHand:'R', homeCourseName:'' });
  const [hcpSyncMsg, setHcpSyncMsg]     = React.useState('');
  const [resume]                        = React.useState(() => window.RoundHistoryService ? window.RoundHistoryService.unfinishedRound() : null);
  const [joinError,   setJoinError]     = React.useState('');
  const [joining,     setJoining]       = React.useState(false);
  const [showCourses, setShowCourses]   = React.useState(false);
  const [addCourseOpen, setAddCourseOpen] = React.useState(false);

  const courses = customCourses || [];

  // Keep the visible list in sync when players update from cloud sync
  React.useEffect(() => { setLocalPlayers(players); }, [players]);

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
    if (!params.has('join') && !params.has('code')) setShowJoin(false);
  }, []);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { setJoinError('Enter a valid round code'); return; }
    const roundRaw = localStorage.getItem('pp_round');
    if (roundRaw) {
      try {
        const round = JSON.parse(roundRaw);
        if (round.syncCode === code) { onJoinRound(round); setShowJoin(false); _clearJoinParam(); return; }
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
      setJoinError(`Round "${code}" not found on this device.`);
    }
  };

  function _clearJoinParam() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('join'); url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
    } catch(e) {}
  }

  const colors = ['#15803D','#DC2626','#C8A15A','#2563EB','#9333EA','#EA580C','#0891B2'];

  const openEdit = (p) => {
    setEditPlayer(p);
    setHcpSyncMsg('');
    const normalized = p && window.ProfileService ? window.ProfileService.normalizePlayer(p) : p;
    setForm(normalized ? {...normalized} : {name:'',initials:'',ghin:'',ghinLogin:'',email:'',venmo:'',handicap:'',color:'#15803D',preferredTee:'',dominantHand:'R',homeCourseName:''});
  };

  const syncHandicap = () => {
    if (!window.HandicapService) return;
    setHcpSyncMsg('Checking…');
    window.HandicapService.fetchIndex(form, (idx, err) => {
      if (idx === null) { setHcpSyncMsg(err || 'Handicap service unavailable'); return; }
      setForm(f => ({ ...f, handicap: String(idx), handicapSource: 'provider', handicapUpdatedAt: Date.now() }));
      setHcpSyncMsg('Updated from handicap service ✓');
    });
  };

  const savePlayer = () => {
    if (!form.name.trim()) return;
    const base = {
      ...form,
      name:     form.name.trim(),
      handicap: Math.max(0, parseFloat(form.handicap) || 0),
    };
    const normalized = window.ProfileService ? window.ProfileService.normalizePlayer(base) : base;
    const updated = normalized.initials ? normalized : {...normalized, initials: normalized.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)};
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
    setAddCourseOpen(false);
    setShowCourses(true);
    if (onCourseSaved) onCourseSaved(newCourse, allCourses);
  };

  const CourseBuilderComponent = window.CourseBuilder;

  const IconCourses = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 14 Q5 8 9 10 Q13 12 17 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
      <path d="M13 5 L13 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13 5.5 L16 7 L13 8Z" fill="currentColor"/>
    </svg>
  );

  const IconJoin = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1 L9 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M1 9 L17 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    </svg>
  );

  const inputStyle = {
    width:'100%', background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:12,
    padding:'12px 14px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, outline:'none', boxSizing:'border-box',
  };

  return (
    <div style={homeS.root}>
      {/* Hero */}
      <div style={homeS.hero}>
        {/* Logo mark */}
        <div style={homeS.logoWrap}>
          <div style={homeS.logoIconWrap}>
            <PPLogo size={68} />
          </div>
          <div>
            <div style={homeS.logoText}>
              <span style={{ color:'#C8A15A', fontFamily:"'Plus Jakarta Sans', 'Playfair Display', Georgia, serif" }}>Play</span><span style={{ color:'#0E2B20', fontFamily:"'Plus Jakarta Sans', 'Playfair Display', Georgia, serif" }}>Pal</span>
            </div>
            <div style={homeS.logoSub}>YOUR GAME. YOUR CREW. YOUR SCORE.</div>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          onClick={onStartRound}
          style={{
            width:'100%', maxWidth:360, padding:'18px 20px',
            background:'#0E2B20',
            border:'none', borderRadius:16, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            WebkitTapHighlightColor:'transparent',
            boxShadow:'0 6px 24px rgba(14,43,32,0.25)',
            transition:'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseDown={e => { e.currentTarget.style.transform='scale(0.98)'; }}
          onMouseUp={e => { e.currentTarget.style.transform='scale(1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6" r="3" fill="#C8A15A"/>
            <rect x="9" y="9" width="2" height="8" rx="1" fill="#C8A15A"/>
            <rect x="5" y="17" width="10" height="1.5" rx="0.75" fill="#C8A15A"/>
          </svg>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:17, letterSpacing:0.3, color:'#F6F4EE'}}>START NEW ROUND</span>
        </button>

        {/* Secondary actions */}
        <div style={{display:'flex', gap:10, width:'100%', maxWidth:360}}>
          <button
            onClick={()=>setShowCourses(true)}
            style={{
              flex:1, padding:'14px 10px', background:'#FFFFFF',
              border:'1px solid #E7E3D9', borderRadius:14, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              WebkitTapHighlightColor:'transparent',
              boxShadow:'0 2px 8px rgba(14,43,32,0.06)',
              transition:'transform 0.1s',
            }}
            onMouseDown={e => { e.currentTarget.style.transform='scale(0.97)'; }}
            onMouseUp={e => { e.currentTarget.style.transform='scale(1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
          >
            <span style={{color:'#0E2B20'}}><IconCourses /></span>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, letterSpacing:0.3, color:'#0E2B20'}}>COURSES</span>
          </button>
          <button
            onClick={()=>setShowJoin(true)}
            style={{
              flex:1, padding:'14px 10px', background:'#FFFFFF',
              border:'1px solid #E7E3D9', borderRadius:14, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              WebkitTapHighlightColor:'transparent',
              boxShadow:'0 2px 8px rgba(14,43,32,0.06)',
              transition:'transform 0.1s',
            }}
            onMouseDown={e => { e.currentTarget.style.transform='scale(0.97)'; }}
            onMouseUp={e => { e.currentTarget.style.transform='scale(1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
          >
            <span style={{color:'#3F5F4A'}}><IconJoin /></span>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, letterSpacing:0.3, color:'#0E2B20'}}>JOIN ROUND</span>
          </button>
        </div>
      </div>

      {/* Resume unfinished round */}
      {resume && (
        <div style={homeS.section}>
          <Label style={{marginBottom:12, display:'block'}}>Round In Progress</Label>
          <div style={{...homeS.roundCard, border:'1px solid rgba(200,161,90,0.45)', background:'rgba(200,161,90,0.05)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, minWidth:0}}>
              <span style={{fontSize:22, flexShrink:0}}>⛳</span>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{resume.round.course.name}</div>
                <div style={{fontSize:11, color:'#3F5F4A', marginTop:2, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                  {resume.holesScored} hole{resume.holesScored!==1?'s':''} scored · {resume.round.players.length} players
                </div>
              </div>
            </div>
            <button onClick={()=>onJoinRound(resume.round)}
              style={{background:'#C8A15A', border:'none', borderRadius:10, padding:'9px 16px', cursor:'pointer', flexShrink:0,
                fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, letterSpacing:0.5, color:'#0E2B20',
                WebkitTapHighlightColor:'transparent', boxShadow:'0 2px 10px rgba(200,161,90,0.3)'}}>
              RESUME →
            </button>
          </div>
        </div>
      )}

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <div style={homeS.section}>
          <Label style={{marginBottom:12, display:'block'}}>Recent Rounds</Label>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {recentRounds.map((r, i) => {
              const tappable = !!(r.syncCode && onViewRound);
              return (
                <div key={r.syncCode || i}
                  onClick={() => tappable && onViewRound(r.syncCode)}
                  style={{...homeS.roundCard, cursor: tappable ? 'pointer' : 'default'}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:40, height:40, borderRadius:12, background:'rgba(14,43,32,0.06)', border:'1px solid rgba(14,43,32,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="6" r="2.5" fill="#0E2B20"/>
                        <rect x="8.25" y="8.5" width="1.5" height="6" rx="0.75" fill="#C8A15A"/>
                        <rect x="5" y="16" width="8" height="1" rx="0.5" fill="#E7E3D9"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20', letterSpacing:0.2}}>{r.courseName}</div>
                      <div style={{fontSize:11, color:'#3F5F4A', marginTop:2, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{r.date} · {r.players} players</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#C8A15A', fontWeight:700, letterSpacing:0.3}}>{r.formats}</div>
                    {tappable && <div style={{fontSize:10, color:'#0E2B20', marginTop:3, letterSpacing:0.5, fontWeight:600}}>VIEW →</div>}
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
          <button
            onClick={()=>{openEdit(null); setShowPlayers(true);}}
            style={{
              background:'#0E2B20', border:'none',
              borderRadius:10, padding:'6px 14px', cursor:'pointer',
              fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:0.3, color:'#F6F4EE',
              WebkitTapHighlightColor:'transparent',
            }}
          >+ ADD</button>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {localPlayers.map(p => (
            <div key={p.id} style={homeS.playerCard} onClick={()=>{ openEdit(p); setShowPlayers(true); }}>
              <Avatar player={p} size={44} />
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20', letterSpacing:0.2}}>{p.name}</div>
                <div style={{fontSize:11, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', marginTop:1}}>HCP {p.handicap} · GHIN {p.ghin}</div>
                <div style={{fontSize:10, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', marginTop:1}}>@{p.venmo}</div>
              </div>
              <div style={{color:'#C8D5C0', fontSize:20, fontWeight:400}}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer — support & legal */}
      <div style={{padding:'18px 16px 26px', textAlign:'center'}}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A'}}>
          <a href="support.html" style={{color:'#3F5F4A', textDecoration:'underline'}}>Support</a>
          {'  ·  '}
          <a href="privacy.html" style={{color:'#3F5F4A', textDecoration:'underline'}}>Privacy Policy</a>
          {'  ·  '}
          <a href="terms.html" style={{color:'#3F5F4A', textDecoration:'underline'}}>Terms of Use</a>
        </div>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A', marginTop:6, letterSpacing:0.5}}>
          PlayPal v1.6.2
        </div>
      </div>

      {/* Join Round Modal */}
      <Modal open={showJoin} onClose={()=>{ setShowJoin(false); setJoinError(''); setJoining(false); }} title="Join a Round">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', lineHeight:1.7}}>
            Enter the 6-character code shown on the scorer's device.
          </div>
          <div>
            <Label htmlFor="pp-join-code" style={{display:'block', marginBottom:6}}>ROUND CODE</Label>
            <input
              id="pp-join-code"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && !joining && handleJoin()}
              maxLength={8} placeholder="e.g. AB3X9K" autoFocus disabled={joining}
              style={{width:'100%', background:'#F6F4EE', border:`1.5px solid ${joinError?'#DC2626':'#E7E3D9'}`, borderRadius:12,
                padding:'14px 16px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800,
                fontSize:28, letterSpacing:6, outline:'none', boxSizing:'border-box', textAlign:'center', textTransform:'uppercase',
                opacity: joining ? 0.6 : 1}}
            />
            {joinError && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#DC2626', marginTop:6}}>{joinError}</div>}
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
          {[['name','Full Name'],['ghin','GHIN #'],['ghinLogin','GHIN Login / Email'],['email','Email Address'],['venmo','Venmo Handle']].map(([key,label]) => (
            <div key={key}>
              <Label htmlFor={`pp-player-${key}`} style={{display:'block', marginBottom:4}}>{label}</Label>
              <input id={`pp-player-${key}`} value={form[key] || ''} onChange={e=>setForm({...form,[key]:e.target.value})}
                style={inputStyle}/>
            </div>
          ))}
          <div>
            <Label htmlFor="pp-player-handicap" style={{display:'block', marginBottom:4}}>Handicap Index</Label>
            <div style={{display:'flex', gap:8}}>
              <input id="pp-player-handicap" value={form.handicap} onChange={e=>setForm({...form,handicap:e.target.value, handicapSource:'manual'})} style={{...inputStyle, flex:1}}/>
              <button onClick={syncHandicap}
                style={{background:'#F0EDE4', border:'1px solid #E7E3D9', borderRadius:12, padding:'0 14px', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', WebkitTapHighlightColor:'transparent', flexShrink:0}}>
                ↻ SYNC
              </button>
            </div>
            {hcpSyncMsg && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:hcpSyncMsg.includes('✓')?'#15803D':'#8A9E8A', marginTop:4}}>{hcpSyncMsg}</div>}
          </div>
          <div style={{display:'flex', gap:10}}>
            <div style={{flex:1}}>
              <Label htmlFor="pp-player-tees" style={{display:'block', marginBottom:4}}>Preferred Tees</Label>
              <input id="pp-player-tees" value={form.preferredTee || ''} onChange={e=>setForm({...form,preferredTee:e.target.value})} placeholder="e.g. Blue" style={inputStyle}/>
            </div>
            <div>
              <Label style={{display:'block', marginBottom:4}}>Plays</Label>
              <div style={{display:'flex', gap:6}}>
                {[['R','RIGHTY'],['L','LEFTY']].map(([v,lbl]) => (
                  <button key={v} onClick={()=>setForm({...form, dominantHand:v})} aria-pressed={(form.dominantHand||'R')===v}
                    style={{padding:'12px 12px', borderRadius:12, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12,
                      background:(form.dominantHand||'R')===v?'#0E2B20':'#F6F4EE', color:(form.dominantHand||'R')===v?'#F6F4EE':'#3F5F4A',
                      border:(form.dominantHand||'R')===v?'none':'1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="pp-player-homecourse" style={{display:'block', marginBottom:4}}>Home Course</Label>
            <input id="pp-player-homecourse" value={form.homeCourseName || ''} onChange={e=>setForm({...form,homeCourseName:e.target.value})} placeholder="e.g. Spring Lake Golf Club" style={inputStyle}/>
          </div>
          {editPlayer && onOpenStats && (
            <button onClick={()=>{ setShowPlayers(false); onOpenStats(editPlayer.id); }}
              style={{background:'rgba(200,161,90,0.08)', border:'1px solid rgba(200,161,90,0.3)', borderRadius:12, padding:'12px', cursor:'pointer',
                fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13, letterSpacing:0.5, color:'#C8A15A', WebkitTapHighlightColor:'transparent'}}>
              📈 VIEW CAREER STATS
            </button>
          )}
          <div>
            <Label style={{display:'block', marginBottom:8}}>Color</Label>
            <div style={{display:'flex', gap:8}}>
              {colors.map(c=>(
                <button key={c} onClick={()=>setForm({...form, color:c})} aria-label={`Player color ${c}`} aria-pressed={form.color===c}
                  style={{width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', padding:0,
                    border: form.color===c ? '3px solid #0E2B20':'3px solid transparent', boxSizing:'border-box', WebkitTapHighlightColor:'transparent'}}/>
              ))}
            </div>
          </div>
          <div style={{display:'flex', gap:10, marginTop:8}}>
            <Btn onClick={savePlayer} variant="gold" style={{flex:1}}>SAVE PLAYER</Btn>
            {editPlayer && <Btn onClick={()=>{deletePlayer(editPlayer.id); setShowPlayers(false);}} variant="danger" style={{padding:'13px 20px'}}>DELETE</Btn>}
          </div>
        </div>
      </Modal>

      {/* Course Library Modal */}
      <Modal open={showCourses} onClose={()=>setShowCourses(false)} title="My Courses">
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', lineHeight:1.6}}>
            Add and manage custom courses before you start a round.
          </div>
          <Btn onClick={()=>setAddCourseOpen(true)} variant="gold" style={{width:'100%'}}>+ ADD COURSE</Btn>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflowY:'auto'}}>
            {courses.length === 0 && (
              <div style={{background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:12, padding:'14px 12px', color:'#3F5F4A', fontSize:13, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                No custom courses saved yet.
              </div>
            )}
            {courses.map((c) => (
              <div key={c.id} style={{background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:12, padding:'12px 14px'}}>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20'}}>{c.name}</div>
                <div style={{fontSize:11, color:'#3F5F4A', marginTop:2, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{c.location}</div>
                <div style={{fontSize:10, color:'#8A9E8A', marginTop:2, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>Rating {c.rating} · Slope {c.slope}</div>
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
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#DC2626'}}>Course builder unavailable. Reload and try again.</div>
        )}
      </Modal>
    </div>
  );
};

const homeS = {
  root:       { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:0, background:'#F6F4EE' },
  hero:       { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'36px 20px 28px', borderBottom:'1px solid #E7E3D9', gap:16 },
  logoWrap:   { display:'flex', alignItems:'center', gap:16 },
  logoIconWrap: { width:68, height:68, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'2px solid rgba(200,161,90,0.35)', boxShadow:'0 4px 18px rgba(14,43,32,0.13)', overflow:'hidden' },
  logoText:   { fontSize:38, fontWeight:800, letterSpacing:0.3, lineHeight:1, display:'flex', alignItems:'baseline' },
  logoSub:    { fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, letterSpacing:2.5, color:'#C8A15A', fontWeight:700, marginTop:5 },
  section:    { padding:'20px 16px', borderBottom:'1px solid #E7E3D9' },
  roundCard:  { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'12px 14px', boxShadow:'0 1px 4px rgba(14,43,32,0.05)' },
  playerCard: { display:'flex', alignItems:'center', gap:14, background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'12px 14px', cursor:'pointer', boxShadow:'0 1px 4px rgba(14,43,32,0.05)' },
};

Object.assign(window, { HomeScreen });
