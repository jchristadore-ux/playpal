// RoundViewer.jsx — Read-only historical round viewer
// Opens via sync code deep-link or from Recent Rounds on HomeScreen

const RoundViewer = ({ syncCode, onBack }) => {
  const [state, setState]   = React.useState('loading');
  const [round, setRound]   = React.useState(null);
  const [scores, setScores] = React.useState(null);
  const [wolfData, setWolfData]   = React.useState(null);
  const [putts, setPutts]         = React.useState(null);
  const [popFlags, setPopFlags]   = React.useState(null);
  const [errorMsg, setErrorMsg]   = React.useState('');

  React.useEffect(() => {
    if (!syncCode) { setState('error'); setErrorMsg('No round code provided.'); return; }
    setState('loading');
    if (window.RoundSyncService) {
      window.RoundSyncService.fetchRound(syncCode, function(data, err) {
        if (data && data.round) {
          setRound(data.round);
          setScores(data.scores || {});
          setWolfData(data.wolfData || {});
          setPutts(data.putts || {});
          setPopFlags(data.popFlags || {});
          setState('loaded');
        } else {
          setErrorMsg(err || 'Round not found.');
          setState('error');
        }
      });
    } else {
      const cached = localStorage.getItem('pp_round');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.syncCode === syncCode) {
            setRound(parsed);
            const sc = localStorage.getItem('pp_scores_' + parsed.id);
            const pt = localStorage.getItem('pp_putts_' + parsed.id);
            const wd = localStorage.getItem('pp_wolf_' + parsed.id);
            const pf = localStorage.getItem('pp_pop_' + parsed.id);
            setScores(sc ? JSON.parse(sc) : {});
            setPutts(pt ? JSON.parse(pt) : {});
            setWolfData(wd ? JSON.parse(wd) : {});
            setPopFlags(pf ? JSON.parse(pf) : {});
            setState('loaded');
            return;
          }
        } catch(e) {}
      }
      setErrorMsg(`Round "${syncCode}" not found on this device.`);
      setState('error');
    }
  }, [syncCode]);

  if (state === 'loading') return (
    <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, background:'#0B0F1A'}}>
      <div style={{width:40, height:40, border:'3px solid #1F3354', borderTopColor:'#2DD97A', borderRadius:'50%', animation:'ppSpin 0.8s linear infinite'}}/>
      <div style={{fontFamily:'Barlow Condensed', fontSize:14, letterSpacing:2, color:'#7A9EBF'}}>LOADING ROUND…</div>
      <style>{`@keyframes ppSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (state === 'error') return (
    <div style={{flex:1, display:'flex', flexDirection:'column', background:'#0B0F1A'}}>
      <div style={{padding:'24px 20px', display:'flex', flexDirection:'column', gap:16, alignItems:'center'}}>
        <div style={{fontSize:36}}>⚠️</div>
        <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:20, color:'#fff', textAlign:'center'}}>{errorMsg}</div>
        <Btn onClick={onBack} variant="ghost" style={{minWidth:180}}>← BACK TO HOME</Btn>
      </div>
    </div>
  );

  const nassauFmt = round?.formats?.find(f => f.type === 'nassau');
  const nassauMatches = nassauFmt?.nassauMatches || [];

  return (
    <div style={{flex:1, overflowY:'auto', background:'#0B0F1A'}}>
      <div style={{padding:'16px', borderBottom:'1px solid #1F3354', display:'flex', alignItems:'center', gap:12}}>
        <button onClick={onBack}
          style={{background:'#112240', border:'1px solid #1F3354', borderRadius:9, color:'#9BB4D4', width:36, height:36, cursor:'pointer', fontFamily:'Barlow Condensed', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor:'transparent'}}>
          ‹
        </button>
        <div>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, letterSpacing:3, color:'#7A9EBF'}}>ROUND VIEWER</div>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:18, color:'#fff', marginTop:1}}>{round.course?.name}</div>
        </div>
        <div style={{marginLeft:'auto', background:'rgba(122,158,191,0.06)', border:'1px solid rgba(122,158,191,0.15)', borderRadius:6, padding:'4px 12px', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:9, letterSpacing:1.5, color:'#3A5880'}}>
          {syncCode}
        </div>
      </div>

      <SummaryScreen
        round={round}
        scores={scores}
        wolfData={wolfData}
        putts={putts}
        nassauPresses={[]}
        manualChips={{}}
        popFlags={popFlags}
        onNewRound={onBack}
        readOnly={true}
      />
    </div>
  );
};

Object.assign(window, { RoundViewer });
