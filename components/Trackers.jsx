// Trackers.jsx — updated design system

const RoundTracker = ({ players, scores, course, holeIdx }) => {
  const { totalScore, totalVsPar } = window;
  return (
    <div style={trS.section}>
      <div style={trS.head}><span style={{fontSize:14}}>📊</span><Label>ROUND TRACKER</Label></div>
      <div style={trS.row}>
        {players.map(p => {
          const gross = totalScore(scores, p.id);
          const vs    = totalVsPar(scores, p.id, course.holes);
          const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;
          const vsColor = vs < 0 ? '#15803D' : vs > 0 ? '#DC2626' : '#6B7280';
          return (
            <div key={p.id} style={trS.card}>
              <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:5}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:26, color:'#0E2B20', lineHeight:1}}>
                {holesPlayed === 0 ? '—' : gross}
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:vsColor, marginTop:2}}>
                {holesPlayed === 0 ? '—' : (vs === 0 ? 'E' : vs > 0 ? `+${vs}` : String(vs))}
                {holesPlayed > 0 && <span style={{color:'#8A9E8A', marginLeft:4}}>{holesPlayed}H</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const WolfTracker = ({ players, scores, wolfData, course, holeIdx, onSetPartner, onLoneWolf, onResetWolf, format }) => {
  const { getWolfForHole, calcWolfStandings, resolveWolfHole } = window;
  const stake      = format?.stakes || 1;
  const wolfPlayer = getWolfForHole(players, holeIdx);
  const wd         = wolfData[holeIdx] || { wolfId:wolfPlayer.id, partnerId:null, confirmed:false, lone:false };
  const standings  = calcWolfStandings(scores, wolfData, players, course);
  const ranked     = [...players].sort((a,b) => (standings[b.id]||0) - (standings[a.id]||0));

  const holeResult = React.useMemo(() => {
    if (!wd.confirmed) return null;
    return resolveWolfHole(scores, holeIdx, wd.wolfId, wd.partnerId, !!wd.lone, players);
  }, [wd.confirmed, JSON.stringify(scores), holeIdx]);

  const maxPts = Math.max(...players.map(p => standings[p.id]||0));
  const leaders = players.filter(p => (standings[p.id]||0) === maxPts && maxPts > 0);
  const soleLeader = leaders.length === 1 ? leaders[0] : null;

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>🐺</span><Label>WOLF</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>${stake} ROUND POT</span>
      </div>

      <div style={trS.row}>
        {ranked.map(p => {
          const pts      = standings[p.id] || 0;
          const isWolf   = wolfPlayer.id === p.id;
          const isLeader = soleLeader?.id === p.id;
          return (
            <div key={p.id} style={{...trS.card,
              border: isWolf?'1px solid rgba(220,38,38,0.35)': isLeader?'1px solid rgba(200,161,90,0.4)':'1px solid #E7E3D9',
              background: isWolf?'rgba(220,38,38,0.03)': isLeader?'rgba(200,161,90,0.04)':'#F6F4EE'}}>
              <div style={{display:'flex', alignItems:'center', gap:4, marginBottom:5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:isWolf?'#DC2626':'#0E2B20', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:24, color:pts>0?'#15803D':pts<0?'#DC2626':'#6B7280', lineHeight:1}}>
                {pts>0?`+${pts}`:pts}
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, color:'#8A9E8A', marginTop:2}}>pts</div>
              {isWolf   && <div style={{fontSize:8, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, color:'#DC2626', letterSpacing:0.5, marginTop:2}}>🐺 WOLF</div>}
              {isLeader && <div style={{fontSize:8, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, color:'#C8A15A', marginTop:2}}>★ LEAD</div>}
            </div>
          );
        })}
      </div>

      {soleLeader && (
        <div style={{fontSize:11, color:'#C8A15A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, background:'rgba(200,161,90,0.06)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:8, padding:'5px 10px'}}>
          {soleLeader.name.split(' ')[0]} LEADS — wins ${stake} from each player (${stake*(players.length-1)} total) if held
        </div>
      )}

      <div style={trS.wolfBox}>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13, color:'#DC2626', marginBottom:8}}>
          🐺 {wolfPlayer.name.toUpperCase()} IS WOLF — HOLE {holeIdx+1}
        </div>

        {!wd.confirmed ? (
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
              <button key={p.id} onClick={()=>onSetPartner(p.id)}
                style={{flex:1, minWidth:80, padding:'10px 8px', borderRadius:10,
                  border:`1px solid ${p.color}44`, background:`${p.color}0A`,
                  color:p.color, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700,
                  fontSize:13, cursor:'pointer', letterSpacing:0.3,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:5}}>
                <div style={{width:16,height:16,borderRadius:'50%',background:`${p.color}22`,border:`1px solid ${p.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800}}>{p.initials}</div>
                {p.name.split(' ')[0].toUpperCase()}
              </button>
            ))}
            <button onClick={onLoneWolf}
              style={{flex:1, minWidth:80, padding:'10px 8px', borderRadius:10,
                border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.06)',
                color:'#DC2626', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800,
                fontSize:13, cursor:'pointer', letterSpacing:0.3}}>
              🐺 LONE WOLF
            </button>
          </div>
        ) : (
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span style={{fontSize:12, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', flex:1}}>
              {wd.lone ? `★ Lone Wolf — wolf score ×2 vs 2 lowest others` : `Partnered with ${players.find(p=>p.id===wd.partnerId)?.name.split(' ')[0]}`}
            </span>
            {holeResult && (
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, padding:'3px 9px', borderRadius:6,
                color: holeResult.wolfWins?'#15803D':holeResult.tied?'#6B7280':'#DC2626',
                background: holeResult.wolfWins?'rgba(21,128,61,0.06)':holeResult.tied?'rgba(107,114,128,0.06)':'rgba(220,38,38,0.06)',
                border:`1px solid ${holeResult.wolfWins?'rgba(21,128,61,0.2)':holeResult.tied?'rgba(107,114,128,0.2)':'rgba(220,38,38,0.2)'}`}}>
                {holeResult.wolfWins?'WOLF WINS':holeResult.tied?'TIED':'WOLF LOSES'}
              </span>
            )}
            <button onClick={onResetWolf} style={{fontSize:11, color:'#8A9E8A', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', whiteSpace:'nowrap'}}>change</button>
          </div>
        )}
      </div>
    </div>
  );
};

const PTMTracker = ({ players, scores, putts, course, holeIdx, ptmInitialHolder, format }) => {
  const { computePTMState, checkPTMPass, checkPTMWin18, ptmNextPlayer } = window;
  const stake = format?.stakes || 5;

  const { holderId: currentHolder, log, holderAtStart } = React.useMemo(() =>
    computePTMState(scores, putts, players, course, ptmInitialHolder),
    [JSON.stringify(scores), JSON.stringify(putts)]
  );

  const isHole18 = holeIdx === 17;
  const displayHolderId = isHole18 ? currentHolder : (holderAtStart?.[holeIdx] ?? currentHolder);
  const holder   = players.find(p => p.id === displayHolderId) || players[0];
  const par      = course.holes[holeIdx]?.par;
  const hole18Passes = log.filter(l => l.holeIdx === 17).length;
  const curScore = scores[displayHolderId]?.[holeIdx];
  const curPutts = (putts[displayHolderId]?.[holeIdx]) || 0;

  let preview = null;
  if (curScore && par) {
    const passes = checkPTMPass(curScore, par, curPutts);
    if (isHole18) {
      const wins = checkPTMWin18(curScore, par, curPutts);
      if (wins) {
        preview = { outcome:'win', label:`${holder.name.split(' ')[0].toUpperCase()} WINS THE POT`, detail:`Bogey or better · ≤2 putts`, color:'#15803D', icon:'🏆' };
      } else if (passes) {
        const nextP = ptmNextPlayer(players, displayHolderId);
        const final = hole18Passes >= 3;
        const toName = final ? (players.find(p=>p.id===log.find(l=>l.holeIdx===17)?.fromId)?.name||holder.name) : nextP.name;
        preview = { outcome:'pass', label:final?`RETURNS TO ${toName.split(' ')[0].toUpperCase()}`:`PASS TO ${nextP.name.split(' ')[0].toUpperCase()}`, detail:curScore>=par+2?`Double bogey (${curScore})`:'3-putt or worse', color:'#DC2626', icon:'➡️' };
      }
    } else {
      if (!passes) {
        preview = { outcome:'keep', label:`${holder.name.split(' ')[0].toUpperCase()} KEEPS THE MONEY`, detail:`Bogey or better · ≤2 putts`, color:'#15803D', icon:'✅' };
      } else {
        const nextP = ptmNextPlayer(players, displayHolderId);
        preview = { outcome:'pass', label:`PASS TO ${nextP.name.split(' ')[0].toUpperCase()}`, detail:curScore>=par+2?`Double bogey (${curScore})`:'3-putt or worse', color:'#DC2626', icon:'➡️' };
      }
    }
  }

  const recentLog = log.slice(-5).reverse();

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>💸</span><Label>PASS THE MONEY</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>${stake} POT</span>
      </div>

      <div style={{background:'rgba(200,161,90,0.06)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14}}>
        <div style={{fontSize:26}}>💰</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, fontWeight:700, letterSpacing:2, color:'#C8A15A', marginBottom:2}}>
            {isHole18 ? 'HOLDS THE MONEY — HOLE 18' : 'HOLDS THE MONEY'}
          </div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:20, color:'#0E2B20', letterSpacing:0.5}}>{holder.name.toUpperCase()}</div>
          {isHole18 && (
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color: hole18Passes >= 3 ? '#DC2626' : '#3F5F4A', marginTop:2}}>
              {hole18Passes}/3 passes used on H18{hole18Passes >= 3 ? ' — final chance' : ''}
            </div>
          )}
        </div>
        <Avatar player={holder} size={38}/>
      </div>

      {preview && (
        <div style={{borderRadius:12, padding:'10px 12px', display:'flex', alignItems:'center', gap:10,
          background: preview.outcome==='win'?'rgba(200,161,90,0.06)':preview.outcome==='keep'?'rgba(21,128,61,0.05)':'rgba(220,38,38,0.04)',
          border:`1px solid ${preview.outcome==='win'?'rgba(200,161,90,0.25)':preview.outcome==='keep'?'rgba(21,128,61,0.2)':'rgba(220,38,38,0.2)'}`}}>
          <span style={{fontSize:15}}>{preview.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:preview.color}}>{preview.label}</div>
            <div style={{fontSize:11, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', marginTop:1}}>{preview.detail}</div>
          </div>
        </div>
      )}

      <div style={{display:'flex', gap:8}}>
        <div style={{flex:1, background:'rgba(220,38,38,0.04)', border:'1px solid rgba(220,38,38,0.12)', borderRadius:10, padding:'8px 10px'}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, color:'#DC2626', letterSpacing:1, marginBottom:3}}>PASS</div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>Double bogey or worse</div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>3-putt or worse</div>
        </div>
        <div style={{flex:1, background:'rgba(21,128,61,0.04)', border:'1px solid rgba(21,128,61,0.12)', borderRadius:10, padding:'8px 10px'}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, color:isHole18?'#C8A15A':'#15803D', letterSpacing:1, marginBottom:3}}>{isHole18?'WIN':'KEEP'}</div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>Bogey or better</div>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>2 putts or fewer</div>
        </div>
      </div>

      {recentLog.length > 0 && (
        <div>
          <Label style={{marginBottom:6, display:'block'}}>PASS HISTORY</Label>
          <div style={{display:'flex', flexDirection:'column', gap:4}}>
            {recentLog.map((e, i) => {
              const from = players.find(p => p.id === e.fromId);
              const to   = players.find(p => p.id === e.toId);
              return from && to ? (
                <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A', minWidth:22}}>H{e.holeIdx+1}</span>
                  <span style={{color:from.color, fontWeight:600}}>{from.name.split(' ')[0]}</span>
                  <span>→</span>
                  <span style={{color:to.color, fontWeight:600}}>{to.name.split(' ')[0]}</span>
                  <span style={{marginLeft:'auto', fontSize:10, color:e.final?'#DC2626':'#8A9E8A'}}>{e.final ? '↩ RETURNED' : e.reason}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const NassauTracker = ({ players, scores, popFlags, course, holeIdx, format, nassauConfig }) => {
  const { nassauSegmentStatus } = window;
  const stake = format?.stakes || 5;
  const front = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i),   holeIdx, popFlags, nassauConfig);
  const back  = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i+9), holeIdx, popFlags, nassauConfig);
  const full  = nassauSegmentStatus(scores, players, course, Array.from({length:18},(_,i)=>i),  holeIdx, popFlags, nassauConfig);
  const statusColor = s => s === 'EVEN' ? '#6B7280' : '#C8A15A';
  const nassauPlayers = (nassauConfig?.playersInMatch||[]).map(id=>players.find(p=>p.id===id)).filter(Boolean);
  const popThisHole  = nassauPlayers.filter(p=>!!(nassauConfig?.popHoles?.[p.id]?.[holeIdx]));

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>💰</span><Label>NASSAU</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>${stake}·${stake}·${stake*2}</span>
      </div>
      {nassauPlayers.length >= 2 && (
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <Label style={{fontSize:9, color:'#8A9E8A'}}>MATCH</Label>
          {nassauPlayers.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#8A9E8A'}}>vs</span>}
              <div style={{display:'flex', alignItems:'center', gap:4}}>
                <div style={{width:5, height:5, borderRadius:'50%', background:p.color}}/>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20'}}>{p.name.split(' ')[0]}</span>
              </div>
            </React.Fragment>
          ))}
          {popThisHole.length > 0 && (
            <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:4, background:'rgba(200,161,90,0.08)', border:'1px solid rgba(200,161,90,0.25)', borderRadius:5, padding:'1px 6px'}}>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#C8A15A', letterSpacing:0.5}}>💰 {popThisHole.map(p=>p.name.split(' ')[0]).join(', ')} +1</span>
            </div>
          )}
        </div>
      )}
      <div style={{display:'flex', gap:8}}>
        {[['FRONT 9', front, stake], ['BACK 9', back, stake], ['18 HOLES', full, stake*2]].map(([lbl, status, betStake]) => (
          <div key={lbl} style={{flex:1, background:'#F6F4EE', borderRadius:12, padding:'10px 12px', border:'1px solid #E7E3D9'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
              <Label style={{fontSize:9, color:'#8A9E8A'}}>{lbl}</Label>
              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#8A9E8A'}}>${betStake}</span>
            </div>
            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:statusColor(status)}}>{status}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MULTI_NASSAU_MATCH_COLORS = ['#C8A15A', '#7B9FE0', '#E07BE0'];

const MultiNassauTracker = ({ players, scores, nassauMatches, course, holeIdx, nassauFmt }) => {
  const { nassauSegmentStatus } = window;
  const [expandedMatch, setExpandedMatch] = React.useState(null);
  if (!nassauMatches || nassauMatches.length === 0) return null;

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>💰</span><Label>NASSAU</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>
          {nassauMatches.length} MATCH{nassauMatches.length > 1 ? 'ES' : ''}
        </span>
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {nassauMatches.map((match, idx) => {
          const matchColor = MULTI_NASSAU_MATCH_COLORS[idx] || '#C8A15A';
          const stake      = match.stakes || nassauFmt?.stakes || 5;
          const matchCfg   = { playersInMatch:match.playersInMatch, matchType:match.matchType, teams:match.teams||null, popHoles:match.popHoles||{} };
          const nassauPlayers = (match.playersInMatch||[]).map(id=>players.find(p=>p.id===id)).filter(Boolean);
          if (nassauPlayers.length < 2) return null;

          const is2v2 = match.matchType === '2v2' && match.teams;
          const teamNames = (ids) => (ids||[]).map(id=>players.find(p=>p.id===id)?.name.split(' ')[0]).filter(Boolean).join(' & ');
          const p1 = nassauPlayers[0];
          const p2 = nassauPlayers[1];
          const shortStatus = (status) => {
            if (status === 'EVEN') return 'AS';
            if (is2v2) return status.replace('Team 1', 'T1').replace('Team 2', 'T2');
            return status.replace(p1.name.split(' ')[0], p1.initials).replace(p2.name.split(' ')[0], p2.initials);
          };
          const front  = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i),    holeIdx, {}, matchCfg);
          const back   = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i+9),  holeIdx, {}, matchCfg);
          const full   = nassauSegmentStatus(scores, players, course, Array.from({length:18},(_,i)=>i),   holeIdx, {}, matchCfg);
          const statusColor = s => s === 'EVEN' ? '#6B7280' : matchColor;
          const popThisHole = nassauPlayers.filter(p => !!(match.popHoles?.[p.id]?.[holeIdx]));
          const isExpanded  = expandedMatch === match.id;

          return (
            <div key={match.id} style={{background:'#FFFFFF', border:`1px solid ${matchColor}30`, borderRadius:14, overflow:'hidden'}}>
              <div onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                style={{display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:`${matchColor}08`, cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:7, height:7, borderRadius:'50%', background:matchColor, flexShrink:0}}/>
                <div style={{flex:1, display:'flex', alignItems:'center', gap:6, minWidth:0}}>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, color:matchColor, letterSpacing:1, whiteSpace:'nowrap'}}>MATCH {idx+1}</span>
                  {is2v2 ? (
                    <div style={{display:'flex', alignItems:'center', gap:4, minWidth:0}}>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#0E2B20', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{teamNames(match.teams.team1)}</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A'}}>vs</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#0E2B20', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{teamNames(match.teams.team2)}</span>
                    </div>
                  ) : (
                  <div style={{display:'flex', alignItems:'center', gap:4, minWidth:0}}>
                    <div style={{width:5, height:5, borderRadius:'50%', background:p1.color, flexShrink:0}}/>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', whiteSpace:'nowrap'}}>{p1.name.split(' ')[0]}</span>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A'}}>vs</span>
                    <div style={{width:5, height:5, borderRadius:'50%', background:p2.color, flexShrink:0}}/>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#0E2B20', whiteSpace:'nowrap'}}>{p2.name.split(' ')[0]}</span>
                  </div>
                  )}
                  {popThisHole.length > 0 && (
                    <div style={{background:'rgba(200,161,90,0.08)', border:'1px solid rgba(200,161,90,0.25)', borderRadius:4, padding:'1px 5px', flexShrink:0}}>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#C8A15A'}}>💰 {popThisHole.map(p=>p.name.split(' ')[0]).join(',')} +1</span>
                    </div>
                  )}
                </div>
                <div style={{display:'flex', gap:5, flexShrink:0}}>
                  {[['F', front], ['B', back], ['18', full]].map(([lbl, status]) => (
                    <div key={lbl} style={{display:'flex', flexDirection:'column', alignItems:'center', background:'#F0EDE4', borderRadius:6, padding:'3px 6px', minWidth:30}}>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:8, color:'#8A9E8A', letterSpacing:0.5}}>{lbl}</span>
                      <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:10, color:statusColor(status), whiteSpace:'nowrap'}}>
                        {shortStatus(status)}
                      </span>
                    </div>
                  ))}
                </div>
                <span style={{fontSize:12, color:'#8A9E8A', display:'inline-block', transform:isExpanded?'rotate(180deg)':'none', transition:'transform 0.2s', flexShrink:0}}>▾</span>
              </div>

              {isExpanded && (
                <div style={{padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, borderTop:`1px solid ${matchColor}18`}}>
                  <div style={{display:'flex', gap:8}}>
                    {[['FRONT 9', front, stake], ['BACK 9', back, stake], ['18 HOLES', full, stake*2]].map(([lbl, status, betStake]) => (
                      <div key={lbl} style={{flex:1, background:'#F6F4EE', borderRadius:10, padding:'10px 12px', border:'1px solid #E7E3D9'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                          <Label style={{fontSize:9, color:'#8A9E8A'}}>{lbl}</Label>
                          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#8A9E8A'}}>${betStake}</span>
                        </div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:statusColor(status)}}>{status}</div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const allPopHoles = {};
                    nassauPlayers.forEach(p => {
                      const pops = (match.popHoles?.[p.id]||[]);
                      const holeNums = pops.map((v,i)=>v?i+1:null).filter(Boolean);
                      if (holeNums.length > 0) allPopHoles[p.name.split(' ')[0]] = holeNums;
                    });
                    const entries = Object.entries(allPopHoles);
                    if (entries.length === 0) return null;
                    return (
                      <div style={{background:'rgba(200,161,90,0.04)', border:'1px solid rgba(200,161,90,0.15)', borderRadius:8, padding:'8px 10px'}}>
                        <Label style={{fontSize:9, color:'#C8A15A', display:'block', marginBottom:4}}>STROKE POPS</Label>
                        {entries.map(([name, holes]) => (
                          <div key={name} style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
                            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#0E2B20', minWidth:50}}>{name}</span>
                            <div style={{display:'flex', gap:3, flexWrap:'wrap'}}>
                              {holes.map(h => (
                                <span key={h} style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:10, color:h-1===holeIdx?'#F6F4EE':'#C8A15A', background:h-1===holeIdx?matchColor:'rgba(200,161,90,0.12)', border:`1px solid ${matchColor}44`, borderRadius:4, padding:'1px 5px'}}>H{h}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const trS = {
  section: { padding:'12px 14px', borderTop:'1px solid #E7E3D9', display:'flex', flexDirection:'column', gap:10, background:'#FFFFFF' },
  head:    { display:'flex', alignItems:'center', gap:8 },
  row:     { display:'flex', gap:8 },
  card:    { flex:1, background:'#F6F4EE', border:'1px solid #E7E3D9', borderRadius:12, padding:'10px 10px 8px', display:'flex', flexDirection:'column', minWidth:0 },
  wolfBox: { background:'rgba(220,38,38,0.03)', border:'1px solid rgba(220,38,38,0.15)', borderRadius:12, padding:'12px' },
};

// ─── BINGO BANGO BONGO TRACKER ───────────────────────────────────────────────
const BBBTracker = ({ players, course, holeIdx, bbbData, format }) => {
  const stake      = format?.stakes || 2;
  const holeEntry  = bbbData?.[holeIdx] || { bingo:null, bango:null, bongo:null };
  const standings  = window.calcBBBStandings(bbbData || {}, players);
  const ranked     = [...players].sort((a,b) => (standings[b.id]?.total||0) - (standings[a.id]?.total||0));
  const holeHasAny = holeEntry.bingo || holeEntry.bango || holeEntry.bongo;

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>🎯</span><Label>BINGO BANGO BONGO</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
          fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>${stake} ROUND POT</span>
      </div>

      <div style={trS.row}>
        {ranked.map(p => {
          const st = standings[p.id] || {bingo:0,bango:0,bongo:0,total:0};
          return (
            <div key={p.id} style={{...trS.card}}>
              <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:12,color:'#0E2B20',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:900,fontSize:22,color:st.total>0?'#15803D':'#6B7280',lineHeight:1}}>{st.total}</div>
              <div style={{fontSize:10,color:'#8A9E8A',marginTop:3,fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>B{st.bingo} B{st.bango} B{st.bongo}</div>
            </div>
          );
        })}
      </div>

      {holeHasAny && (
        <div style={{background:'rgba(200,161,90,0.06)',border:'1px solid rgba(200,161,90,0.2)',borderRadius:10,padding:'10px 12px'}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:11,color:'#C8A15A',letterSpacing:1,marginBottom:6}}>HOLE {holeIdx+1}</div>
          {[['bingo','①','First on Green'],['bango','②','Closest to Pin'],['bongo','③','First to Hole Out']].map(([cat, icon, label]) => {
            const winner = holeEntry[cat] ? players.find(p => p.id === holeEntry[cat]) : null;
            if (!winner) return null;
            return (
              <div key={cat} style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:14,color:'#C8A15A'}}>{icon}</span>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontSize:11,color:'#3F5F4A'}}>{label}</span>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:11,color:'#0E2B20',marginLeft:'auto'}}>{winner.name.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      )}

      {!holeHasAny && (
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontSize:11,color:'#8A9E8A',textAlign:'center',padding:'4px 0'}}>
          Tap the 🎯 BBB pill on a player card to award points for this hole.
        </div>
      )}
    </div>
  );
};

// ─── TEE BALL TRACKER ────────────────────────────────────────────────────────
const TeeBallTracker = ({ players, course, holeIdx, teeBallData, onSetTeeBall, format }) => {
  const stake      = format?.stakes || 2;
  const holeEntry  = teeBallData?.[holeIdx] || { winner:null, confirmed:false };
  const standings  = window.calcTeeBallStandings(teeBallData || {}, players);
  const ranked     = [...players].sort((a,b) => (standings[b.id]||0) - (standings[a.id]||0));
  const winnerPlayer = holeEntry.winner ? players.find(p => p.id === holeEntry.winner) : null;

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>🏌️</span><Label>TEE BALL</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',
          fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>${stake} ROUND POT</span>
      </div>

      <div style={trS.row}>
        {ranked.map(p => {
          const pts = standings[p.id] || 0;
          return (
            <div key={p.id} style={{...trS.card}}>
              <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:12,color:'#0E2B20',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:900,fontSize:24,color:pts>0?'#C8A15A':'#6B7280',lineHeight:1}}>{pts}</div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontSize:9,color:'#8A9E8A',marginTop:2}}>pts</div>
            </div>
          );
        })}
      </div>

      {!holeEntry.confirmed ? (
        <div style={{background:'#F6F4EE',border:'1px solid #E7E3D9',borderRadius:14,padding:'12px'}}>
          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:800,fontSize:13,color:'#0E2B20',marginBottom:8}}>
            HOLE {holeIdx+1} — LONGEST TEE SHOT IN PLAY
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
            {players.map(p => (
              <button key={p.id} onClick={() => onSetTeeBall(holeIdx, holeEntry.winner===p.id ? null : p.id, false)}
                style={{flex:1, minWidth:70, padding:'10px 6px', borderRadius:10,
                  border: holeEntry.winner===p.id ? `2px solid ${p.color}` : `1px solid ${p.color}44`,
                  background: holeEntry.winner===p.id ? `${p.color}18` : `${p.color}08`,
                  color: holeEntry.winner===p.id ? p.color : '#3F5F4A',
                  fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700,
                  fontSize:12, cursor:'pointer'}}>
                {p.name.split(' ')[0]}
              </button>
            ))}
            <button onClick={() => onSetTeeBall(holeIdx, null, false)}
              style={{padding:'10px 10px', borderRadius:10, border:'1px solid rgba(107,114,128,0.3)',
                background:'rgba(107,114,128,0.06)', color:'#6B7280',
                fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700,
                fontSize:12, cursor:'pointer'}}>
              TIE / ALL OB
            </button>
          </div>
          <button onClick={() => onSetTeeBall(holeIdx, holeEntry.winner, true)}
            style={{width:'100%',padding:'10px',borderRadius:10,border:'none',
              background:'#0E2B20',color:'#F6F4EE',
              fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontWeight:700,fontSize:13,cursor:'pointer'}}>
            CONFIRM HOLE {holeIdx+1}
          </button>
        </div>
      ) : (
        <div style={{background:'rgba(200,161,90,0.06)',border:'1px solid rgba(200,161,90,0.2)',borderRadius:10,
          padding:'10px 12px',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:14}}>{winnerPlayer ? '🏆' : '🤝'}</span>
          <div style={{flex:1,fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif',fontSize:12,
            color:winnerPlayer?'#C8A15A':'#6B7280',fontWeight:700}}>
            {winnerPlayer ? `${winnerPlayer.name.split(' ')[0]} wins tee ball` : 'Tie — no point'}
          </div>
          <button onClick={() => onSetTeeBall(holeIdx, holeEntry.winner, false)}
            style={{fontSize:11,color:'#8A9E8A',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>edit</button>
        </div>
      )}
    </div>
  );
};

// ─── MARKEY MATCH TRACKER ────────────────────────────────────────────────────
const MarkeyMatchTracker = ({ players, scores, format, holeIdx }) => {
  const cfg = format?.markeyMatchConfig;
  if (!cfg || !cfg.team1 || !cfg.team2) return null;

  const matchStates = React.useMemo(() =>
    window.calcMarkeyMatchState(scores, cfg.markeyPopStrokes, players, format),
  [JSON.stringify(scores)]);

  const [expandedMatch, setExpandedMatch] = React.useState(null);

  // Play order so press timing / "starts next hole" respects the starting tee.
  const startingTee = (cfg.startingTee || format.startingTee) === 10 ? 10 : 1;
  const playOrder = window.getPlayOrder(startingTee);
  const seqPos = playOrder.indexOf(holeIdx);
  const nextHoleIdx = seqPos >= 0 && seqPos < 17 ? playOrder[seqPos + 1] : null;

  const playerById = (id) => players.find(p => p.id === id);
  const team1Names = cfg.team1.map(id => playerById(id)?.name.split(' ')[0] || '').join(' & ');
  const team2Names = cfg.team2.map(id => playerById(id)?.name.split(' ')[0] || '').join(' & ');

  const statusLabel = (m) => {
    if (m.team1Holes === m.team2Holes) return 'A.S.';
    const diff = Math.abs(m.team1Holes - m.team2Holes);
    const leadTeam = m.team1Holes > m.team2Holes ? 'A' : 'B';
    return `Team ${leadTeam} +${diff}`;
  };

  const statusColor = (m) => {
    if (m.team1Holes === m.team2Holes) return '#6B7280';
    return '#C8A15A';
  };

  // Which match indices started after a press on the current hole?
  const pressedThisHole = matchStates.filter(m => m.matchId > 1 && m.startSeq === seqPos + 1);

  const popThisHole = [...cfg.team1, ...cfg.team2].filter(id => {
    const strokes = (cfg.markeyPopStrokes?.[id]?.[holeIdx] || 0);
    return strokes > 0;
  }).map(id => ({ player: playerById(id), strokes: cfg.markeyPopStrokes[id][holeIdx] })).filter(x => x.player);

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span style={{fontSize:14}}>⚔️</span><Label>MARKEY MATCH</Label>
        <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A', letterSpacing:0.5}}>
          {matchStates.length} MATCH{matchStates.length !== 1 ? 'ES' : ''}
        </span>
      </div>

      <div style={{background:'rgba(200,161,90,0.04)', border:'1px solid rgba(200,161,90,0.15)', borderRadius:8, padding:'6px 10px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, color:'#C8A15A', letterSpacing:0.5}}>A</span>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#0E2B20', fontWeight:600}}>{team1Names}</span>
        </div>
        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A'}}>vs</span>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:11, color:'#7B9FE0', letterSpacing:0.5}}>B</span>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#0E2B20', fontWeight:600}}>{team2Names}</span>
        </div>
      </div>

      {popThisHole.length > 0 && (
        <div style={{background:'rgba(200,161,90,0.06)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:7, padding:'5px 9px', display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#C8A15A', letterSpacing:1}}>H{holeIdx+1} POPS:</span>
          {popThisHole.map(({ player: p, strokes }) => (
            <span key={p.id} style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, color:'#C8A15A', background:'rgba(200,161,90,0.12)', border:'1px solid rgba(200,161,90,0.3)', borderRadius:4, padding:'1px 5px'}}>
              {p.name.split(' ')[0]} +{strokes}
            </span>
          ))}
        </div>
      )}

      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {matchStates.map((match, idx) => {
          const matchColor = MULTI_NASSAU_MATCH_COLORS[idx % MULTI_NASSAU_MATCH_COLORS.length] || '#C8A15A';
          const isExpanded = expandedMatch === match.matchId;
          const label = statusLabel(match);
          const labelColor = statusColor(match);
          const activeHoles = match.holeResults.filter(r => r !== null).length;

          return (
            <div key={match.matchId} style={{background:'#FFFFFF', border:`1px solid ${matchColor}30`, borderRadius:14, overflow:'hidden'}}>
              <div onClick={() => setExpandedMatch(isExpanded ? null : match.matchId)}
                style={{display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:`${matchColor}08`, cursor:'pointer', WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:7, height:7, borderRadius:'50%', background:matchColor, flexShrink:0}}/>
                <div style={{flex:1, display:'flex', alignItems:'center', gap:6, minWidth:0}}>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, color:matchColor, letterSpacing:1, whiteSpace:'nowrap'}}>
                    MATCH {match.matchId}
                  </span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A', whiteSpace:'nowrap'}}>
                    H{match.startHole + 1}–{(match.endHole ?? 17) + 1}
                  </span>
                  {match.matchId > 1 && (
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#E07BE0', background:'rgba(224,123,224,0.1)', border:'1px solid rgba(224,123,224,0.25)', borderRadius:4, padding:'1px 5px', whiteSpace:'nowrap'}}>{match.isTurnPress ? 'TURN' : 'PRESS'}</span>
                  )}
                </div>
                <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:13, color:labelColor, whiteSpace:'nowrap'}}>
                    {label}
                  </span>
                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, color:'#8A9E8A'}}>
                    {match.team1Holes}–{match.team2Holes} ({activeHoles} holes)
                  </span>
                </div>
                <span style={{fontSize:12, color:'#8A9E8A', display:'inline-block', transform:isExpanded?'rotate(180deg)':'none', transition:'transform 0.2s', flexShrink:0, marginLeft:4}}>▾</span>
              </div>

              {isExpanded && (
                <div style={{padding:'10px 12px', borderTop:`1px solid ${matchColor}18`}}>
                  <div style={{display:'flex', gap:6, marginBottom:8}}>
                    {[['Team A', match.team1Holes, '#C8A15A'], ['Team B', match.team2Holes, '#7B9FE0']].map(([lbl, holes, color]) => (
                      <div key={lbl} style={{flex:1, background:'#F6F4EE', borderRadius:10, padding:'8px 10px', border:'1px solid #E7E3D9', textAlign:'center'}}>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:9, letterSpacing:1, color:'#8A9E8A', marginBottom:2}}>{lbl}</div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color, lineHeight:1}}>{holes}</div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, color:'#8A9E8A'}}>holes won</div>
                      </div>
                    ))}
                    <div style={{flex:1, background:'#F6F4EE', borderRadius:10, padding:'8px 10px', border:'1px solid #E7E3D9', textAlign:'center'}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:9, letterSpacing:1, color:'#8A9E8A', marginBottom:2}}>STAKE</div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:18, color:matchColor, lineHeight:1}}>${cfg.stake}</div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, color:'#8A9E8A'}}>per match</div>
                    </div>
                  </div>
                  <div style={{display:'flex', gap:2, flexWrap:'wrap'}}>
                    {playOrder.map((i) => {
                      const r = match.holeResults[i];
                      if (r === null) return null;
                      const bg = r === 'team1' ? '#C8A15A' : r === 'team2' ? '#7B9FE0' : '#E7E3D9';
                      const textColor = r === 'tie' ? '#8A9E8A' : '#FFFFFF';
                      const lbl = r === 'team1' ? 'A' : r === 'team2' ? 'B' : '–';
                      return (
                        <div key={i} style={{width:22, height:22, borderRadius:5, background:i===holeIdx?bg+'EE':bg+'88', display:'flex', alignItems:'center', justifyContent:'center', border:i===holeIdx?`2px solid ${bg}`:'none'}}>
                          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:9, color:i===holeIdx?'#0E2B20':textColor}}>{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pressedThisHole.length > 0 && (
        <div style={{background:'rgba(224,123,224,0.06)', border:'1px solid rgba(224,123,224,0.25)', borderRadius:8, padding:'6px 10px', display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontSize:12}}>🔔</span>
          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#E07BE0'}}>
            {pressedThisHole.some(m => m.isTurnPress) ? 'TURN' : 'PRESS'} — Match {pressedThisHole.map(m => m.matchId).join(', ')} start{pressedThisHole.length === 1 ? 's' : ''} H{(nextHoleIdx ?? holeIdx) + 1}
          </span>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { RoundTracker, WolfTracker, PTMTracker, NassauTracker, MultiNassauTracker, BBBTracker, TeeBallTracker, MarkeyMatchTracker });
