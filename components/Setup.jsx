// Setup.jsx — Course persistence + realtime course sync
//             Multi-Nassau: supports 1–3 independent Nassau matches per round
//             Engine games: MatchEngine catalog with team builder + handicaps

const BLANK_HOLES = Array.from({length:18}, (_,i) => ({ num:i+1, par:4, yds:'', hdcp:i+1 }));

// ─── Engine game configuration (Phase 2 formats) ──────────────────────────────

const GameTeamAssigner = ({ def, config, players, onChange }) => {
  const count = def.teams?.count || 2;
  const teams = config.teams || [];
  const teamFor = (pid) => teams.findIndex(t => (t.playerIds||[]).includes(pid));

  const assign = (pid, teamIdx) => {
    const next = teams.map((t, i) => ({
      ...t,
      playerIds: (t.playerIds||[]).filter(id => id !== pid).concat(i === teamIdx ? [pid] : []),
    }));
    onChange({ ...config, teams: next });
  };

  const autoBalance = () => {
    const cfg = window.MatchEngine.defaultConfig(def.id, players);
    onChange({ ...config, teams: cfg.teams });
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:6}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A'}}>TEAMS</div>
        <button onClick={autoBalance} style={{background:'rgba(21,128,61,0.07)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:7, padding:'3px 10px', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:10, letterSpacing:1, color:'#15803D', WebkitTapHighlightColor:'transparent'}}>⚖️ AUTO-BALANCE</button>
      </div>
      {players.map(p => {
        const myTeam = teamFor(p.id);
        return (
          <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, borderRadius:12, padding:'8px 10px', background: myTeam >= 0 ? `${p.color}0A` : '#FFFFFF', border:`1px solid ${myTeam >= 0 ? p.color : '#E7E3D9'}`}}>
            <Avatar player={p} size={26}/>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A', marginRight:2}}>HCP {p.handicap || 0}</span>
            <div style={{display:'flex', gap:4}}>
              {Array.from({length: count}, (_, ti) => (
                <div key={ti} onClick={() => assign(p.id, ti)}
                  style={{padding:'4px 10px', borderRadius:7, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12,
                    background: myTeam === ti ? p.color : '#F0EDE4', color: myTeam === ti ? '#FFFFFF' : '#8A9E8A',
                    border: myTeam === ti ? 'none' : '1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
                  {String.fromCharCode(65 + ti)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const GameConfigCard = ({ game, players, onChange, onRemove }) => {
  const ME = window.MatchEngine;
  const def = ME.get(game.formatId);
  const [showHcp, setShowHcp] = React.useState(false);
  if (!def) return null;
  const config = game.config || {};
  const basisChoice = def.basis === 'choice';
  const basis = basisChoice ? (config.scoringBasis || 'net') : def.basis;
  const validation = ME.validateGame(game, players);

  const setCfg = (patch) => onChange({ ...game, config: { ...config, ...patch } });

  return (
    <div style={{background:'#FFFFFF', border:`1px solid ${validation.ok ? 'rgba(31,61,46,0.25)' : 'rgba(220,38,38,0.3)'}`, borderRadius:14, overflow:'hidden'}}>
      <div style={{display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'rgba(31,61,46,0.04)', borderBottom:'1px solid #E7E3D9'}}>
        <span style={{fontSize:16}}>{def.icon}</span>
        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:'#0E2B20', flex:1}}>{def.label}</span>
        <button onClick={onRemove} style={{background:'none', border:'none', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:1, color:'#8A9E8A', WebkitTapHighlightColor:'transparent', padding:'2px 6px'}}>REMOVE</button>
      </div>
      <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', lineHeight:1.5}}>{def.desc}</div>

        {basisChoice && (
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', width:60}}>SCORING</div>
            {['net','gross'].map(b => (
              <div key={b} onClick={() => setCfg({ scoringBasis: b })}
                style={{flex:1, textAlign:'center', padding:'7px 0', borderRadius:9, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13,
                  background: basis === b ? '#0E2B20' : '#F0EDE4', color: basis === b ? '#F6F4EE' : '#3F5F4A',
                  border: basis === b ? 'none' : '1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
                {b.toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {basis === 'net' && !def.teamEntry && (
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', width:60}}>HCP %</div>
            <input type="number" min="0" max="100" value={config.allowancePct !== undefined ? config.allowancePct : (def.defaultAllowance ?? 100)}
              onChange={e => setCfg({ allowancePct: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
              style={{width:72, background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:9, padding:'7px 10px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#0E2B20', outline:'none', textAlign:'center'}}/>
            <div onClick={() => setCfg({ relative: !(config.relative !== undefined ? config.relative : def.defaultRelative) })}
              style={{flex:1, display:'flex', alignItems:'center', gap:6, cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>
              <div style={{width:16, height:16, borderRadius:4, flexShrink:0, border:`2px solid ${(config.relative !== undefined ? config.relative : def.defaultRelative) ? '#0E2B20' : '#E7E3D9'}`, background:(config.relative !== undefined ? config.relative : def.defaultRelative) ? '#0E2B20' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center'}}>
                {(config.relative !== undefined ? config.relative : def.defaultRelative) && <span style={{color:'#F6F4EE', fontSize:10, fontWeight:900}}>✓</span>}
              </div>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>Strokes off low ball</span>
            </div>
          </div>
        )}

        {def.teamEntry && (
          <div style={{background:'rgba(200,161,90,0.05)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:9, padding:'8px 10px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', lineHeight:1.5}}>
            ☝️ One ball per team: enter the <b>team score</b> on any teammate's card each hole.
            {basis === 'net' && ' Team handicap is blended automatically.'}
          </div>
        )}

        {game.formatId === 'bestBall' && (
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', width:60}}>COUNT</div>
            {[1,2].map(n => (
              <div key={n} onClick={() => setCfg({ countBalls: n })}
                style={{flex:1, textAlign:'center', padding:'7px 0', borderRadius:9, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12,
                  background: (config.countBalls || 1) === n ? '#C8A15A' : '#F0EDE4', color: (config.countBalls || 1) === n ? '#0E2B20' : '#3F5F4A',
                  border: (config.countBalls || 1) === n ? 'none' : '1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
                {n === 1 ? 'BEST BALL' : '2 BEST BALLS'}
              </div>
            ))}
          </div>
        )}

        {def.teams && <GameTeamAssigner def={def} config={config} players={players} onChange={cfg => onChange({ ...game, config: cfg })}/>}

        {basis === 'net' && (
          <div>
            <button onClick={() => setShowHcp(v => !v)} style={{background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#C8A15A', WebkitTapHighlightColor:'transparent'}}>
              {showHcp ? '▾ HIDE HANDICAP OVERRIDES' : '▸ ADJUST HANDICAPS FOR THIS GAME'}
            </button>
            {showHcp && (
              <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:8}}>
                {players.map(p => (
                  <div key={p.id} style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', flex:1}}>{p.name.split(' ')[0]}</span>
                    <input type="number" step="0.1" placeholder={String(p.handicap || 0)}
                      value={config.handicapOverrides?.[p.id] ?? ''}
                      onChange={e => setCfg({ handicapOverrides: { ...(config.handicapOverrides || {}), [p.id]: e.target.value === '' ? undefined : parseFloat(e.target.value) } })}
                      style={{width:70, background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:8, padding:'6px 8px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#0E2B20', outline:'none', textAlign:'center'}}/>
                  </div>
                ))}
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A'}}>Blank = use the profile handicap index.</div>
              </div>
            )}
          </div>
        )}

        {!validation.ok && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#DC2626'}}>{validation.error}</div>}
        {validation.ok && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#15803D'}}>✓ Ready to play</div>}
      </div>
    </div>
  );
};

const GamePickerModal = ({ open, onClose, onPick, playerCount }) => {
  if (!open) return null;
  const ME = window.MatchEngine;
  const all = ME.list().filter(f => !f.needsInput);
  const cats = Object.entries(ME.CATEGORY_INFO).sort((a, b) => a[1].order - b[1].order);
  return (
    <Modal open={open} onClose={onClose} title="Add a Game">
      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        {cats.map(([catId, cat]) => {
          const list = all.filter(f => f.category === catId);
          if (!list.length) return null;
          return (
            <div key={catId}>
              <Label style={{display:'block', marginBottom:8}}>{cat.label}</Label>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {list.map(f => {
                  const tooFew = f.players && playerCount < f.players.min;
                  return (
                    <div key={f.id} onClick={() => !tooFew && onPick(f.id)}
                      style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, cursor: tooFew ? 'not-allowed' : 'pointer', opacity: tooFew ? 0.45 : 1,
                        background:'#F6F4EE', border:'1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
                      <span style={{fontSize:18, flexShrink:0}}>{f.icon}</span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20'}}>{f.label}</div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', lineHeight:1.4}}>{f.desc}</div>
                        {tooFew && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#DC2626', marginTop:2}}>Needs {f.players.min}+ players</div>}
                      </div>
                      <span style={{color:'#C8D5C0', fontSize:18}}>+</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

const CourseBuilder = ({ onSave, onCancel, prefill }) => {
  const [name,     setName]     = React.useState(prefill?.name     || '');
  const [location, setLocation] = React.useState(prefill?.location || '');
  const [rating,   setRating]   = React.useState(prefill?.rating   ? String(prefill.rating) : '');
  const [slope,    setSlope]    = React.useState(prefill?.slope    ? String(prefill.slope)  : '');
  const [holeCount, setHoleCount] = React.useState(prefill?.holes?.length === 9 || prefill?.holeCount === 9 ? 9 : 18);
  const [extraTees, setExtraTees] = React.useState(() =>
    (prefill?.tees || []).slice(1).map(t => ({ name: t.name || '', rating: String(t.rating || ''), slope: String(t.slope || '') }))
  );
  const [holes,    setHoles]    = React.useState(() => {
    if (prefill?.holes?.length >= 9) {
      const base = prefill.holes.map(h => ({ num:h.num, par:h.par||4, yds:h.yds||'', hdcp:h.hdcp||h.num }));
      while (base.length < 18) base.push({ ...BLANK_HOLES[base.length] });
      return base;
    }
    return BLANK_HOLES.map(h => ({...h}));
  });

  const setHoleField = (idx, field, val) => {
    setHoles(prev => prev.map((h,i) => i === idx ? {...h, [field]: field === 'yds' ? val : Number(val)||0} : h));
  };

  const activeHoles = holes.slice(0, holeCount);
  const totalPar = activeHoles.reduce((a,h) => a + (h.par||0), 0);
  const parOk    = holeCount === 9 ? (totalPar >= 33 && totalPar <= 38) : (totalPar >= 68 && totalPar <= 76);
  const valid    = name.trim() && activeHoles.every(h => h.par >= 3 && h.par <= 6 && h.hdcp >= 1 && h.hdcp <= holeCount);

  const setTeeField = (idx, field, val) => setExtraTees(prev => prev.map((t,i) => i === idx ? { ...t, [field]: val } : t));
  const addTee      = () => setExtraTees(prev => prev.length < 4 ? [...prev, { name:'', rating:'', slope:'' }] : prev);
  const removeTee   = (idx) => setExtraTees(prev => prev.filter((_,i) => i !== idx));

  const handleSave = () => {
    const tees = [
      { id:'default', name:'Standard', rating:parseFloat(rating)||72.0, slope:parseInt(slope)||113, yds:null },
      ...extraTees.filter(t => t.name.trim()).map((t,i) => ({ id:'tee_'+(i+1), name:t.name.trim(), rating:parseFloat(t.rating)||parseFloat(rating)||72.0, slope:parseInt(t.slope)||parseInt(slope)||113, yds:null })),
    ];
    const course = window.CourseService.normalizeCourse({
      id:'custom_'+Date.now(), name:name.trim(), location:location.trim()||'Custom Course',
      rating:parseFloat(rating)||72.0, slope:parseInt(slope)||113, custom:true,
      holeCount, tees,
      holes:activeHoles.map(h=>({...h, yds:parseInt(h.yds)||0})),
    });
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem('pp_custom_courses') || '[]'); } catch(e) {}
    const updated = [...existing, course];
    localStorage.setItem('pp_custom_courses', JSON.stringify(updated));
    if (window.CourseSyncService) { window.CourseSyncService.save(updated, function(ok) { if (!ok) console.warn('[PlayPal] Course RTDB sync failed'); }); }
    onSave(course, updated);
  };

  const inputStyle = { background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:10, padding:'10px 12px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', width:'100%' };
  const holeInputStyle = { background:'#F6F4EE', border:'1px solid #E7E3D9', color:'#0E2B20', borderRadius:6, padding:'5px 4px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, width:'100%', outline:'none', textAlign:'center' };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:18, color:'#C8A15A', letterSpacing:1}}>{prefill ? '✅ REVIEW & SAVE' : 'ADD CUSTOM COURSE'}</div>
      {prefill && <div style={{background:'rgba(21,128,61,0.05)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:10, padding:'10px 14px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#15803D'}}>Review and correct any values before saving.</div>}
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div><Label style={{display:'block', marginBottom:4}}>COURSE NAME *</Label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Green Knoll Golf Course" style={inputStyle}/></div>
        <div><Label style={{display:'block', marginBottom:4}}>LOCATION</Label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Bridgewater, NJ" style={inputStyle}/></div>
        <div style={{display:'flex', gap:10}}>
          <div style={{flex:1}}><Label style={{display:'block', marginBottom:4}}>COURSE RATING</Label><input value={rating} onChange={e=>setRating(e.target.value)} placeholder="e.g. 70.1" style={inputStyle}/></div>
          <div style={{flex:1}}><Label style={{display:'block', marginBottom:4}}>SLOPE</Label><input value={slope} onChange={e=>setSlope(e.target.value)} placeholder="e.g. 121" style={inputStyle}/></div>
        </div>
      </div>
      <div>
        <Label style={{display:'block', marginBottom:6}}>LAYOUT</Label>
        <div style={{display:'flex', gap:8, marginBottom:14}}>
          {[9, 18].map(n => (
            <div key={n} onClick={()=>setHoleCount(n)}
              style={{flex:1, textAlign:'center', padding:'9px 0', borderRadius:10, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14,
                background:holeCount===n?'#0E2B20':'#F0EDE4', color:holeCount===n?'#F6F4EE':'#3F5F4A', border:holeCount===n?'none':'1px solid #E7E3D9', WebkitTapHighlightColor:'transparent'}}>
              {n} HOLES
            </div>
          ))}
        </div>

        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
          <Label>ADDITIONAL TEE SETS (OPTIONAL)</Label>
          {extraTees.length < 4 && (
            <button onClick={addTee} style={{background:'rgba(21,128,61,0.07)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:7, padding:'3px 10px', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:10, letterSpacing:1, color:'#15803D', WebkitTapHighlightColor:'transparent'}}>+ TEE</button>
          )}
        </div>
        {extraTees.length === 0 && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A', marginBottom:12}}>The rating/slope above defines the standard tee. Add Blue/White/Red sets with their own rating &amp; slope for accurate course handicaps.</div>}
        {extraTees.map((t, i) => (
          <div key={i} style={{display:'flex', gap:6, marginBottom:8, alignItems:'center'}}>
            <input value={t.name} onChange={e=>setTeeField(i,'name',e.target.value)} placeholder="Name (e.g. Blue)" style={{...holeInputStyle, textAlign:'left', flex:2, padding:'7px 8px'}}/>
            <input value={t.rating} onChange={e=>setTeeField(i,'rating',e.target.value)} placeholder="Rating" type="number" style={{...holeInputStyle, flex:1, padding:'7px 4px'}}/>
            <input value={t.slope} onChange={e=>setTeeField(i,'slope',e.target.value)} placeholder="Slope" type="number" style={{...holeInputStyle, flex:1, padding:'7px 4px'}}/>
            <button onClick={()=>removeTee(i)} aria-label="Remove tee" style={{background:'none', border:'none', cursor:'pointer', color:'#8A9E8A', fontSize:14, padding:'2px 4px', WebkitTapHighlightColor:'transparent'}}>✕</button>
          </div>
        ))}

        <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:8, marginTop:6}}>
          <Label>SCORECARD — {holeCount} HOLES</Label>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:parOk?'#15803D':'#DC2626'}}>Total par: {totalPar}</span>
        </div>
        <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
          <table style={{borderCollapse:'collapse', width:'100%', minWidth:300}}>
            <thead>
              <tr>{['#','PAR','YDS','HCP'].map(h=><th key={h} style={{padding:'4px 6px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#8A9E8A', textAlign:'center', borderBottom:'1px solid #E7E3D9'}}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {activeHoles.map((h, i) => (
                <tr key={i} style={{background:i%2===0?'#F6F4EE':'#FFFFFF'}}>
                  <td style={{padding:'4px 6px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#3F5F4A', textAlign:'center'}}>{h.num}</td>
                  <td style={{padding:'3px 4px'}}><input value={h.par} onChange={e=>setHoleField(i,'par',e.target.value)} type="number" inputMode="numeric" min="3" max="5" tabIndex={i*3+1} style={holeInputStyle}/></td>
                  <td style={{padding:'3px 4px'}}><input value={h.yds} onChange={e=>setHoleField(i,'yds',e.target.value)} placeholder="—" type="number" min="50" max="700" tabIndex={i*3+2} style={holeInputStyle}/></td>
                  <td style={{padding:'3px 4px'}}><input value={h.hdcp} onChange={e=>setHoleField(i,'hdcp',e.target.value)} type="number" inputMode="numeric" min="1" max="18" tabIndex={i*3+3} style={holeInputStyle}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{display:'flex', gap:10}}>
        <Btn onClick={onCancel} variant="ghost" style={{flex:1}}>CANCEL</Btn>
        <Btn onClick={handleSave} variant="gold" disabled={!valid} style={{flex:2}}>💾 SAVE COURSE</Btn>
      </div>
    </div>
  );
};

const StakesInput = ({ value, onChange }) => {
  const presets = [1, 2, 5, 10, 20, 25, 50];
  const [custom, setCustom] = React.useState(!presets.includes(value));
  const [customVal, setCustomVal] = React.useState(presets.includes(value) ? '' : String(value));

  const handleCustomChange = (v) => { setCustomVal(v); const n = parseFloat(v); if (!isNaN(n) && n > 0) onChange(n); };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
        {presets.map(v => (
          <div key={v} onClick={() => { setCustom(false); onChange(v); }}
            style={{padding:'6px 13px', borderRadius:8, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15,
              background:!custom&&value===v?'#0E2B20':'#F0EDE4', color:!custom&&value===v?'#F6F4EE':'#3F5F4A', border:!custom&&value===v?'none':'1px solid #E7E3D9'}}>
            ${v}
          </div>
        ))}
        <div onClick={()=>setCustom(true)}
          style={{padding:'6px 13px', borderRadius:8, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15,
            background:custom?'#C8A15A':'#F0EDE4', color:custom?'#0E2B20':'#3F5F4A', border:custom?'none':'1px solid #E7E3D9'}}>
          OTHER
        </div>
      </div>
      {custom && (
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:20, color:'#C8A15A', fontWeight:800}}>$</span>
          <input autoFocus value={customVal} onChange={e=>handleCustomChange(e.target.value)} type="number" min="0.5" step="0.5" placeholder="Enter amount"
            style={{flex:1, background:'#F6F4EE', border:'1px solid #C8A15A', borderRadius:10, padding:'10px 12px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:18, fontWeight:700, outline:'none'}}/>
        </div>
      )}
    </div>
  );
};

function calcAutoPopHoles(p1, p2, courseHoles) {
  const diff = Math.abs((p1.handicap || 0) - (p2.handicap || 0));
  if (diff === 0) return {};
  const receiver = (p1.handicap || 0) > (p2.handicap || 0) ? p1 : p2;
  const strokes = Math.min(diff, 18);
  const popArray = courseHoles.map(hole => hole.hdcp <= strokes);
  return { [receiver.id]: popArray };
}

const NassauPopConfig = ({ nassauPlayers, popHoles, onChange }) => {
  if (!nassauPlayers || nassauPlayers.length < 2) return null;
  const [activePlayer, setActivePlayer] = React.useState(nassauPlayers[0].id);

  const p1 = nassauPlayers[0];
  const p2 = nassauPlayers[1];
  const hdcpDiff = Math.abs((p1.handicap || 0) - (p2.handicap || 0));
  const autoReceiver = hdcpDiff > 0 ? ((p1.handicap || 0) > (p2.handicap || 0) ? p1 : p2) : null;
  const autoStrokes = Math.min(hdcpDiff, 18);

  const toggleHole = (holeIdx) => {
    const current = popHoles[activePlayer] || Array(18).fill(false);
    const next = [...current]; next[holeIdx] = !next[holeIdx];
    onChange({ ...popHoles, [activePlayer]: next });
  };

  const clearAll = () => onChange({ ...popHoles, [activePlayer]: Array(18).fill(false) });
  const popCount = (popHoles[activePlayer] || []).filter(Boolean).length;

  return (
    <div style={{borderTop:'1px solid rgba(200,161,90,0.15)', marginTop:12, paddingTop:12, display:'flex', flexDirection:'column', gap:10}}>
      <div style={{display:'flex', alignItems:'center', gap:6}}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#3F5F4A'}}>STROKE POPS</div>
        {autoReceiver && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:9, color:'#15803D', background:'rgba(21,128,61,0.1)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:4, padding:'1px 5px', letterSpacing:0.5}}>AUTO</span>}
      </div>
      {autoReceiver ? (
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#8A9E8A', lineHeight:1.5}}>
          {autoReceiver.name.split(' ')[0]} (HCP {autoReceiver.handicap}) gets {autoStrokes} pop{autoStrokes !== 1 ? 's' : ''} on the {autoStrokes} hardest hole{autoStrokes !== 1 ? 's' : ''}. Tap to adjust.
        </div>
      ) : (
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#8A9E8A', lineHeight:1.5}}>Both players have the same handicap — no pops. Tap holes to add manually.</div>
      )}
      <div style={{display:'flex', gap:8}}>
        {nassauPlayers.map(p => (
          <div key={p.id} onClick={() => setActivePlayer(p.id)}
            style={{flex:1, display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:10, cursor:'pointer',
              background:activePlayer===p.id?`${p.color}12`:'#FFFFFF', border:activePlayer===p.id?`1px solid ${p.color}`:'1px solid #E7E3D9'}}>
            <div style={{width:7, height:7, borderRadius:'50%', background:p.color, flexShrink:0}}/>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:activePlayer===p.id?p.color:'#3F5F4A', flex:1}}>{p.name.split(' ')[0].toUpperCase()}</span>
            {(popHoles[p.id]||[]).filter(Boolean).length > 0 && (
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, color:'#C8A15A', background:'rgba(200,161,90,0.12)', borderRadius:4, padding:'1px 5px'}}>{(popHoles[p.id]||[]).filter(Boolean).length}</span>
            )}
          </div>
        ))}
      </div>
      <div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
          <Label style={{fontSize:10}}>{nassauPlayers.find(p=>p.id===activePlayer)?.name.split(' ')[0].toUpperCase()} — SELECT POP HOLES{popCount>0&&<span style={{color:'#C8A15A', marginLeft:6}}>{popCount} SELECTED</span>}</Label>
          {popCount > 0 && <button onClick={clearAll} style={{background:'none', border:'none', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1, color:'#8A9E8A', WebkitTapHighlightColor:'transparent', padding:'2px 6px'}}>CLEAR</button>}
        </div>
        {['FRONT 9', 'BACK 9'].map((label, half) => (
          <div key={label} style={{marginBottom:6}}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:9, letterSpacing:2, color:'#8A9E8A', marginBottom:4}}>{label}</div>
            <div style={{display:'flex', gap:4, flexWrap:'nowrap'}}>
              {Array.from({length:9}, (_, i) => {
                const holeIdx = i + (half * 9);
                const active = !!(popHoles[activePlayer]?.[holeIdx]);
                const activeP = nassauPlayers.find(p => p.id === activePlayer);
                return (
                  <div key={holeIdx} onClick={() => toggleHole(holeIdx)}
                    style={{flex:1, minWidth:28, height:34, borderRadius:6, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      background:active?(activeP?.color||'#C8A15A'):'#F0EDE4', border:active?'none':'1px solid #E7E3D9',
                      WebkitTapHighlightColor:'transparent', userSelect:'none', transition:'background 0.12s'}}>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, color:active?'#FFFFFF':'#8A9E8A', lineHeight:1}}>{holeIdx+1}</span>
                    {active && <span style={{fontSize:6, color:'#FFFFFF', marginTop:1}}>POP</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const NassauSingleMatchConfig = ({ roundPlayers, matchConfig, onChange, matchLabel, course }) => {
  const matchType      = matchConfig.matchType || '1v1';
  const playersInMatch = matchConfig.playersInMatch || [];
  const teams          = matchConfig.teams || null;
  const popHoles       = matchConfig.popHoles || {};
  const stakes         = matchConfig.stakes || 2;
  const can2v2 = roundPlayers.length >= 4;

  const setMatchType = (t) => onChange({ ...matchConfig, matchType:t, playersInMatch:[], teams:null, popHoles:{} });

  const togglePlayer = (id) => {
    const max = matchType === '2v2' ? 4 : 2;
    const next = playersInMatch.includes(id) ? playersInMatch.filter(x=>x!==id) : playersInMatch.length<max?[...playersInMatch,id]:playersInMatch;
    let updatedPopHoles = popHoles;
    if (matchType === '1v1' && course?.holes) {
      if (next.length === 2) {
        const p1 = roundPlayers.find(p => p.id === next[0]);
        const p2 = roundPlayers.find(p => p.id === next[1]);
        if (p1 && p2) updatedPopHoles = calcAutoPopHoles(p1, p2, course.holes);
      } else {
        updatedPopHoles = {};
      }
    }
    if (matchType==='2v2'&&next.length===4) onChange({...matchConfig,playersInMatch:next,teams:{team1:[next[0],next[1]],team2:[next[2],next[3]]},popHoles:updatedPopHoles});
    else onChange({...matchConfig,playersInMatch:next,teams:null,popHoles:updatedPopHoles});
  };

  const moveToTeam = (id, teamKey) => {
    if (!teams) return;
    const newT1=(teams.team1||[]).filter(x=>x!==id); const newT2=(teams.team2||[]).filter(x=>x!==id);
    if (teamKey==='team1') newT1.push(id); else newT2.push(id);
    onChange({...matchConfig,teams:{team1:newT1,team2:newT2}});
  };

  const playerById = (id) => roundPlayers.find(p => p.id === id);
  const isValid1v1 = matchType==='1v1'&&playersInMatch.length===2;
  const isValid2v2 = matchType==='2v2'&&teams&&(teams.team1||[]).length===2&&(teams.team2||[]).length===2;
  const isValid = isValid1v1 || isValid2v2;
  const nassauPlayersForPop = playersInMatch.map(id=>playerById(id)).filter(Boolean);

  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, letterSpacing:2, color:'#C8A15A', marginBottom:2}}>{matchLabel}</div>
      <div>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', marginBottom:6}}>STAKE (per bet — Front 9 + Back 9 + Overall 2×)</div>
        <StakesInput value={stakes} onChange={v=>onChange({...matchConfig,stakes:v})}/>
      </div>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', marginBottom:2}}>MATCH FORMAT</div>
      <div style={{display:'flex', gap:8}}>
        {['1v1',...(can2v2?['2v2']:[])].map(t => (
          <div key={t} onClick={() => setMatchType(t)}
            style={{flex:1, textAlign:'center', padding:'8px 0', borderRadius:10, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15,
              background:matchType===t?'#C8A15A':'#F0EDE4', color:matchType===t?'#0E2B20':'#3F5F4A', border:matchType===t?'none':'1px solid #E7E3D9'}}>
            {t}
          </div>
        ))}
      </div>
      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A'}}>SELECT {matchType==='2v2'?'4':'2'} PLAYERS</div>
      <div style={{display:'flex', flexDirection:'column', gap:6}}>
        {roundPlayers.map(p => {
          const selected=playersInMatch.includes(p.id); const inTeam1=teams?.team1?.includes(p.id); const inTeam2=teams?.team2?.includes(p.id);
          return (
            <div key={p.id} onClick={()=>togglePlayer(p.id)}
              style={{display:'flex', alignItems:'center', gap:10, borderRadius:12, padding:'10px 12px', cursor:'pointer',
                background:selected?`${p.color}0A`:'#FFFFFF', border:selected?`1px solid ${p.color}`:'1px solid #E7E3D9'}}>
              <div style={{width:20, height:20, borderRadius:6, border:`2px solid ${selected?p.color:'#E7E3D9'}`, background:selected?p.color:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                {selected && <span style={{color:'#FFFFFF', fontSize:12, fontWeight:900, lineHeight:1}}>✓</span>}
              </div>
              <Avatar player={p} size={28}/>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:selected?'#0E2B20':'#3F5F4A', flex:1}}>{p.name}</span>
              {matchType==='2v2'&&selected&&(
                <div style={{display:'flex', gap:4}} onClick={e=>e.stopPropagation()}>
                  {['team1','team2'].map((tk,ti)=>(
                    <div key={tk} onClick={()=>moveToTeam(p.id,tk)}
                      style={{padding:'3px 8px', borderRadius:6, cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11,
                        background:(tk==='team1'?inTeam1:inTeam2)?p.color:'#F0EDE4', color:(tk==='team1'?inTeam1:inTeam2)?'#FFFFFF':'#8A9E8A', border:(tk==='team1'?inTeam1:inTeam2)?'none':'1px solid #E7E3D9'}}>
                      T{ti+1}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isValid && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#DC2626'}}>{matchType==='1v1'?`Select exactly 2 players (${playersInMatch.length}/2)`:`Select 4 players and assign 2 to each team`}</div>}
      {isValid && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#15803D'}}>{matchType==='1v1'?`✓ ${playerById(playersInMatch[0])?.name.split(' ')[0]} vs ${playerById(playersInMatch[1])?.name.split(' ')[0]}`:`✓ Team match configured`}</div>}
      {isValid && matchType==='1v1' && nassauPlayersForPop.length===2 && <NassauPopConfig nassauPlayers={nassauPlayersForPop} popHoles={popHoles} onChange={v=>onChange({...matchConfig,popHoles:v})}/>}
    </div>
  );
};

const MATCH_COLORS = ['#C8A15A', '#7B9FE0', '#E07BE0'];
const MATCH_LABELS = ['MATCH 1', 'MATCH 2', 'MATCH 3'];

const NassauMultiMatchConfig = ({ roundPlayers, nassauMatches, onChange, course }) => {
  const MAX_MATCHES = 3;

  const addMatch = () => {
    if (nassauMatches.length >= MAX_MATCHES) return;
    onChange([...nassauMatches, { id:'nm_'+Date.now(), matchType:'1v1', playersInMatch:[], teams:null, popHoles:{}, stakes:2 }]);
  };

  const removeMatch  = (idx) => onChange(nassauMatches.filter((_,i)=>i!==idx));
  const updateMatch  = (idx, updated) => onChange(nassauMatches.map((m,i)=>i===idx?{...m,...updated}:m));

  return (
    <div style={{borderTop:'1px solid rgba(200,161,90,0.15)', marginTop:12, paddingTop:12, display:'flex', flexDirection:'column', gap:14}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A'}}>NASSAU MATCHES ({nassauMatches.length}/{MAX_MATCHES})</div>
        {nassauMatches.length < MAX_MATCHES && (
          <button onClick={addMatch}
            style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, letterSpacing:1, color:'#15803D', background:'rgba(21,128,61,0.07)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:7, padding:'4px 12px', cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>
            + ADD MATCH
          </button>
        )}
      </div>
      {nassauMatches.length===0 && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#8A9E8A', textAlign:'center', padding:'12px 0'}}>No matches configured. Tap + ADD MATCH to begin.</div>}
      {nassauMatches.map((match, idx) => (
        <div key={match.id} style={{background:'#FFFFFF', border:`1px solid ${MATCH_COLORS[idx]}33`, borderRadius:14, overflow:'hidden'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:`${MATCH_COLORS[idx]}08`, borderBottom:`1px solid ${MATCH_COLORS[idx]}22`}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{width:7, height:7, borderRadius:'50%', background:MATCH_COLORS[idx]}}/>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, letterSpacing:1.5, color:MATCH_COLORS[idx]}}>{MATCH_LABELS[idx]}</span>
              {match.playersInMatch.length===2&&(()=>{const p1=roundPlayers.find(p=>p.id===match.playersInMatch[0]);const p2=roundPlayers.find(p=>p.id===match.playersInMatch[1]);return p1&&p2?<span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>{p1.name.split(' ')[0]} vs {p2.name.split(' ')[0]}</span>:null;})()}
            </div>
            {nassauMatches.length>1&&<button onClick={()=>removeMatch(idx)} style={{background:'none', border:'none', cursor:'pointer', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, letterSpacing:1, color:'#8A9E8A', WebkitTapHighlightColor:'transparent', padding:'2px 6px'}}>REMOVE</button>}
          </div>
          <div style={{padding:'12px 14px'}}>
            <NassauSingleMatchConfig roundPlayers={roundPlayers} matchConfig={match} onChange={updated=>updateMatch(idx,updated)} matchLabel="" course={course}/>
          </div>
        </div>
      ))}
    </div>
  );
};

const CourseGroup = ({ label, list, course, onSelect, defaultOpen, favIds, onToggleFav }) => {
  const [open, setOpen] = React.useState(defaultOpen || false);
  if (list.length === 0) return null;
  const hasSelected = list.some(c => c.id === course?.id);
  const isOpen = open || hasSelected;

  return (
    <div style={{marginBottom:4}}>
      <div onClick={() => setOpen(v=>!v)}
        style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 2px', cursor:'pointer', userSelect:'none', WebkitTapHighlightColor:'transparent'}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, letterSpacing:2.5, color:hasSelected?'#C8A15A':'#3F5F4A', fontWeight:700}}>{label}</span>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, color:'#8A9E8A', background:'#F0EDE4', border:'1px solid #E7E3D9', borderRadius:10, padding:'1px 7px'}}>{list.length}</span>
          {hasSelected && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, letterSpacing:0.5, color:'#C8A15A', background:'rgba(200,161,90,0.1)', border:'1px solid rgba(200,161,90,0.25)', borderRadius:4, padding:'1px 6px'}}>SELECTED</span>}
        </div>
        <span style={{fontSize:14, color:'#8A9E8A', transform:isOpen?'rotate(180deg)':'none', transition:'transform 0.2s', display:'inline-block'}}>▾</span>
      </div>
      {isOpen && (
        <div style={{display:'flex', flexDirection:'column', gap:8, paddingBottom:4}}>
          {list.map(c => {
            const sel = course?.id === c.id;
            const isFav = favIds ? favIds.includes(c.id) : false;
            return (
              <div key={c.id} onClick={() => onSelect(c)}
                style={{...setupS.courseCard, border:sel?'1px solid #C8A15A':'1px solid #E7E3D9', background:sel?'rgba(200,161,90,0.06)':'#FFFFFF'}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:sel?'#C8A15A':'#0E2B20'}}>{c.name}</div>
                    {c.custom && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, letterSpacing:1, color:'#15803D', background:'rgba(21,128,61,0.1)', border:'1px solid rgba(21,128,61,0.2)', padding:'1px 6px', borderRadius:4}}>CUSTOM</span>}
                    {(c.holeCount === 9 || (c.holes||[]).length === 9) && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, letterSpacing:1, color:'#2563EB', background:'rgba(37,99,235,0.08)', border:'1px solid rgba(37,99,235,0.2)', padding:'1px 6px', borderRadius:4}}>9 HOLES</span>}
                  </div>
                  <div style={{fontSize:11, color:'#3F5F4A', marginTop:2, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{c.location}</div>
                  <div style={{fontSize:10, color:'#8A9E8A', marginTop:1, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>Rating {c.rating} · Slope {c.slope}{(c.tees||[]).length > 1 ? ` · ${c.tees.length} tee sets` : ''}</div>
                </div>
                {onToggleFav && (
                  <button onClick={(e) => { e.stopPropagation(); onToggleFav(c.id); }}
                    aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                    style={{background:'none', border:'none', cursor:'pointer', fontSize:18, padding:'4px 6px', flexShrink:0, WebkitTapHighlightColor:'transparent', opacity:isFav?1:0.35}}>
                    {isFav ? '⭐' : '☆'}
                  </button>
                )}
                {sel && <span style={{color:'#C8A15A', fontSize:20, flexShrink:0}}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function _extractState(location) {
  if (!location) return 'OTHER';
  const m = location.match(/,\s*([A-Z]{2})$/);
  return m ? m[1] : 'OTHER';
}

const _stateNames = { NJ:'New Jersey', CA:'California', NY:'New York', PA:'Pennsylvania', FL:'Florida', GA:'Georgia', TX:'Texas', IL:'Illinois', AZ:'Arizona', NC:'North Carolina', SC:'South Carolina', VA:'Virginia', MA:'Massachusetts', OH:'Ohio', MI:'Michigan', WI:'Wisconsin', MN:'Minnesota', CO:'Colorado', OR:'Oregon', WA:'Washington', OTHER:'Other' };

const MarkeyMatchConfig = ({ roundPlayers, markeyMatchConfig, onChange, course }) => {
  const { team1 = [], team2 = [], stake = 5, markeyPopStrokes = {} } = markeyMatchConfig;
  const allAssigned = team1.length >= 1 && team2.length >= 1;

  const setStakeVal = (v) => onChange({ ...markeyMatchConfig, stake: v });

  const assignTeam = (playerId, teamKey) => {
    const newT1 = team1.filter(id => id !== playerId);
    const newT2 = team2.filter(id => id !== playerId);
    if (teamKey === 'team1') { if (newT1.length < 2) newT1.push(playerId); }
    else { if (newT2.length < 2) newT2.push(playerId); }

    const assigned = [...newT1, ...newT2];
    let newPops = markeyPopStrokes;
    if (newT1.length >= 1 && newT2.length >= 1 && course?.holes) {
      const assignedPlayers = roundPlayers.filter(p => assigned.includes(p.id));
      newPops = window.calcMarkeyMatchPops(assignedPlayers, course);
    }
    onChange({ ...markeyMatchConfig, team1: newT1, team2: newT2, markeyPopStrokes: newPops });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 10, letterSpacing: 2, color: '#3F5F4A', marginBottom: 6 }}>STAKE (per match — all presses carry same stake)</div>
        <StakesInput value={stake} onChange={setStakeVal} />
      </div>

      <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 10, letterSpacing: 2, color: '#3F5F4A', marginBottom: 2 }}>ASSIGN TEAMS (1–2 per team)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {roundPlayers.map(p => {
          const inT1 = team1.includes(p.id);
          const inT2 = team2.includes(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '10px 12px', background: inT1 || inT2 ? `${p.color}0A` : '#FFFFFF', border: `1px solid ${inT1 || inT2 ? p.color : '#E7E3D9'}` }}>
              <Avatar player={p} size={28} />
              <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 15, color: '#0E2B20', flex: 1 }}>{p.name}</span>
              <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#8A9E8A', marginRight: 4 }}>Hdcp {p.handicap || 0}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['team1', 'A'], ['team2', 'B']].map(([tk, lbl]) => {
                  const active = tk === 'team1' ? inT1 : inT2;
                  const full = tk === 'team1' ? team1.length >= 2 && !inT1 : team2.length >= 2 && !inT2;
                  return (
                    <div key={tk} onClick={() => !full && assignTeam(p.id, tk)}
                      style={{ padding: '4px 10px', borderRadius: 7, cursor: full ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 12, opacity: full ? 0.35 : 1, background: active ? p.color : '#F0EDE4', color: active ? '#FFFFFF' : '#8A9E8A', border: active ? 'none' : '1px solid #E7E3D9', WebkitTapHighlightColor: 'transparent' }}>
                      {lbl}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!allAssigned && (
        <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#DC2626' }}>
          Assign 1–2 players to each team (Team A: {team1.length}/2, Team B: {team2.length}/2)
        </div>
      )}

      {allAssigned && (
        <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#15803D' }}>
          ✓ {team1.map(id => roundPlayers.find(p => p.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ')} vs {team2.map(id => roundPlayers.find(p => p.id === id)?.name.split(' ')[0]).filter(Boolean).join(' & ')}
        </div>
      )}

      {allAssigned && course?.holes && (() => {
        const allFour = [...team1, ...team2];
        const lowestHdcp = Math.min(...allFour.map(id => roundPlayers.find(p => p.id === id)?.handicap || 0));
        return (
          <div style={{ background: 'rgba(200,161,90,0.04)', border: '1px solid rgba(200,161,90,0.15)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 600, fontSize: 9, letterSpacing: 2, color: '#C8A15A', marginBottom: 6 }}>AUTO POPS (vs lowest hdcp {lowestHdcp})</div>
            {allFour.map(id => {
              const pl = roundPlayers.find(p => p.id === id);
              if (!pl) return null;
              const eff = Math.max(0, (pl.handicap || 0) - lowestHdcp);
              const popHoles = (markeyPopStrokes[id] || []).map((n, i) => n > 0 ? i + 1 : null).filter(Boolean);
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Avatar player={pl} size={20} />
                  <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 11, color: '#0E2B20', minWidth: 60 }}>{pl.name.split(' ')[0]}</span>
                  <span style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 10, color: '#3F5F4A' }}>{eff} pops</span>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {popHoles.map(h => (
                      <span key={h} style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 800, fontSize: 9, color: '#C8A15A', background: 'rgba(200,161,90,0.12)', border: '1px solid rgba(200,161,90,0.3)', borderRadius: 4, padding: '1px 4px' }}>H{h}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

const SetupScreen = ({ allPlayers, onStart, customCourses }) => {
  const [step, setStep]                       = React.useState(1);
  const [selectedPlayers, setSelectedPlayers] = React.useState(allPlayers.slice(0,4).map(p=>p.id));
  const [course, setCourse]                   = React.useState(null);
  const [courseSearch, setCourseSearch]       = React.useState('');
  const [addMode, setAddMode]                 = React.useState('list');
  const [scanPrefill, setScanPrefill]         = React.useState(null);
  const [formats, setFormats]                 = React.useState({ wolf:false, nassau:false, stableford:false, passmoney:false, skins:false, bingobangobongo:false, teeball:false, markeymatch:false });
  const [stakes,  setStakes]                  = React.useState({ wolf:2, nassau:2, stableford:2, passmoney:2, skins:2, bingobangobongo:2, teeball:2, markeymatch:5 });
  const [nassauMatches, setNassauMatches]     = React.useState([{ id:'nm_init', matchType:'1v1', playersInMatch:[], teams:null, popHoles:{}, stakes:2 }]);
  const [markeyMatchConfig, setMarkeyMatchConfig] = React.useState({ team1:[], team2:[], stake:5, markeyPopStrokes:{} });
  const [games, setGames]                     = React.useState([]);          // MatchEngine games
  const [gamePickerOpen, setGamePickerOpen]   = React.useState(false);
  const [teeId, setTeeId]                     = React.useState(null);        // chosen tee for the round
  const [trackStats, setTrackStats]           = React.useState(false);       // FIR/GIR/penalties/short game
  const [favVersion, setFavVersion]           = React.useState(0);           // bump to re-read favorites
  const [startingTee,     setStartingTee]     = React.useState(1); // 1 = front first, 10 = back first
  const [tripMode,        setTripMode]        = React.useState('none'); // 'none' | 'existing' | 'new'
  const [selectedTripId,  setSelectedTripId]  = React.useState('');
  const [newTripName,     setNewTripName]     = React.useState('');
  const [newTripLocation, setNewTripLocation] = React.useState('');
  const [availableTrips,  setAvailableTrips]  = React.useState([]);

  const localCourses = customCourses || [];

  React.useEffect(() => {
    setNassauMatches(prev => prev.map(match => ({
      ...match,
      playersInMatch: match.playersInMatch.filter(id => selectedPlayers.includes(id)),
      teams: match.teams ? { team1:(match.teams.team1||[]).filter(id=>selectedPlayers.includes(id)), team2:(match.teams.team2||[]).filter(id=>selectedPlayers.includes(id)) } : null,
      popHoles: Object.fromEntries(Object.entries(match.popHoles||{}).filter(([id])=>selectedPlayers.includes(id))),
    })));
    setMarkeyMatchConfig(prev => ({
      ...prev,
      team1: prev.team1.filter(id => selectedPlayers.includes(id)),
      team2: prev.team2.filter(id => selectedPlayers.includes(id)),
    }));
    // Engine games: drop deselected players from team assignments
    setGames(prev => prev.map(g => ({
      ...g,
      config: {
        ...g.config,
        teams: g.config?.teams
          ? g.config.teams.map(t => ({ ...t, playerIds: (t.playerIds||[]).filter(id => selectedPlayers.includes(id)) }))
          : g.config?.teams,
      },
    })));
  }, [selectedPlayers.join(',')]);

  React.useEffect(() => {
    if (window.GolfTripSyncService) {
      window.GolfTripSyncService.fetchAllTrips(function(trips) {
        setAvailableTrips((trips || []).sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }));
      });
    }
  }, []);

  const togglePlayer = (id) => setSelectedPlayers(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length<6?[...prev,id]:prev);
  const toggleFormat = (f) => setFormats(prev => ({...prev,[f]:!prev[f]}));

  // Engine game management
  const roundPlayersForGames = allPlayers.filter(p => selectedPlayers.includes(p.id));
  const addGame = (formatId) => {
    const cfg = window.MatchEngine.defaultConfig(formatId, roundPlayersForGames);
    setGames(prev => [...prev, { id: 'g_' + Date.now(), formatId, config: cfg }]);
    setGamePickerOpen(false);
  };
  const updateGame = (id, updated) => setGames(prev => prev.map(g => g.id === id ? updated : g));
  const removeGame = (id) => setGames(prev => prev.filter(g => g.id !== id));

  const selectCourse = (c) => {
    const normalized = window.CourseService.normalizeCourse(c);
    setCourse(normalized);
    setTeeId(normalized.tees[0]?.id || null);
    if (normalized.holeCount === 9) setStartingTee(1);
  };

  const allCourses    = [...localCourses, ...COURSES];
  const query         = courseSearch.toLowerCase();
  const filtered      = allCourses.filter(c => !query || c.name.toLowerCase().includes(query) || c.location.toLowerCase().includes(query));
  const favIds        = React.useMemo(() => window.CourseService.getFavoriteIds(), [favVersion]);
  const favCourses    = filtered.filter(c => favIds.includes(c.id));
  const recentCourses = React.useMemo(() => {
    const known = new Set(allCourses.map(c => c.id));
    return window.CourseService.getRecents().filter(c => !query || c.name.toLowerCase().includes(query) || (c.location||'').toLowerCase().includes(query))
      .map(rc => allCourses.find(c => c.id === rc.id) || rc)
      .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  }, [query, favVersion]);
  const toggleFav     = (id) => { window.CourseService.toggleFavorite(id); setFavVersion(v => v + 1); };

  const nassauValid = (() => {
    if (!formats.nassau) return true;
    if (nassauMatches.length === 0) return false;
    return nassauMatches.every(match => {
      const { matchType, playersInMatch, teams } = match;
      if (matchType==='1v1') return playersInMatch.length===2;
      if (matchType==='2v2') return playersInMatch.length===4&&teams&&(teams.team1||[]).length===2&&(teams.team2||[]).length===2;
      return false;
    });
  })();

  const markeyValid = !formats.markeymatch || (
    markeyMatchConfig.team1.length >= 1 && markeyMatchConfig.team1.length <= 2 &&
    markeyMatchConfig.team2.length >= 1 && markeyMatchConfig.team2.length <= 2
  );

  const activeFormats = Object.entries(formats).filter(([,v])=>v).map(([k])=>({
    type:k,
    stakes: k==='nassau' ? nassauMatches[0]?.stakes||stakes[k] : k==='markeymatch' ? markeyMatchConfig.stake : stakes[k],
    ...(k==='nassau' ? { nassauMatches } : {}),
    ...(k==='markeymatch' ? { markeyMatchConfig: { ...markeyMatchConfig, stake: markeyMatchConfig.stake, startingTee } } : {}),
  }));

  const tripValid = tripMode === 'none' ||
    (tripMode === 'existing' && !!selectedTripId) ||
    (tripMode === 'new' && !!newTripName.trim());
  const gamesValid = games.every(g => window.MatchEngine.validateGame(g, roundPlayersForGames).ok);
  const hasAnyGame = activeFormats.length > 0 || games.length > 0;
  const canStart = selectedPlayers.length >= 2 && course && hasAnyGame && gamesValid && nassauValid && markeyValid && tripValid;

  const handleSaveCourse = (newCourse) => { selectCourse(newCourse); setAddMode('list'); setScanPrefill(null); };

  const handleStart = () => {
    const players = allPlayers.filter(p => selectedPlayers.includes(p.id));
    const tripSelection =
      tripMode === 'new'      ? { mode: 'new',      newTrip: { name: newTripName.trim(), location: newTripLocation.trim() } } :
      tripMode === 'existing' ? { mode: 'existing', tripId: selectedTripId } :
      { mode: 'none' };
    const namedGames = games.map(g => ({ ...g, name: window.MatchEngine.get(g.formatId)?.label || g.formatId }));
    onStart({ players, course, formats: activeFormats, games: namedGames, teeId, trackStats, syncCode: generateSyncCode(), tripSelection, startingTee });
  };

  const buildStateGroups = (list) => {
    const groups = {};
    list.forEach(c => { const state=_extractState(c.location); if (!groups[state]) groups[state]=[]; groups[state].push(c); });
    const order = Object.keys(groups).sort((a,b) => { if(a==='NJ')return -1;if(b==='NJ')return 1;if(a==='OTHER')return 1;if(b==='OTHER')return -1;return a.localeCompare(b); });
    return order.map(state => ({ state, label:_stateNames[state]||state, list:groups[state] }));
  };

  const customFiltered  = filtered.filter(c => c.custom);
  const builtinFiltered = filtered.filter(c => !c.custom);
  const stateGroups     = buildStateGroups(builtinFiltered);
  const isSearching     = !!courseSearch;
  const roundPlayersForNassau = allPlayers.filter(p => selectedPlayers.includes(p.id));
  const steps = ['Players','Course','Formats'];

  const inputBase = { width:'100%', background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:12, padding:'11px 14px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div style={setupS.root}>
      <div style={setupS.stepBar}>
        {steps.map((s,i) => (
          <React.Fragment key={s}>
            <div style={setupS.stepItem} onClick={()=> i+1 < step && setStep(i+1)}>
              <div style={{...setupS.stepDot, background:step>i+1?'#1F3D2E':step===i+1?'#C8A15A':'#E7E3D9', color:step>=i+1?'#F6F4EE':'#8A9E8A'}}>
                {step>i+1 ? '✓' : i+1}
              </div>
              <span style={{...setupS.stepLabel, color:step===i+1?'#0E2B20':step>i+1?'#1F3D2E':'#8A9E8A'}}>{s}</span>
            </div>
            {i<2 && <div style={{flex:1, height:1, background:step>i+1?'#1F3D2E':'#E7E3D9', margin:'0 8px', marginBottom:12}}/>}
          </React.Fragment>
        ))}
      </div>

      <div style={setupS.content}>

        {step===1 && (
          <div>
            <div style={setupS.stepTitle}>SELECT PLAYERS <span style={{color:'#3F5F4A', fontSize:13, fontWeight:400}}>({selectedPlayers.length} selected)</span></div>
            <div style={setupS.stepSub}>Choose 2–6 players for this round</div>
            <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:16}}>
              {allPlayers.map(p => {
                const sel = selectedPlayers.includes(p.id);
                return (
                  <div key={p.id} onClick={()=>togglePlayer(p.id)}
                    style={{...setupS.playerRow, border:sel?`1px solid ${p.color}`:'1px solid #E7E3D9', background:sel?`${p.color}0A`:'#FFFFFF'}}>
                    <Avatar player={p} size={42}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:17, color:'#0E2B20'}}>{p.name}</div>
                      <div style={{fontSize:11, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>HCP {p.handicap} · GHIN {p.ghin}</div>
                    </div>
                    <div style={{...setupS.check, background:sel?p.color:'transparent', border:`2px solid ${sel?p.color:'#E7E3D9'}`}}>
                      {sel && <span style={{color:'#FFFFFF', fontSize:14, fontWeight:900}}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn onClick={()=>setStep(2)} variant="gold" disabled={selectedPlayers.length<2} style={{width:'100%', marginTop:24, padding:'15px', fontSize:17}}>NEXT: SELECT COURSE →</Btn>
          </div>
        )}

        {step===2 && (
          addMode==='builder' ? (
            <CourseBuilder onSave={handleSaveCourse} onCancel={()=>{setAddMode('list');setScanPrefill(null);}} prefill={scanPrefill}/>
          ) : (
            <div>
              <div style={setupS.stepTitle}>SELECT COURSE</div>
              <div style={setupS.stepSub}>Search the course list or enter one manually</div>
              <div style={{marginTop:16, marginBottom:10}}>
                <input value={courseSearch} onChange={e=>setCourseSearch(e.target.value)} placeholder="Search courses…" style={inputBase}/>
              </div>
              <div style={{display:'flex', gap:8, marginBottom:6}}>
                <Btn onClick={()=>{setScanPrefill(null);setAddMode('builder');}} variant="surface" style={{flex:1, padding:'11px 10px', fontSize:13}}>✏️ ADD A COURSE MANUALLY</Btn>
              </div>
              <div style={{display:'flex', flexDirection:'column'}}>
                {favCourses.length > 0 && <CourseGroup label="⭐ FAVORITES" list={favCourses} course={course} onSelect={selectCourse} defaultOpen={true} favIds={favIds} onToggleFav={toggleFav}/>}
                {recentCourses.length > 0 && <CourseGroup label="🕑 RECENTLY PLAYED" list={recentCourses} course={course} onSelect={selectCourse} defaultOpen={!isSearching} favIds={favIds} onToggleFav={toggleFav}/>}
                {customFiltered.length > 0 && <CourseGroup label="MY COURSES" list={customFiltered} course={course} onSelect={selectCourse} defaultOpen={true} favIds={favIds} onToggleFav={toggleFav}/>}
                {stateGroups.map(({state, label, list}) => <CourseGroup key={state} label={label.toUpperCase()} list={list} course={course} onSelect={selectCourse} defaultOpen={isSearching} favIds={favIds} onToggleFav={toggleFav}/>)}
                {filtered.length===0 && (
                  <div style={{textAlign:'center', padding:'32px 0', color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13}}>
                    No courses match "{courseSearch}"<br/>
                    <span role="button" tabIndex={0} onClick={()=>{setScanPrefill(null);setAddMode('builder');}} onKeyDown={e=>{if(e.key==='Enter')setAddMode('builder');}} style={{color:'#C8A15A', cursor:'pointer', fontWeight:600}}>enter it manually →</span>
                  </div>
                )}
              </div>
              {/* ── Tee box selection (drives yardages + course handicaps) ── */}
              {course && (course.tees || []).length > 1 && (
                <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'14px 16px', marginTop:16}}>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#C8A15A', marginBottom:12}}>TEE BOX</div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    {course.tees.map(t => {
                      const on = (teeId || course.tees[0].id) === t.id;
                      return (
                        <div key={t.id} onClick={()=>setTeeId(t.id)}
                          style={{flex:'1 1 30%', minWidth:100, padding:'10px 12px', borderRadius:12, cursor:'pointer', textAlign:'center',
                            background:on?'rgba(14,43,32,0.05)':'#F6F4EE', border:on?'1px solid #0E2B20':'1px solid #E7E3D9',
                            WebkitTapHighlightColor:'transparent'}}>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:on?'#0E2B20':'#3F5F4A'}}>{t.name}</div>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A', marginTop:2}}>{t.rating} / {t.slope}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Starting Tee (shown once an 18-hole course is picked) ── */}
              {course && course.holeCount !== 9 && (
                <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'14px 16px', marginTop:16}}>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#C8A15A', marginBottom:12}}>STARTING TEE</div>
                  <div style={{display:'flex', gap:10}}>
                    {[{ v:1, label:'1st Tee', sub:'Holes 1 → 18' }, { v:10, label:'10th Tee', sub:'Holes 10 → 9' }].map(opt => {
                      const on = startingTee === opt.v;
                      return (
                        <div key={opt.v} onClick={()=>setStartingTee(opt.v)}
                          style={{flex:1, padding:'12px 14px', borderRadius:12, cursor:'pointer', textAlign:'center',
                            background:on?'rgba(14,43,32,0.05)':'#F6F4EE', border:on?'1px solid #0E2B20':'1px solid #E7E3D9',
                            WebkitTapHighlightColor:'transparent'}}>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:on?'#0E2B20':'#3F5F4A'}}>{opt.label}</div>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A', marginTop:2}}>{opt.sub}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Optional stat tracking ── */}
              {course && (
                <div onClick={()=>setTrackStats(v=>!v)}
                  style={{background:'#FFFFFF', border:trackStats?'1px solid #0E2B20':'1px solid #E7E3D9', borderRadius:16, padding:'14px 16px', marginTop:16, display:'flex', alignItems:'center', gap:12, cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>
                  <span style={{fontSize:20}}>📈</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>Track Round Stats</div>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', marginTop:2, lineHeight:1.4}}>Fairways, greens, penalties, sand saves, up &amp; downs — feeds your Stats dashboard</div>
                  </div>
                  <div style={{...setupS.check, background:trackStats?'#0E2B20':'transparent', border:`2px solid ${trackStats?'#0E2B20':'#E7E3D9'}`}}>
                    {trackStats && <span style={{color:'#F6F4EE', fontSize:14, fontWeight:900}}>✓</span>}
                  </div>
                </div>
              )}
              <div style={{display:'flex', gap:10, marginTop:24}}>
                <Btn onClick={()=>setStep(1)} variant="ghost" style={{padding:'14px 20px'}}>← BACK</Btn>
                <Btn onClick={()=>setStep(3)} variant="gold" disabled={!course} style={{flex:1, fontSize:17}}>NEXT: FORMATS →</Btn>
              </div>
            </div>
          )
        )}

        {step===3 && (
          <div>
            <div style={setupS.stepTitle}>GAMES & FORMATS</div>
            <div style={setupS.stepSub}>Pick match formats, money games, or both</div>

            {/* ── Golf Trip Selector ── */}
            <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'14px 16px', marginTop:16}}>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#C8A15A', marginBottom:12}}>GOLF TRIP (OPTIONAL)</div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {/* No Trip */}
                <div onClick={()=>setTripMode('none')} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:tripMode==='none'?'rgba(14,43,32,0.05)':'transparent', border:tripMode==='none'?'1px solid rgba(14,43,32,0.15)':'1px solid transparent', WebkitTapHighlightColor:'transparent'}}>
                  <div style={{width:18, height:18, borderRadius:'50%', border:`2px solid ${tripMode==='none'?'#0E2B20':'#E7E3D9'}`, background:tripMode==='none'?'#0E2B20':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                    {tripMode==='none' && <div style={{width:7, height:7, borderRadius:'50%', background:'#F6F4EE'}}/>}
                  </div>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:14, color:'#0E2B20'}}>No Trip</span>
                </div>

                {/* Existing Trip */}
                {availableTrips.length > 0 && (
                  <div>
                    <div onClick={()=>{setTripMode('existing'); if(!selectedTripId && availableTrips.length>0) setSelectedTripId(availableTrips[0].id);}} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:tripMode==='existing'?'rgba(14,43,32,0.05)':'transparent', border:tripMode==='existing'?'1px solid rgba(14,43,32,0.15)':'1px solid transparent', WebkitTapHighlightColor:'transparent'}}>
                      <div style={{width:18, height:18, borderRadius:'50%', border:`2px solid ${tripMode==='existing'?'#0E2B20':'#E7E3D9'}`, background:tripMode==='existing'?'#0E2B20':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                        {tripMode==='existing' && <div style={{width:7, height:7, borderRadius:'50%', background:'#F6F4EE'}}/>}
                      </div>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:14, color:'#0E2B20'}}>Add to existing trip</span>
                    </div>
                    {tripMode==='existing' && (
                      <select value={selectedTripId} onChange={e=>setSelectedTripId(e.target.value)}
                        style={{width:'100%', marginTop:6, padding:'10px 12px', background:'#F6F4EE', border:'1px solid #C8A15A', borderRadius:10, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, fontWeight:600, color:'#0E2B20', outline:'none', cursor:'pointer'}}>
                        {availableTrips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {/* New Trip */}
                <div>
                  <div onClick={()=>setTripMode('new')} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, cursor:'pointer', background:tripMode==='new'?'rgba(200,161,90,0.06)':'transparent', border:tripMode==='new'?'1px solid rgba(200,161,90,0.3)':'1px solid transparent', WebkitTapHighlightColor:'transparent'}}>
                    <div style={{width:18, height:18, borderRadius:'50%', border:`2px solid ${tripMode==='new'?'#C8A15A':'#E7E3D9'}`, background:tripMode==='new'?'#C8A15A':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                      {tripMode==='new' && <div style={{width:7, height:7, borderRadius:'50%', background:'#F6F4EE'}}/>}
                    </div>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:14, color:tripMode==='new'?'#C8A15A':'#3F5F4A'}}>+ Create new trip</span>
                  </div>
                  {tripMode==='new' && (
                    <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8, paddingLeft:4}}>
                      <input autoFocus value={newTripName} onChange={e=>setNewTripName(e.target.value)} placeholder="Trip name (e.g. Pinehurst 2026) *"
                        style={{background:'#F6F4EE', border:'1px solid #C8A15A', borderRadius:10, padding:'10px 12px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box'}}/>
                      <input value={newTripLocation} onChange={e=>setNewTripLocation(e.target.value)} placeholder="Location (optional)"
                        style={{background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:10, padding:'10px 12px', color:'#0E2B20', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box'}}/>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Match formats (MatchEngine) ── */}
            <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'14px 16px', marginTop:16}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:games.length?12:4}}>
                <div>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#C8A15A'}}>MATCH FORMATS</div>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', marginTop:3}}>Stroke play, match play, scrambles, stableford &amp; more — gross or net</div>
                </div>
                <button onClick={()=>setGamePickerOpen(true)}
                  style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, letterSpacing:1, color:'#15803D', background:'rgba(21,128,61,0.07)', border:'1px solid rgba(21,128,61,0.2)', borderRadius:7, padding:'5px 12px', cursor:'pointer', WebkitTapHighlightColor:'transparent', flexShrink:0}}>
                  + ADD GAME
                </button>
              </div>
              {games.length > 0 && (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {games.map(g => (
                    <GameConfigCard key={g.id} game={g} players={roundPlayersForGames}
                      onChange={updated=>updateGame(g.id, updated)} onRemove={()=>removeGame(g.id)}/>
                  ))}
                </div>
              )}
            </div>

            <GamePickerModal open={gamePickerOpen} onClose={()=>setGamePickerOpen(false)} onPick={addGame} playerCount={selectedPlayers.length}/>

            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2, color:'#C8A15A', marginTop:20, marginBottom:-4}}>MONEY GAMES</div>
            <div style={{display:'flex', flexDirection:'column', gap:12, marginTop:16}}>
              {Object.entries(FORMAT_INFO).map(([key, info]) => {
                const on = formats[key];
                return (
                  <div key={key} style={{...setupS.formatCard, border:on?'1px solid #0E2B20':'1px solid #E7E3D9', background:on?'rgba(14,43,32,0.04)':'#FFFFFF'}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}} onClick={()=>toggleFormat(key)}>
                      <span style={{fontSize:22, flexShrink:0}}>{info.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:17, color:'#0E2B20'}}>{info.label}</div>
                        <div style={{fontSize:12, color:'#3F5F4A', marginTop:2, lineHeight:1.4, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{info.desc}</div>
                      </div>
                      <div style={{...setupS.check, flexShrink:0, background:on?'#0E2B20':'transparent', border:`2px solid ${on?'#0E2B20':'#E7E3D9'}`}}>
                        {on && <span style={{color:'#F6F4EE', fontSize:14, fontWeight:900}}>✓</span>}
                      </div>
                    </div>
                    {on && key !== 'nassau' && key !== 'markeymatch' && (
                      <div style={{borderTop:'1px solid rgba(14,43,32,0.08)', marginTop:12, paddingTop:12}}>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:10, letterSpacing:2, color:'#3F5F4A', marginBottom:8}}>
                          STAKE ({key==='wolf'?'pot ante per player':key==='passmoney'?'pot — winner collects from each player':key==='skins'?'per skin':'winner takes all'})
                        </div>
                        <StakesInput value={stakes[key]} onChange={v=>setStakes(prev=>({...prev,[key]:v}))}/>
                      </div>
                    )}
                    {on && key === 'nassau' && (
                      <div style={{borderTop:'1px solid rgba(14,43,32,0.08)', marginTop:12, paddingTop:12}}>
                        <NassauMultiMatchConfig roundPlayers={roundPlayersForNassau} nassauMatches={nassauMatches} onChange={setNassauMatches} course={course}/>
                      </div>
                    )}
                    {on && key === 'markeymatch' && (
                      <div style={{borderTop:'1px solid rgba(14,43,32,0.08)', marginTop:12, paddingTop:12}}>
                        {selectedPlayers.length < 2
                          ? <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#DC2626'}}>⚠️ Markey Match requires at least 2 players — select players in Step 1</div>
                          : <MarkeyMatchConfig roundPlayers={roundPlayersForNassau} markeyMatchConfig={markeyMatchConfig} onChange={setMarkeyMatchConfig} course={course}/>
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(activeFormats.length > 0 || games.length > 0) && (
              <div style={{marginTop:16, background:'rgba(200,161,90,0.04)', border:'1px solid rgba(200,161,90,0.15)', borderRadius:12, padding:'12px 14px'}}>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:2.5, color:'#C8A15A', marginBottom:8}}>ROUND SUMMARY</div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A'}}>
                  <div style={{marginBottom:2}}>📍 {course?.name}{course && (course.tees||[]).length > 1 && teeId ? ` · ${(course.tees.find(t=>t.id===teeId)||course.tees[0]).name} tees` : ''}{course?.holeCount === 9 ? ' · 9 holes' : ''}</div>
                  <div style={{marginBottom:2}}>👥 {selectedPlayers.length} players{trackStats ? ' · 📈 stat tracking on' : ''}</div>
                  {games.map(g => {
                    const def = window.MatchEngine.get(g.formatId);
                    if (!def) return null;
                    const basis = def.basis === 'choice' ? (g.config?.scoringBasis || 'net') : def.basis;
                    const teamStr = (g.config?.teams || []).map(t => (t.playerIds||[]).map(id => roundPlayersForGames.find(p=>p.id===id)?.name.split(' ')[0]).filter(Boolean).join(' & ')).filter(Boolean).join(' vs ');
                    return <div key={g.id} style={{marginBottom:2}}>{def.icon} {def.label} — <span style={{color:'#C8A15A', fontWeight:700}}>{basis.toUpperCase()}</span>{teamStr ? <span style={{display:'block', marginLeft:16, fontSize:11}}>· {teamStr}</span> : null}</div>;
                  })}
                  {tripMode==='new' && newTripName.trim() && <div style={{marginBottom:2}}>🗺️ New trip: <span style={{color:'#C8A15A', fontWeight:700}}>{newTripName.trim()}</span></div>}
                  {tripMode==='existing' && selectedTripId && <div style={{marginBottom:2}}>🗺️ Trip: <span style={{color:'#C8A15A', fontWeight:700}}>{availableTrips.find(t=>t.id===selectedTripId)?.name}</span></div>}
                  {activeFormats.map(f => (
                    <div key={f.type}>
                      🎯 {FORMAT_INFO[f.type].label}
                      {f.type !== 'nassau' && f.type !== 'markeymatch' && <span> — <span style={{color:'#C8A15A', fontWeight:700}}>${f.stakes}</span></span>}
                      {f.type === 'nassau' && f.nassauMatches && f.nassauMatches.length > 0 && (
                        <span style={{color:'#3F5F4A', marginLeft:6}}>
                          {f.nassauMatches.length} match{f.nassauMatches.length>1?'es':''}
                          {f.nassauMatches.map((m,i)=>{
                            const popCount=Object.values(m.popHoles||{}).reduce((a,arr)=>a+(arr||[]).filter(Boolean).length,0);
                            if (m.matchType==='2v2' && m.teams) {
                              const tName = ids => (ids||[]).map(id=>roundPlayersForNassau.find(p=>p.id===id)?.name.split(' ')[0]).filter(Boolean).join(' & ');
                              const t1=tName(m.teams.team1); const t2=tName(m.teams.team2);
                              if(!t1||!t2)return null;
                              return <span key={m.id} style={{display:'block', marginLeft:16, color:'#3F5F4A', fontSize:11}}>· {t1} vs {t2} — ${m.stakes}</span>;
                            }
                            const p1=roundPlayersForNassau.find(p=>p.id===m.playersInMatch[0]);
                            const p2=roundPlayersForNassau.find(p=>p.id===m.playersInMatch[1]);
                            if(!p1||!p2)return null;
                            return <span key={m.id} style={{display:'block', marginLeft:16, color:'#3F5F4A', fontSize:11}}>· {p1.name.split(' ')[0]} vs {p2.name.split(' ')[0]} — ${m.stakes}{popCount>0?` · ${popCount} pops`:''}</span>;
                          })}
                        </span>
                      )}
                      {f.type === 'markeymatch' && f.markeyMatchConfig?.team1?.length >= 1 && f.markeyMatchConfig?.team2?.length >= 1 && (() => {
                        const cfg = f.markeyMatchConfig;
                        const t1 = cfg.team1.map(id => roundPlayersForNassau.find(p=>p.id===id)?.name.split(' ')[0]).filter(Boolean).join(' & ');
                        const t2 = cfg.team2.map(id => roundPlayersForNassau.find(p=>p.id===id)?.name.split(' ')[0]).filter(Boolean).join(' & ');
                        return <span style={{color:'#3F5F4A', marginLeft:6, display:'block', marginTop:2, fontSize:11}}>· {t1} vs {t2} — <span style={{color:'#C8A15A', fontWeight:700}}>${cfg.stake}/match</span></span>;
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:'flex', gap:10, marginTop:16}}>
              <Btn onClick={()=>setStep(2)} variant="ghost" style={{padding:'14px 20px'}}>← BACK</Btn>
              <Btn onClick={handleStart} variant="gold" disabled={!canStart} style={{flex:1, fontSize:17, padding:'15px'}}>⛳ TEE IT UP</Btn>
            </div>
            {!canStart && (
              <div style={{textAlign:'center', marginTop:8, fontSize:12, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                {!gamesValid ? 'Finish setting up your match formats (see errors above)' : !nassauValid ? 'Complete all Nassau match setups to continue' : !markeyValid ? 'Assign 1–2 players to each Markey Match team to continue' : !tripValid ? 'Enter a trip name to continue' : 'Add at least one game or format to continue'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const setupS = {
  root:      { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:'#F6F4EE' },
  stepBar:   { display:'flex', alignItems:'flex-end', padding:'20px 24px 0', gap:0 },
  stepItem:  { display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer' },
  stepDot:   { width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, transition:'all 0.2s' },
  stepLabel: { fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, letterSpacing:2, fontWeight:600, marginBottom:12 },
  content:   { padding:'24px 20px', flex:1 },
  stepTitle: { fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:24, color:'#0E2B20', letterSpacing:0.5 },
  stepSub:   { fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', marginTop:4 },
  playerRow: { display:'flex', alignItems:'center', gap:14, borderRadius:16, padding:'14px 16px', cursor:'pointer', transition:'all 0.15s' },
  courseCard:{ display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:14, padding:'14px 16px', cursor:'pointer' },
  formatCard:{ borderRadius:16, padding:'16px', cursor:'default' },
  check:     { width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};

Object.assign(window, { SetupScreen, CourseBuilder });
