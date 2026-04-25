// Home.jsx — Dashboard / Landing Screen

const HomeScreen = ({ onStartRound, players, onManagePlayers, recentRounds, onJoinRound }) => {
  const [showPlayers, setShowPlayers]   = React.useState(false);
  const [editPlayer,  setEditPlayer]    = React.useState(null);
  const [localPlayers,setLocalPlayers]  = React.useState(players);
  const [form, setForm]                 = React.useState({ name:'', initials:'', ghin:'', ghinLogin:'', email:'', venmo:'', handicap:'', color:'#3DCB6C' });
  const [joinCode,    setJoinCode]      = React.useState('');
  const [joinError,   setJoinError]     = React.useState('');

  // Auto-open join modal when URL has ?join=CODE
  const [showJoin, setShowJoin] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('join');
  });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('join');
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { setJoinError('Enter a valid round code'); return; }
    // Look up round in localStorage by syncCode
    const roundRaw = localStorage.getItem('pp_round');
    if (roundRaw) {
      const round = JSON.parse(roundRaw);
      if (round.syncCode === code) {
        // Found the active round — navigate directly to scoring
        if (onJoinRound) onJoinRound(round);
        setShowJoin(false);
        // Clear the ?join param from the URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState({}, '', url.toString());
        return;
      }
    }
    setJoinError(`Round "${code}" not found on this device. Make sure you're on the same device or network.`);
  };

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
            {recentRounds.map((r,i) => (
              <div key={i} style={homeS.roundCard}>
                <div>
                  <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff'}}>{r.courseName}</div>
                  <div style={{fontSize:12, color:'#7A98BC', marginTop:2}}>{r.date} · {r.players} players</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'Barlow Condensed', fontSize:14, color:'#C9A84C'}}>{r.formats}</div>
                  <div style={{fontSize:11, color:'#3DCB6C', marginTop:2}}>VIEW →</div>
                </div>
              </div>
            ))}
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
      <Modal open={showJoin} onClose={()=>{ setShowJoin(false); setJoinError(''); }} title="Join a Round">
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.6}}>
            Enter the 6-character code shown on the scorer's device, or scan their QR code.
          </div>
          <div>
            <Label style={{display:'block', marginBottom:6}}>ROUND CODE</Label>
            <input
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={8}
              placeholder="e.g. AB3X9K"
              autoFocus
              style={{width:'100%', background:'#162950', border:`1px solid ${joinError?'#E5534B':'#1E3A6E'}`, borderRadius:8,
                padding:'14px 16px', color:'#fff', fontFamily:'Barlow Condensed', fontWeight:800,
                fontSize:28, letterSpacing:6, outline:'none', boxSizing:'border-box', textAlign:'center', textTransform:'uppercase'}}
            />
            {joinError && <div style={{fontFamily:'DM Sans', fontSize:12, color:'#E5534B', marginTop:6}}>{joinError}</div>}
          </div>
          <div style={{display:'flex', gap:10}}>
            <Btn onClick={()=>{ setShowJoin(false); setJoinError(''); }} variant="ghost" style={{flex:1}}>CANCEL</Btn>
            <Btn onClick={handleJoin} variant="green" style={{flex:1}}>JOIN ROUND</Btn>
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
  roundCard:  { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'14px 16px', cursor:'pointer' },
  playerGrid: { display:'flex', flexDirection:'column', gap:10 },
  playerCard: { display:'flex', alignItems:'center', gap:14, background:'#0F2040', border:'1px solid #1E3A6E', borderRadius:12, padding:'14px 16px', cursor:'pointer' },
};

Object.assign(window, { HomeScreen });
