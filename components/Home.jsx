// Home.jsx — Dashboard / Landing Screen

const HomeScreen = ({ onStartRound, players, onManagePlayers, recentRounds, onJoinRound, onViewRound, customCourses, onCourseSaved }) => {
  const [showPlayers, setShowPlayers]   = React.useState(false);
  const [editPlayer,  setEditPlayer]    = React.useState(null);
  const [localPlayers,setLocalPlayers]  = React.useState(players);
  const [form, setForm]                 = React.useState({ name:'', initials:'', ghin:'', ghinLogin:'', email:'', venmo:'', handicap:'', color:'#2DD97A' });
  const [joinError,   setJoinError]     = React.useState('');
  const [joining,     setJoining]       = React.useState(false);
  const [showCourses, setShowCourses]   = React.useState(false);
  const [addCourseOpen, setAddCourseOpen] = React.useState(false);

  const courses = customCourses || [];

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

  const colors = ['#2DD97A','#E5534B','#D4AF47','#7B9FE0','#E07BE0','#E0A87B','#7BE0D4'];

  const openEdit = (p) => {
    setEditPlayer(p);
    setForm(p ? {...p} : {name:'',initials:'',ghin:'',ghinLogin:'',email:'',venmo:'',handicap:'',color:'#2DD97A'});
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
    setAddCourseOpen(false);
    setShowCourses(true);
    if (onCourseSaved) onCourseSaved(newCourse, allCourses);
  };

  const CourseBuilderComponent = window.CourseBuilder;

  // Icon components from brand asset set
  const IconStartRound = () => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      {/* silhouette group of 4 golfers */}
      <circle cx="4" cy="6" r="2" fill="#0B0F1A"/>
      <path d="M3 9 Q4 15 4 15 L6 15 Q6 12 5.5 9Z" fill="#0B0F1A"/>
      <circle cx="9" cy="6" r="2" fill="#0B0F1A"/>
      <path d="M8 9 Q9 15 9 15 L11 15 Q11 12 10.5 9Z" fill="#0B0F1A"/>
      <circle cx="14" cy="6" r="2" fill="#0B0F1A"/>
      <path d="M13 9 Q14 15 14 15 L16 15 Q16 12 15.5 9Z" fill="#0B0F1A"/>
      <circle cx="19" cy="6" r="2" fill="#0B0F1A"/>
      <path d="M18 9 Q19 15 19 15 L21 15 Q21 12 20.5 9Z" fill="#0B0F1A"/>
      {/* flag */}
      <path d="M11 15 L11 20" stroke="#0B0F1A" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 16 L15 17.5 L11 19Z" fill="#0B0F1A"/>
    </svg>
  );

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
    width:'100%', background:'#0B0F1A', border:'1px solid #1F3354', borderRadius:10,
    padding:'12px 14px', color:'#fff', fontFamily:'DM Sans', fontSize:14, outline:'none', boxSizing:'border-box',
  };

  return (
    <div style={homeS.root}>
      {/* Hero */}
      <div style={homeS.hero}>
        <div style={homeS.logoWrap}>
          <div style={homeS.logoIconWrap}>
            <PPLogo size={52} />
          </div>
          <div>
            <div style={homeS.logoText}>PLAYPAL</div>
            <div style={homeS.logoSub}>YOUR GOLF COMPANION</div>
          </div>
        </div>
        <div style={homeS.tagline}>Track every stroke. Every format. Every dollar.</div>

        {/* Primary CTA */}
        <button
          onClick={onStartRound}
          style={{
            width:'100%', maxWidth:360, padding:'16px 20px',
            background:'linear-gradient(135deg,#D4AF47,#B8962E)',
            border:'none', borderRadius:14, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            WebkitTapHighlightColor:'transparent', position:'relative', overflow:'hidden',
          }}
        >
          {/* background silhouette texture */}
          <div style={{position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', opacity:0.18, display:'flex', gap:6}}>
            {[0,1,2,3].map(i => (
              <svg key={i} width="14" height="22" viewBox="0 0 14 22" fill="none">
                <circle cx="7" cy="4" r="3" fill="#0B0F1A"/>
                <path d="M5 8 Q7 16 7 16 L10 16 Q10 12 9 8Z" fill="#0B0F1A"/>
                <path d="M5 8 L2 13" stroke="#0B0F1A" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ))}
          </div>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6" r="3" fill="#0B0F1A"/>
            <rect x="9" y="9" width="2" height="8" rx="1" fill="#0B0F1A"/>
            <rect x="5" y="17" width="10" height="1.5" rx="0.75" fill="#0B0F1A"/>
          </svg>
          <span style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18, letterSpacing:1.5, color:'#0B0F1A', position:'relative', zIndex:1}}>START NEW ROUND</span>
        </button>

        {/* Secondary actions */}
        <div style={{display:'flex', gap:10, width:'100%', maxWidth:360}}>
          <button
            onClick={()=>setShowCourses(true)}
            style={{
              flex:1, padding:'13px 10px', background:'#112240',
              border:'1px solid #1F3354', borderRadius:12, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              WebkitTapHighlightColor:'transparent',
            }}
          >
            <span style={{color:'#2DD97A'}}><IconCourses /></span>
            <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, letterSpacing:1, color:'#fff'}}>COURSES</span>
          </button>
          <button
            onClick={()=>setShowJoin(true)}
            style={{
              flex:1, padding:'13px 10px', background:'#112240',
              border:'1px solid #1F3354', borderRadius:12, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              WebkitTapHighlightColor:'transparent',
            }}
          >
            <span style={{color:'#7A9EBF'}}><IconJoin /></span>
            <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, letterSpacing:1, color:'#fff'}}>JOIN ROUND</span>
          </button>
        </div>
      </div>

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <div style={homeS.section}>
          <Label style={{marginBottom:12, display:'block'}}>Recent Rounds</Label>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {recentRounds.map((r, i) => {
              const tappable = !!(r.syncCode && onViewRound);
              return (
                <div key={i}
                  onClick={() => tappable && onViewRound(r.syncCode)}
                  style={{...homeS.roundCard, cursor: tappable ? 'pointer' : 'default'}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:36, height:36, borderRadius:10, background:'rgba(45,217,122,0.08)', border:'1px solid rgba(45,217,122,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="6" r="2.5" fill="#2DD97A"/>
                        <rect x="8.25" y="8.5" width="1.5" height="6" rx="0.75" fill="#D4AF47"/>
                        <rect x="5" y="16" width="8" height="1" rx="0.5" fill="#1F3354"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15, color:'#fff', letterSpacing:0.3}}>{r.courseName}</div>
                      <div style={{fontSize:11, color:'#7A9EBF', marginTop:2, fontFamily:'DM Sans'}}>{r.date} · {r.players} players</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'Barlow Condensed', fontSize:12, color:'#D4AF47', fontWeight:700, letterSpacing:0.5}}>{r.formats}</div>
                    {tappable && <div style={{fontSize:10, color:'#2DD97A', marginTop:3, letterSpacing:0.5}}>VIEW →</div>}
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
              background:'rgba(45,217,122,0.08)', border:'1px solid rgba(45,217,122,0.2)',
              borderRadius:8, padding:'5px 12px', cursor:'pointer',
              fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, letterSpacing:1, color:'#2DD97A',
            }}
          >+ ADD PLAYER</button>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {localPlayers.map(p => (
            <div key={p.id} style={homeS.playerCard} onClick={()=>{ openEdit(p); setShowPlayers(true); }}>
              <Avatar player={p} size={44} />
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', letterSpacing:0.3}}>{p.name}</div>
                <div style={{fontSize:11, color:'#7A9EBF', fontFamily:'DM Sans', marginTop:1}}>HCP {p.handicap} · GHIN {p.ghin}</div>
                <div style={{fontSize:10, color:'#3A5880', fontFamily:'DM Sans', marginTop:1}}>@{p.venmo}</div>
              </div>
              <div style={{color:'#1F3354', fontSize:20, fontWeight:400}}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* Join Round Modal */}
      <Modal open={showJoin} onClose={()=>{ setShowJoin(false); setJoinError(''); setJoining(false); }} title="Join a Round">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A9EBF', lineHeight:1.6}}>
            Enter the 6-character code shown on the scorer's device.
          </div>
          <div>
            <Label style={{display:'block', marginBottom:6}}>ROUND CODE</Label>
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && !joining && handleJoin()}
              maxLength={8} placeholder="e.g. AB3X9K" autoFocus disabled={joining}
              style={{width:'100%', background:'#0B0F1A', border:`1px solid ${joinError?'#E5534B':'#1F3354'}`, borderRadius:10,
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
                style={inputStyle}/>
            </div>
          ))}
          <div>
            <Label style={{display:'block', marginBottom:8}}>Color</Label>
            <div style={{display:'flex', gap:8}}>
              {colors.map(c=>(
                <div key={c} onClick={()=>setForm({...form, color:c})}
                  style={{width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer',
                    border: form.color===c ? '3px solid #fff':'3px solid transparent', boxSizing:'border-box'}}/>
              ))}
            </div>
          </div>
          <div style={{display:'flex', gap:10, marginTop:8}}>
            <Btn onClick={savePlayer} variant="gold" style={{flex:1}}>SAVE PLAYER</Btn>
            {editPlayer && <Btn onClick={()=>{deletePlayer(editPlayer.id); setShowPlayers(false);}} variant="danger" style={{padding:'12px 20px'}}>DELETE</Btn>}
          </div>
        </div>
      </Modal>

      {/* Course Library Modal */}
      <Modal open={showCourses} onClose={()=>setShowCourses(false)} title="My Courses">
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A9EBF', lineHeight:1.5}}>
            Add and manage custom courses before you start a round.
          </div>
          <Btn onClick={()=>setAddCourseOpen(true)} variant="gold" style={{width:'100%'}}>+ ADD COURSE</Btn>
          <div style={{display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflowY:'auto'}}>
            {courses.length === 0 && (
              <div style={{background:'#0B0F1A', border:'1px solid #1F3354', borderRadius:10, padding:'14px 12px', color:'#7A9EBF', fontSize:13, fontFamily:'DM Sans'}}>
                No custom courses saved yet.
              </div>
            )}
            {courses.map((c) => (
              <div key={c.id} style={{background:'#0B0F1A', border:'1px solid #1F3354', borderRadius:10, padding:'12px 14px'}}>
                <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{c.name}</div>
                <div style={{fontSize:11, color:'#7A9EBF', marginTop:2, fontFamily:'DM Sans'}}>{c.location}</div>
                <div style={{fontSize:10, color:'#3A5880', marginTop:2, fontFamily:'DM Sans'}}>Rating {c.rating} · Slope {c.slope}</div>
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
  root:       { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:0, background:'#0B0F1A' },
  hero:       { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px 32px', borderBottom:'1px solid #1F3354', gap:16 },
  logoWrap:   { display:'flex', alignItems:'center', gap:16 },
  logoIconWrap: { width:64, height:64, background:'#112240', border:'1px solid #1F3354', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center' },
  logoText:   { fontFamily:'Barlow Condensed', fontSize:42, fontWeight:900, color:'#fff', letterSpacing:3, lineHeight:1 },
  logoSub:    { fontFamily:'Barlow Condensed', fontSize:11, letterSpacing:3.5, color:'#2DD97A', fontWeight:700, marginTop:2 },
  tagline:    { fontFamily:'DM Sans', fontSize:14, color:'#7A9EBF', textAlign:'center' },
  section:    { padding:'20px 16px', borderBottom:'1px solid #1F3354' },
  roundCard:  { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0F1D35', border:'1px solid #1F3354', borderRadius:12, padding:'12px 14px' },
  playerCard: { display:'flex', alignItems:'center', gap:14, background:'#0F1D35', border:'1px solid #1F3354', borderRadius:12, padding:'12px 14px', cursor:'pointer' },
};

Object.assign(window, { HomeScreen });
