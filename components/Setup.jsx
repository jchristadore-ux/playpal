// Setup.jsx — Course persistence + scorecard image scan + realtime course sync

// ─── Scorecard Scanner ────────────────────────────────────────────────────────
const ScorecardScanner = ({ onResult, onCancel }) => {
  const [status, setStatus]     = React.useState('idle'); // idle | scanning | done | error
  const [preview, setPreview]   = React.useState(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  const fileRef = React.useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (JPG, PNG, HEIC, etc.)');
      setStatus('error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    setStatus('scanning');
    setErrorMsg('');

    const b64Reader = new FileReader();
    b64Reader.onload = (e) => {
      const b64 = e.target.result.split(',')[1];
      callVision(b64, file.type || 'image/jpeg');
    };
    b64Reader.readAsDataURL(file);
  };

  const callVision = async (b64, mediaType) => {
    const prompt = `You are analyzing a golf scorecard image. Extract the data and return ONLY valid JSON — no markdown, no explanation, no code fences.

Return exactly this structure:
{
  "name": "Full official course name",
  "location": "City, State",
  "rating": 72.0,
  "slope": 113,
  "holes": [
    {"num": 1, "par": 4, "yds": 380, "hdcp": 7},
    {"num": 2, "par": 4, "yds": 350, "hdcp": 11},
    ... (exactly 18 entries)
  ]
}

Rules:
- name: official course name from the scorecard header
- location: city and state abbreviation, e.g. "Bridgewater, NJ" — use "Unknown" if not visible
- rating: course/scratch rating decimal number — default 72.0 if not visible
- slope: slope rating integer — default 113 if not visible
- holes: EXACTLY 18 entries numbered 1–18, each with:
    num  = hole number (1–18)
    par  = 3, 4, or 5 only
    yds  = yardage integer (use 0 if unreadable)
    hdcp = handicap/stroke index 1–18 (assign 1–18 sequentially if not visible)
- If only a 9-hole scorecard is visible, fill holes 10–18 by repeating holes 1–9 par values with hdcp offset by 9
- NEVER return fewer than 18 holes`;

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      if (!resp.ok) throw new Error('API error ' + resp.status);
      const data = await resp.json();
      const raw  = data.content?.find(b => b.type === 'text')?.text || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      if (!parsed.name || !Array.isArray(parsed.holes) || parsed.holes.length !== 18) {
        throw new Error('Could not read all 18 holes. Try a clearer, well-lit photo.');
      }

      parsed.rating = parseFloat(parsed.rating) || 72.0;
      parsed.slope  = parseInt(parsed.slope)    || 113;
      parsed.holes  = parsed.holes.map((h, i) => ({
        num:  parseInt(h.num)  || i + 1,
        par:  parseInt(h.par)  || 4,
        yds:  parseInt(h.yds)  || 0,
        hdcp: parseInt(h.hdcp) || i + 1,
      }));

      setStatus('done');
      onResult(parsed);

    } catch (err) {
      console.error('[Scanner]', err);
      setStatus('error');
      setErrorMsg(err.message || 'Could not read scorecard. Try a clearer, well-lit photo.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const borderColor = status === 'error' ? '#E5534B' : status === 'done' ? '#3DCB6C' : '#1E3A6E';

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18, color:'#C9A84C', letterSpacing:1}}>
        📸 SCAN SCORECARD
      </div>
      <div style={{fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', lineHeight:1.6}}>
        Take a screenshot or photo of any scorecard. Claude will automatically read the course name, par, yardage, and handicap for all 18 holes.
      </div>

      {/* Drop / tap zone */}
      <div
        onClick={() => status !== 'scanning' && fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        style={{
          border: `2px dashed ${borderColor}`,
          borderRadius: 14,
          background: '#0A1628',
          minHeight: 180,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10, cursor: status === 'scanning' ? 'default' : 'pointer',
          overflow: 'hidden', position: 'relative',
          transition: 'border-color 0.2s',
        }}>

        {preview && (
          <img src={preview} alt="preview" style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', opacity: status === 'scanning' ? 0.4 : 0.25,
          }}/>
        )}

        <div style={{position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          {status === 'scanning' ? (
            <>
              <div style={{width:36, height:36, border:'3px solid #1E3A6E', borderTopColor:'#3DCB6C', borderRadius:'50%', animation:'ppSpin 0.8s linear infinite'}}/>
              <div style={{fontFamily:'Barlow Condensed', fontSize:14, letterSpacing:1, color:'#3DCB6C'}}>READING SCORECARD…</div>
            </>
          ) : status === 'error' ? (
            <>
              <div style={{fontSize:32}}>⚠️</div>
              <div style={{fontFamily:'DM Sans', fontSize:13, color:'#E5534B', textAlign:'center', padding:'0 16px'}}>{errorMsg}</div>
              <div style={{fontFamily:'Barlow Condensed', fontSize:12, color:'#7A98BC', letterSpacing:1}}>TAP TO TRY AGAIN</div>
            </>
          ) : (
            <>
              <div style={{fontSize:40}}>📸</div>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color:'#fff', letterSpacing:1}}>TAP TO UPLOAD SCORECARD</div>
              <div style={{fontFamily:'DM Sans', fontSize:12, color:'#7A98BC'}}>or drag and drop an image</div>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />

      <div style={{display:'flex', gap:10}}>
        <Btn onClick={onCancel} variant="ghost" style={{flex:1}}>CANCEL</Btn>
        {(status === 'error' || status === 'idle') && preview && (
          <Btn onClick={() => { setStatus('idle'); setPreview(null); setErrorMsg(''); }} variant="surface" style={{flex:1}}>
            CLEAR IMAGE
          </Btn>
        )}
      </div>
      <style>{`@keyframes ppSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Custom Course Builder ────────────────────────────────────────────────────
const BLANK_HOLES = Array.from({length:18}, (_,i) => ({ num:i+1, par:4, yds:'', hdcp:i+1 }));

const CourseBuilder = ({ onSave, onCancel, prefill }) => {
  const [name,     setName]     = React.useState(prefill?.name     || '');
  const [location, setLocation] = React.useState(prefill?.location || '');
  const [rating,   setRating]   = React.useState(prefill?.rating   ? String(prefill.rating) : '');
  const [slope,    setSlope]    = React.useState(prefill?.slope    ? String(prefill.slope)  : '');
  const [holes,    setHoles]    = React.useState(() => {
    if (prefill?.holes?.length === 18) {
      return prefill.holes.map(h => ({
        num:  h.num,
        par:  h.par  || 4,
        yds:  h.yds  || '',
        hdcp: h.hdcp || h.num,
      }));
    }
    return BLANK_HOLES.map(h => ({...h}));
  });

  const setHoleField = (idx, field, val) => {
    setHoles(prev => prev.map((h,i) =>
      i === idx ? {...h, [field]: field === 'yds' ? val : Number(val)||0} : h
    ));
  };

  const totalPar = holes.reduce((a,h) => a + (h.par||0), 0);
  const valid    = name.trim() && holes.every(h => h.par >= 3 && h.par <= 6 && h.hdcp >= 1 && h.hdcp <= 18);

  const handleSave = () => {
    const course = {
      id:       'custom_' + Date.now(),
      name:     name.trim(),
      location: location.trim() || 'Custom Course',
      rating:   parseFloat(rating) || 72.0,
      slope:    parseInt(slope)    || 113,
      custom:   true,
      holes:    holes.map(h => ({...h, yds: parseInt(h.yds)||0})),
    };

    let existing = [];
    try { existing = JSON.parse(localStorage.getItem('pp_custom_courses') || '[]'); } catch(e) {}
    const updated = [...existing, course];

    // 1) Write localStorage first — guaranteed local persistence
    localStorage.setItem('pp_custom_courses', JSON.stringify(updated));

    // 2) Sync complete array to RTDB — subscribe listener will update all devices
    if (window.CourseSyncService) {
      window.CourseSyncService.save(updated, function(ok) {
        if (!ok) console.warn('[PlayPal] Course RTDB sync failed — saved locally only');
      });
    }

    // 3) Return BOTH the new course object AND the full updated array to parent
    onSave(course, updated);
  };

  const inputStyle = {
    background:'#162950', border:'1px solid #1E3A6E', borderRadius:8,
    padding:'10px 12px', color:'#fff', fontFamily:'DM Sans', fontSize:14,
    outline:'none', boxSizing:'border-box', width:'100%',
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18, color:'#C9A84C', letterSpacing:1}}>
        {prefill ? '✅ REVIEW & SAVE' : 'ADD CUSTOM COURSE'}
      </div>
      {prefill && (
        <div style={{background:'rgba(61,203,108,0.06)', border:'1px solid rgba(61,203,108,0.25)', borderRadius:10, padding:'10px 14px', fontFamily:'DM Sans', fontSize:12, color:'#3DCB6C'}}>
          Scorecard scanned successfully — review and correct any values before saving.
        </div>
      )}

      {/* Course details */}
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div>
          <Label style={{display:'block', marginBottom:4}}>COURSE NAME *</Label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Green Knoll Golf Course" style={inputStyle}/>
        </div>
        <div>
          <Label style={{display:'block', marginBottom:4}}>LOCATION</Label>
          <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Bridgewater, NJ" style={inputStyle}/>
        </div>
        <div style={{display:'flex', gap:10}}>
          <div style={{flex:1}}>
            <Label style={{display:'block', marginBottom:4}}>COURSE RATING</Label>
            <input value={rating} onChange={e=>setRating(e.target.value)} placeholder="e.g. 70.1" style={inputStyle}/>
          </div>
          <div style={{flex:1}}>
            <Label style={{display:'block', marginBottom:4}}>SLOPE</Label>
            <input value={slope} onChange={e=>setSlope(e.target.value)} placeholder="e.g. 121" style={inputStyle}/>
          </div>
        </div>
      </div>

      {/* Hole-by-hole scorecard */}
      <div>
        <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:8}}>
          <Label>SCORECARD — 18 HOLES</Label>
          <span style={{fontFamily:'Barlow Condensed', fontSize:12,
            color: totalPar >= 68 && totalPar <= 76 ? '#3DCB6C' : '#E5534B'}}>
            Total par: {totalPar}
          </span>
        </div>
        <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
          <table style={{borderCollapse:'collapse', width:'100%', minWidth:300}}>
            <thead>
              <tr>
                {['#','PAR','YDS','HCP'].map(h=>(
                  <th key={h} style={{padding:'4px 6px', fontFamily:'Barlow Condensed', fontSize:10, letterSpacing:1, color:'#4A6890', textAlign:'center', borderBottom:'1px solid #1E3A6E'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holes.map((h, i) => (
                <tr key={i} style={{background: i%2===0 ? '#0A1628' : '#0F2040'}}>
                  <td style={{padding:'4px 6px', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color: i<9 ? '#7A98BC' : '#9BB4D4', textAlign:'center'}}>{h.num}</td>
                  <td style={{padding:'3px 4px'}}>
                    <select value={h.par} onChange={e=>setHoleField(i,'par',e.target.value)}
                      style={{background:'#162950', border:'1px solid #1E3A6E', color:'#fff', borderRadius:5, padding:'5px 4px', fontFamily:'Barlow Condensed', fontSize:14, width:'100%', outline:'none'}}>
                      {[3,4,5].map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{padding:'3px 4px'}}>
                    <input value={h.yds} onChange={e=>setHoleField(i,'yds',e.target.value)}
                      placeholder="—" type="number" min="50" max="700"
                      style={{background:'#162950', border:'1px solid #1E3A6E', color:'#fff', borderRadius:5, padding:'5px 4px', fontFamily:'DM Sans', fontSize:13, width:'100%', outline:'none', textAlign:'center'}}/>
                  </td>
                  <td style={{padding:'3px 4px'}}>
                    <select value={h.hdcp} onChange={e=>setHoleField(i,'hdcp',e.target.value)}
                      style={{background:'#162950', border:'1px solid #1E3A6E', color:'#fff', borderRadius:5, padding:'5px 4px', fontFamily:'Barlow Condensed', fontSize:14, width:'100%', outline:'none'}}>
                      {Array.from({length:18},(_,j)=>j+1).map(v=><option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{display:'flex', gap:10}}>
        <Btn onClick={onCancel} variant="ghost" style={{flex:1}}>CANCEL</Btn>
        <Btn onClick={handleSave} variant="gold" disabled={!valid} style={{flex:2}}>
          💾 SAVE COURSE
        </Btn>
      </div>
    </div>
  );
};

// ─── Stakes Input ─────────────────────────────────────────────────────────────
const StakesInput = ({ value, onChange }) => {
  const presets = [1, 2, 5, 10, 20, 25, 50];
  const [custom, setCustom] = React.useState(!presets.includes(value));
  const [customVal, setCustomVal] = React.useState(presets.includes(value) ? '' : String(value));

  const handleCustomChange = (v) => {
    setCustomVal(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) onChange(n);
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
        {presets.map(v => (
          <div key={v} onClick={() => { setCustom(false); onChange(v); }}
            style={{padding:'6px 13px', borderRadius:7, cursor:'pointer', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15,
              background: !custom && value===v ? '#3DCB6C' : '#162950',
              color:      !custom && value===v ? '#0A1628'  : '#9BB4D4',
              border:     !custom && value===v ? 'none'     : '1px solid #1E3A6E'}}>
            ${v}
          </div>
        ))}
        <div onClick={()=>setCustom(true)}
          style={{padding:'6px 13px', borderRadius:7, cursor:'pointer', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:15,
            background: custom ? '#C9A84C' : '#162950', color: custom ? '#0A1628' : '#9BB4D4',
            border: custom ? 'none' : '1px solid #1E3A6E'}}>
          OTHER
        </div>
      </div>
      {custom && (
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontFamily:'Barlow Condensed', fontSize:20, color:'#C9A84C', fontWeight:800}}>$</span>
          <input autoFocus value={customVal} onChange={e=>handleCustomChange(e.target.value)}
            type="number" min="0.5" step="0.5" placeholder="Enter amount"
            style={{flex:1, background:'#162950', border:'1px solid #C9A84C', borderRadius:8, padding:'10px 12px',
              color:'#fff', fontFamily:'Barlow Condensed', fontSize:18, fontWeight:700, outline:'none'}}/>
        </div>
      )}
    </div>
  );
};

// ─── Setup Screen ─────────────────────────────────────────────────────────────
const SetupScreen = ({ allPlayers, onStart }) => {
  const [step, setStep]                         = React.useState(1);
  const [selectedPlayers, setSelectedPlayers]   = React.useState(allPlayers.slice(0,4).map(p=>p.id));
  const [course, setCourse]                     = React.useState(null);
  const [courseSearch, setCourseSearch]         = React.useState('');
  const [addMode, setAddMode]                   = React.useState('list'); // 'list' | 'scanner' | 'builder'
  const [scanPrefill, setScanPrefill]           = React.useState(null);
  const [formats, setFormats]                   = React.useState({ wolf:false, nassau:false, stableford:false, passmoney:false, skins:false });
  const [stakes,  setStakes]                    = React.useState({ wolf:2, nassau:5, stableford:1, passmoney:5, skins:5 });

  // ── CUSTOM COURSES — live subscription ────────────────────────────────────
  // Initialise from localStorage for instant render, then subscribe to RTDB
  // so any device adding a course updates all open clients in realtime.
  const [customCourses, setCustomCourses] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('pp_custom_courses') || '[]'); } catch(e) { return []; }
  });

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

  const togglePlayer = (id) => {
    setSelectedPlayers(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length < 6 ? [...prev,id] : prev);
  };
  const toggleFormat = (f) => setFormats(prev => ({...prev, [f]:!prev[f]}));

  const allCourses    = [...customCourses, ...COURSES];
  const query         = courseSearch.toLowerCase();
  const filtered      = allCourses.filter(c =>
    !query || c.name.toLowerCase().includes(query) || c.location.toLowerCase().includes(query)
  );
  const activeFormats = Object.entries(formats).filter(([,v])=>v).map(([k])=>({ type:k, stakes:stakes[k] }));
  const canStart      = selectedPlayers.length >= 2 && course && activeFormats.length > 0;

  // CourseBuilder writes localStorage + RTDB atomically, then calls back with
  // (newCourse, fullUpdatedArray). Just update React state here.
  const handleSaveCourse = (newCourse, fullUpdatedArray) => {
    setCustomCourses(fullUpdatedArray);
    setCourse(newCourse);
    setAddMode('list');
    setScanPrefill(null);
  };

  const handleScanResult = (scannedData) => {
    setScanPrefill(scannedData);
    setAddMode('builder');
  };

  const handleStart = () => {
    const players = allPlayers.filter(p => selectedPlayers.includes(p.id));
    onStart({ players, course, formats: activeFormats, syncCode: generateSyncCode() });
  };

  const steps = ['Players','Course','Formats'];

  const CourseGroup = ({label, list}) => list.length === 0 ? null : (
    <div style={{marginBottom:4}}>
      <div style={{fontFamily:'Barlow Condensed', fontSize:10, letterSpacing:2, color:'#4A6890', fontWeight:700, padding:'8px 0 4px'}}>{label}</div>
      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {list.map(c => {
          const sel = course?.id === c.id;
          return (
            <div key={c.id} onClick={()=>setCourse(c)}
              style={{...setupS.courseCard, border: sel?'1px solid #C9A84C':'1px solid #1E3A6E', background: sel?'rgba(201,168,76,0.08)':'#0F2040'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:16, color: sel?'#C9A84C':'#fff'}}>{c.name}</div>
                  {c.custom && <span style={{fontFamily:'Barlow Condensed', fontSize:9, letterSpacing:1, color:'#3DCB6C', background:'rgba(61,203,108,0.12)', border:'1px solid rgba(61,203,108,0.3)', padding:'1px 6px', borderRadius:4}}>CUSTOM</span>}
                </div>
                <div style={{fontSize:11, color:'#7A98BC', marginTop:2}}>{c.location}</div>
                <div style={{fontSize:10, color:'#4A6890', marginTop:1}}>Rating {c.rating} · Slope {c.slope}</div>
              </div>
              {sel && <span style={{color:'#C9A84C', fontSize:20, flexShrink:0}}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={setupS.root}>
      {/* Step indicator */}
      <div style={setupS.stepBar}>
        {steps.map((s,i) => (
          <React.Fragment key={s}>
            <div style={setupS.stepItem} onClick={()=> i+1 < step && setStep(i+1)}>
              <div style={{...setupS.stepDot, background: step>i+1?'#3DCB6C': step===i+1?'#C9A84C':'#1E3A6E', color: step>=i+1?'#0A1628':'#4A6890'}}>
                {step>i+1 ? '✓' : i+1}
              </div>
              <span style={{...setupS.stepLabel, color: step===i+1?'#fff': step>i+1?'#3DCB6C':'#4A6890'}}>{s}</span>
            </div>
            {i<2 && <div style={{flex:1, height:1, background: step>i+1?'#3DCB6C':'#1E3A6E', margin:'0 8px', marginBottom:12}}/>}
          </React.Fragment>
        ))}
      </div>

      <div style={setupS.content}>

        {/* ── STEP 1: Players ── */}
        {step===1 && (
          <div>
            <div style={setupS.stepTitle}>SELECT PLAYERS <span style={{color:'#7A98BC', fontSize:13, fontWeight:400}}>({selectedPlayers.length} selected)</span></div>
            <div style={setupS.stepSub}>Choose 2–6 players for this round</div>
            <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:16}}>
              {allPlayers.map(p => {
                const sel = selectedPlayers.includes(p.id);
                return (
                  <div key={p.id} onClick={()=>togglePlayer(p.id)}
                    style={{...setupS.playerRow, border: sel?`1px solid ${p.color}`:'1px solid #1E3A6E', background: sel?`${p.color}11`:'#0F2040'}}>
                    <Avatar player={p} size={42}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:17, color:'#fff'}}>{p.name}</div>
                      <div style={{fontSize:11, color:'#7A98BC'}}>HCP {p.handicap} · GHIN {p.ghin}</div>
                    </div>
                    <div style={{...setupS.check, background: sel?p.color:'transparent', border:`2px solid ${sel?p.color:'#1E3A6E'}`}}>
                      {sel && <span style={{color:'#0A1628', fontSize:14, fontWeight:900}}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn onClick={()=>setStep(2)} variant="gold" disabled={selectedPlayers.length<2} style={{width:'100%', marginTop:24, padding:'15px', fontSize:17}}>
              NEXT: SELECT COURSE →
            </Btn>
          </div>
        )}

        {/* ── STEP 2: Course ── */}
        {step===2 && (
          addMode === 'scanner' ? (
            <ScorecardScanner
              onResult={handleScanResult}
              onCancel={() => { setAddMode('list'); setScanPrefill(null); }}
            />
          ) : addMode === 'builder' ? (
            <CourseBuilder
              onSave={handleSaveCourse}
              onCancel={() => { setAddMode('list'); setScanPrefill(null); }}
              prefill={scanPrefill}
            />
          ) : (
            <div>
              <div style={setupS.stepTitle}>SELECT COURSE</div>
              <div style={setupS.stepSub}>Search, scan a scorecard, or enter manually</div>

              {/* Search */}
              <div style={{marginTop:16, marginBottom:10}}>
                <input value={courseSearch} onChange={e=>setCourseSearch(e.target.value)}
                  placeholder="Search courses…"
                  style={{width:'100%', background:'#162950', border:'1px solid #1E3A6E', borderRadius:10,
                    padding:'11px 14px', color:'#fff', fontFamily:'DM Sans', fontSize:14, outline:'none', boxSizing:'border-box'}}/>
              </div>

              {/* Add course buttons */}
              <div style={{display:'flex', gap:8, marginBottom:6}}>
                <Btn onClick={()=>setAddMode('scanner')} variant="green"
                  style={{flex:1, padding:'11px 10px', fontSize:13}}>
                  📸 SCAN SCORECARD
                </Btn>
                <Btn onClick={()=>{ setScanPrefill(null); setAddMode('builder'); }} variant="surface"
                  style={{flex:1, padding:'11px 10px', fontSize:13}}>
                  ✏️ ENTER MANUALLY
                </Btn>
              </div>

              {/* Course lists */}
              <div style={{display:'flex', flexDirection:'column'}}>
                {customCourses.length > 0 &&
                  <CourseGroup label="MY COURSES" list={filtered.filter(c => c.custom)}/>
                }
                <CourseGroup label="NEW JERSEY" list={filtered.filter(c => !c.custom && c.location.includes(', NJ'))}/>
                <CourseGroup label="OTHER COURSES" list={filtered.filter(c => !c.custom && !c.location.includes(', NJ'))}/>
                {filtered.length === 0 && (
                  <div style={{textAlign:'center', padding:'32px 0', color:'#4A6890', fontFamily:'DM Sans', fontSize:13}}>
                    No courses match "{courseSearch}"<br/>
                    <span onClick={()=>setAddMode('scanner')} style={{color:'#3DCB6C', cursor:'pointer', fontWeight:600}}>📸 Scan a scorecard →</span>
                    {' · '}
                    <span onClick={()=>{ setScanPrefill(null); setAddMode('builder'); }} style={{color:'#C9A84C', cursor:'pointer', fontWeight:600}}>enter manually →</span>
                  </div>
                )}
              </div>

              <div style={{display:'flex', gap:10, marginTop:24}}>
                <Btn onClick={()=>setStep(1)} variant="ghost" style={{padding:'14px 20px'}}>← BACK</Btn>
                <Btn onClick={()=>setStep(3)} variant="gold" disabled={!course} style={{flex:1, fontSize:17}}>NEXT: FORMATS →</Btn>
              </div>
            </div>
          )
        )}

        {/* ── STEP 3: Formats & Stakes ── */}
        {step===3 && (
          <div>
            <div style={setupS.stepTitle}>FORMATS & STAKES</div>
            <div style={setupS.stepSub}>Choose one or more formats and set your stakes</div>
            <div style={{display:'flex', flexDirection:'column', gap:12, marginTop:16}}>
              {Object.entries(FORMAT_INFO).map(([key, info]) => {
                const on = formats[key];
                return (
                  <div key={key} style={{...setupS.formatCard, border: on?'1px solid #3DCB6C':'1px solid #1E3A6E', background: on?'rgba(61,203,108,0.05)':'#0F2040'}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}} onClick={()=>toggleFormat(key)}>
                      <span style={{fontSize:24, flexShrink:0}}>{info.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:17, color: on?'#3DCB6C':'#fff'}}>{info.label}</div>
                        <div style={{fontSize:12, color:'#7A98BC', marginTop:2, lineHeight:1.4}}>{info.desc}</div>
                      </div>
                      <div style={{...setupS.check, flexShrink:0, background: on?'#3DCB6C':'transparent', border:`2px solid ${on?'#3DCB6C':'#1E3A6E'}`}}>
                        {on && <span style={{color:'#0A1628', fontSize:14, fontWeight:900}}>✓</span>}
                      </div>
                    </div>
                    {on && (
                      <div style={{borderTop:'1px solid rgba(61,203,108,0.15)', marginTop:12, paddingTop:12}}>
                        <div style={{fontFamily:'Barlow Condensed', fontSize:11, letterSpacing:1.5, color:'#7A98BC', marginBottom:8}}>
                          STAKE ({key==='wolf'?'pot ante per player':key==='nassau'?'per bet (3 bets total)':key==='passmoney'?'pot — winner collects from each player':key==='skins'?'per skin':'winner takes all'})
                        </div>
                        <StakesInput value={stakes[key]} onChange={v=>setStakes(prev=>({...prev,[key]:v}))}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {activeFormats.length > 0 && (
              <div style={{marginTop:16, background:'rgba(201,168,76,0.05)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:10, padding:'12px 14px'}}>
                <div style={{fontFamily:'Barlow Condensed', fontSize:11, letterSpacing:1.5, color:'#C9A84C', marginBottom:8}}>ROUND SUMMARY</div>
                <div style={{fontFamily:'DM Sans', fontSize:12, color:'#9BB4D4'}}>
                  <div style={{marginBottom:2}}>📍 {course?.name}</div>
                  <div style={{marginBottom:2}}>👥 {selectedPlayers.length} players</div>
                  {activeFormats.map(f => (
                    <div key={f.type}>🎯 {FORMAT_INFO[f.type].label} — <span style={{color:'#C9A84C', fontWeight:700}}>${f.stakes}</span></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:'flex', gap:10, marginTop:16}}>
              <Btn onClick={()=>setStep(2)} variant="ghost" style={{padding:'14px 20px'}}>← BACK</Btn>
              <Btn onClick={handleStart} variant="gold" disabled={!canStart}
                style={{flex:1, fontSize:17, padding:'15px', boxShadow: canStart?'0 4px 24px rgba(201,168,76,0.3)':'none'}}>
                ⛳ TEE IT UP
              </Btn>
            </div>
            {!canStart && <div style={{textAlign:'center', marginTop:8, fontSize:12, color:'#4A6890'}}>Select at least one format to continue</div>}
          </div>
        )}
      </div>
    </div>
  );
};

const setupS = {
  root:       { flex:1, overflowY:'auto', display:'flex', flexDirection:'column' },
  stepBar:    { display:'flex', alignItems:'flex-end', padding:'20px 24px 0', gap:0 },
  stepItem:   { display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer' },
  stepDot:    { width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Barlow Condensed', fontWeight:800, fontSize:14, transition:'all 0.2s' },
  stepLabel:  { fontFamily:'Barlow Condensed', fontSize:11, letterSpacing:1.5, fontWeight:600, marginBottom:12 },
  content:    { padding:'24px 20px', flex:1 },
  stepTitle:  { fontFamily:'Barlow Condensed', fontWeight:800, fontSize:24, color:'#fff', letterSpacing:1 },
  stepSub:    { fontFamily:'DM Sans', fontSize:13, color:'#7A98BC', marginTop:4 },
  playerRow:  { display:'flex', alignItems:'center', gap:14, borderRadius:12, padding:'14px 16px', cursor:'pointer', transition:'all 0.15s' },
  courseCard: { display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:12, padding:'14px 16px', cursor:'pointer' },
  formatCard: { borderRadius:12, padding:'16px', cursor:'default' },
  check:      { width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};

Object.assign(window, { SetupScreen });
