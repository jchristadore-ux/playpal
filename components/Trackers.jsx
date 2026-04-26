// Trackers.jsx v4 — RoundTracker shows gross strokes; Wolf leader only when sole leader

// ─── ROUND TRACKER ───────────────────────────────────────────────────────────
const RoundTracker = ({ players, scores, course, holeIdx }) => {
  const { totalScore, totalVsPar } = window;
  return (
    <div style={trS.section}>
      <div style={trS.head}><span>📊</span><Label>ROUND TRACKER</Label></div>
      <div style={trS.row}>
        {players.map(p => {
          const gross = totalScore(scores, p.id);
          const vs    = totalVsPar(scores, p.id, course.holes);
          const holesPlayed = (scores[p.id]||[]).filter(Boolean).length;
          const vsColor = vs < 0 ? '#3DCB6C' : vs > 0 ? '#E5534B' : '#7A98BC';
          return (
            <div key={p.id} style={trS.card}>
              <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:5}}>
                <div style={{width:7, height:7, borderRadius:'50%', background:p.color}}/>
                <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              {/* Big number = gross strokes */}
              <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:26, color:'#fff', lineHeight:1}}>
                {holesPlayed === 0 ? '—' : gross}
              </div>
              {/* Sub-line = score to par + holes played */}
              <div style={{fontFamily:'Barlow Condensed', fontSize:11, color:vsColor, marginTop:2}}>
                {holesPlayed === 0 ? '—' : (vs === 0 ? 'E' : vs > 0 ? `+${vs}` : String(vs))}
                {holesPlayed > 0 && <span style={{color:'#4A6890', marginLeft:4}}>{holesPlayed}H</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── WOLF TRACKER ────────────────────────────────────────────────────────────
const WolfTracker = ({ players, scores, wolfData, course, holeIdx, onSetPartner, onLoneWolf, onResetWolf, format }) => {
  const { getWolfForHole, calcWolfStandings, resolveWolfHole } = window;
  const stake      = format?.stakes || 1;
  const wolfPlayer = getWolfForHole(players, holeIdx);
  const wd         = wolfData[holeIdx] || { wolfId:wolfPlayer.id, partnerId:null, confirmed:false, lone:false };
  const standings  = calcWolfStandings(scores, wolfData, players, course);

  const ranked = [...players].sort((a,b) => (standings[b.id]||0) - (standings[a.id]||0));

  const holeResult = React.useMemo(() => {
    if (!wd.confirmed) return null;
    return resolveWolfHole(scores, holeIdx, wd.wolfId, wd.partnerId, !wd.lone, players);
  }, [wd.confirmed, JSON.stringify(scores), holeIdx]);

  const maxPts = Math.max(...players.map(p => standings[p.id]||0));
  // Only declare a sole leader — if tied at top, no "LEADS" banner
  const leaders = players.filter(p => (standings[p.id]||0) === maxPts && maxPts > 0);
  const soleLeader = leaders.length === 1 ? leaders[0] : null;

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span>🐺</span><Label>WOLF</Label>
        <span style={{marginLeft:'auto', fontFamily:'Barlow Condensed', fontSize:11, color:'#7A98BC', letterSpacing:1}}>${stake} ROUND POT</span>
      </div>

      {/* Standings */}
      <div style={trS.row}>
        {ranked.map(p => {
          const pts      = standings[p.id] || 0;
          const isWolf   = wolfPlayer.id === p.id;
          const isLeader = soleLeader?.id === p.id;
          return (
            <div key={p.id} style={{...trS.card,
              border: isWolf?'1px solid #E5534B': isLeader?'1px solid #C9A84C':'1px solid #1E3A6E',
              background: isWolf?'rgba(229,83,75,0.06)': isLeader?'rgba(201,168,76,0.04)':'#162950'}}>
              <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:5}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:p.color}}/>
                <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, color:isWolf?'#E5534B':'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
              </div>
              <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:26, color:pts>0?'#3DCB6C':pts<0?'#E5534B':'#7A98BC', lineHeight:1}}>
                {pts>0?`+${pts}`:pts}
              </div>
              <div style={{fontFamily:'Barlow Condensed', fontSize:10, color:'#4A6890', marginTop:2}}>pts</div>
              {isWolf    && <div style={{fontSize:9, fontFamily:'Barlow Condensed', fontWeight:700, color:'#E5534B', letterSpacing:0.5, marginTop:2}}>🐺 WOLF</div>}
              {isLeader  && <div style={{fontSize:9, fontFamily:'Barlow Condensed', fontWeight:700, color:'#C9A84C', marginTop:2}}>★ LEAD</div>}
            </div>
          );
        })}
      </div>

      {/* Pot summary — only when sole leader */}
      {soleLeader && (
        <div style={{fontSize:11, color:'#C9A84C', fontFamily:'Barlow Condensed', fontWeight:700, background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:7, padding:'5px 10px'}}>
          {soleLeader.name.split(' ')[0]} LEADS — wins ${stake} from each player (${stake*(players.length-1)} total) if held
        </div>
      )}

      {/* This hole action */}
      <div style={trS.wolfBox}>
        <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:13, color:'#E5534B', marginBottom:8}}>
          🐺 {wolfPlayer.name.toUpperCase()} IS WOLF — HOLE {holeIdx+1}
        </div>

        {!wd.confirmed ? (
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {players.filter(p=>p.id!==wolfPlayer.id).map(p=>(
              <button key={p.id} onClick={()=>onSetPartner(p.id)}
                style={{flex:1, minWidth:80, padding:'10px 8px', borderRadius:9,
                  border:`1px solid ${p.color}55`, background:`${p.color}11`,
                  color:p.color, fontFamily:'Barlow Condensed', fontWeight:700,
                  fontSize:13, cursor:'pointer', letterSpacing:0.5,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:5}}>
                <div style={{width:16,height:16,borderRadius:'50%',background:`${p.color}33`,border:`1px solid ${p.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800}}>{p.initials}</div>
                {p.name.split(' ')[0].toUpperCase()}
              </button>
            ))}
            <button onClick={onLoneWolf}
              style={{flex:1, minWidth:80, padding:'10px 8px', borderRadius:9,
                border:'1px solid rgba(229,83,75,0.5)', background:'rgba(229,83,75,0.1)',
                color:'#E5534B', fontFamily:'Barlow Condensed', fontWeight:800,
                fontSize:13, cursor:'pointer', letterSpacing:0.5}}>
              🐺 LONE WOLF
            </button>
          </div>
        ) : (
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span style={{fontSize:12, color:'#9BB4D4', fontFamily:'DM Sans', flex:1}}>
              {wd.lone
                ? `★ Lone Wolf — wolf score ×2 vs 2 lowest others`
                : `Partnered with ${players.find(p=>p.id===wd.partnerId)?.name.split(' ')[0]}`}
            </span>
            {holeResult && (
              <span style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:12, padding:'3px 9px', borderRadius:6,
                color: holeResult.wolfWins?'#3DCB6C':holeResult.tied?'#7A98BC':'#E5534B',
                background: holeResult.wolfWins?'rgba(61,203,108,0.1)':holeResult.tied?'rgba(122,152,188,0.1)':'rgba(229,83,75,0.1)',
                border:`1px solid ${holeResult.wolfWins?'rgba(61,203,108,0.3)':holeResult.tied?'rgba(122,152,188,0.3)':'rgba(229,83,75,0.3)'}`}}>
                {holeResult.wolfWins?'WOLF WINS':holeResult.tied?'TIED':'WOLF LOSES'}
              </span>
            )}
            <button onClick={onResetWolf} style={{fontSize:11, color:'#4A6890', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', whiteSpace:'nowrap'}}>change</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── PASS THE MONEY TRACKER ──────────────────────────────────────────────────
const PTMTracker = ({ players, scores, putts, course, holeIdx, ptmInitialHolder, format }) => {
  const { computePTMState, checkPTMPass, checkPTMWin18, ptmNextPlayer } = window;
  const stake = format?.stakes || 5;

  const { holderId: currentHolder, log } = React.useMemo(() =>
    computePTMState(scores, putts, players, course, ptmInitialHolder),
    [JSON.stringify(scores), JSON.stringify(putts)]
  );

  const holder     = players.find(p => p.id === currentHolder) || players[0];
  const isHole18   = holeIdx === 17;
  const par        = course.holes[holeIdx]?.par;

  const hole18Passes = log.filter(l => l.holeIdx === 17).length;

  const curScore = scores[currentHolder]?.[holeIdx];
  const curPutts = (putts[currentHolder]?.[holeIdx]) || 0;

  let preview = null;
  if (curScore && par) {
    const passes = checkPTMPass(curScore, par, curPutts);
    if (isHole18) {
      const wins = checkPTMWin18(curScore, par, curPutts);
      if (wins) {
        preview = { outcome: 'win', label: `${holder.name.split(' ')[0].toUpperCase()} WINS THE POT`, detail: `Bogey or better · ≤2 putts`, color: '#3DCB6C', icon: '🏆' };
      } else if (passes) {
        const nextP = ptmNextPlayer(players, currentHolder);
        const final = hole18Passes >= 3;
        const toName = final ? (players.find(p => p.id === log.find(l=>l.holeIdx===17)?.fromId)?.name || holder.name) : nextP.name;
        preview = {
          outcome: 'pass',
          label: final ? `RETURNS TO ${toName.split(' ')[0].toUpperCase()}` : `PASS TO ${nextP.name.split(' ')[0].toUpperCase()}`,
          detail: curScore >= par + 2 ? `Double bogey (${curScore})` : '3-putt or worse',
          color: '#E5534B', icon: '➡️'
        };
      }
    } else {
      if (!passes) {
        preview = { outcome: 'keep', label: `${holder.name.split(' ')[0].toUpperCase()} KEEPS THE MONEY`, detail: `Bogey or better · ≤2 putts`, color: '#3DCB6C', icon: '✅' };
      } else {
        const nextP = ptmNextPlayer(players, currentHolder);
        preview = { outcome: 'pass', label: `PASS TO ${nextP.name.split(' ')[0].toUpperCase()}`, detail: curScore >= par + 2 ? `Double bogey (${curScore})` : '3-putt or worse', color: '#E5534B', icon: '➡️' };
      }
    }
  }

  const recentLog = log.slice(-5).reverse();

  return (
    <div style={trS.section}>
      <div style={trS.head}>
        <span>💸</span><Label>PASS THE MONEY</Label>
        <span style={{marginLeft:'auto', fontFamily:'Barlow Condensed', fontSize:11, color:'#7A98BC', letterSpacing:1}}>${stake} POT</span>
      </div>

      <div style={{background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.25)', borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:14}}>
        <div style={{fontSize:28}}>💰</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'Barlow Condensed', fontSize:11, fontWeight:600, letterSpacing:2, color:'#C9A84C', marginBottom:2}}>
            {isHole18 ? 'HOLDS THE MONEY — HOLE 18' : 'HOLDS THE MONEY'}
          </div>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:900, fontSize:22, color:'#fff', letterSpacing:1}}>{holder.name.toUpperCase()}</div>
          {isHole18 && (
            <div style={{fontFamily:'DM Sans', fontSize:11, color: hole18Passes >= 3 ? '#E5534B' : '#7A98BC', marginTop:2}}>
              {hole18Passes}/3 passes used on H18{hole18Passes >= 3 ? ' — final chance' : ''}
            </div>
          )}
        </div>
        <Avatar player={holder} size={40}/>
      </div>

      {preview && (
        <div style={{borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:10,
          background: preview.outcome==='win' ? 'rgba(201,168,76,0.08)' : preview.outcome==='keep' ? 'rgba(61,203,108,0.06)' : 'rgba(229,83,75,0.08)',
          border: `1px solid ${preview.outcome==='win' ? 'rgba(201,168,76,0.3)' : preview.outcome==='keep' ? 'rgba(61,203,108,0.25)' : 'rgba(229,83,75,0.3)'}`}}>
          <span style={{fontSize:16}}>{preview.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:13, color:preview.color}}>{preview.label}</div>
            <div style={{fontSize:11, color:'#7A98BC', fontFamily:'DM Sans', marginTop:1}}>{preview.detail}</div>
          </div>
        </div>
      )}

      <div style={{display:'flex', gap:8}}>
        <div style={{flex:1, background:'rgba(229,83,75,0.06)', border:'1px solid rgba(229,83,75,0.2)', borderRadius:8, padding:'8px 10px'}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, color:'#E5534B', letterSpacing:1, marginBottom:3}}>PASS</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#9BB4D4'}}>Double bogey or worse</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#9BB4D4'}}>3-putt or worse</div>
        </div>
        <div style={{flex:1, background:'rgba(61,203,108,0.04)', border:'1px solid rgba(61,203,108,0.2)', borderRadius:8, padding:'8px 10px'}}>
          <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, color: isHole18 ? '#C9A84C' : '#3DCB6C', letterSpacing:1, marginBottom:3}}>{isHole18 ? 'WIN' : 'KEEP'}</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#9BB4D4'}}>Bogey or better</div>
          <div style={{fontFamily:'DM Sans', fontSize:11, color:'#9BB4D4'}}>2 putts or fewer</div>
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
                <div key={i} style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#7A98BC', fontFamily:'DM Sans'}}>
                  <span style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#4A6890', minWidth:22}}>H{e.holeIdx+1}</span>
                  <span style={{color:from.color, fontWeight:600}}>{from.name.split(' ')[0]}</span>
                  <span>→</span>
                  <span style={{color:to.color, fontWeight:600}}>{to.name.split(' ')[0]}</span>
                  <span style={{marginLeft:'auto', fontSize:10, color:e.final?'#E5534B':'#4A6890'}}>{e.final ? '↩ RETURNED' : e.reason}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── NASSAU TRACKER ──────────────────────────────────────────────────────────
const NassauTracker = ({ players, scores, course, holeIdx, presses, onPress, format }) => {
  const { nassauSegmentStatus } = window;
  const stake = format?.stakes || 5;
  const front = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i),   holeIdx);
  const back  = nassauSegmentStatus(scores, players, course, Array.from({length:9},(_,i)=>i+9), holeIdx);
  const full  = nassauSegmentStatus(scores, players, course, Array.from({length:18},(_,i)=>i),  holeIdx);

  const canPressF9 = holeIdx < 9  && front !== 'EVEN';
  const canPressB9 = holeIdx >= 9 && back  !== 'EVEN';
  const statusColor = s => s==='EVEN' ? '#7A98BC' : '#C9A84C';

  return (
    <div style={trS.section}>
      <div style={trS.head}><span>💰</span><Label>NASSAU</Label>
        <span style={{marginLeft:'auto', fontFamily:'Barlow Condensed', fontSize:11, color:'#7A98BC', letterSpacing:1}}>${stake}/BET</span>
      </div>
      <div style={{display:'flex', gap:8}}>
        {[['FRONT 9',front,canPressF9,'front'],['BACK 9',back,canPressB9,'back'],['18 HOLES',full,false,'full']].map(([lbl,status,canPress,seg])=>(
          <div key={lbl} style={{flex:1, background:'#162950', borderRadius:10, padding:'10px 12px', border:'1px solid #1E3A6E'}}>
            <Label style={{fontSize:9, color:'#4A6890', display:'block', marginBottom:4}}>{lbl}</Label>
            <div style={{fontFamily:'Barlow Condensed', fontWeight:800, fontSize:15, color:statusColor(status)}}>{status}</div>
            {canPress && (
              <button onClick={()=>onPress(seg, holeIdx, stake)}
                style={{marginTop:6, width:'100%', padding:'4px 0', borderRadius:6, border:'1px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.08)', color:'#C9A84C', fontFamily:'Barlow Condensed', fontWeight:700, fontSize:11, cursor:'pointer', letterSpacing:1}}>
                PRESS
              </button>
            )}
          </div>
        ))}
      </div>
      {presses.length>0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
          {presses.map((pr,i)=>(
            <span key={i} style={{fontFamily:'Barlow Condensed', fontSize:11, color:'#C9A84C', background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.25)', padding:'2px 8px', borderRadius:5}}>
              PRESS {pr.segment.toUpperCase()} H{pr.startHole+1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const trS = {
  section: { padding:'12px 14px', borderTop:'1px solid #1E3A6E', display:'flex', flexDirection:'column', gap:10 },
  head:    { display:'flex', alignItems:'center', gap:8 },
  row:     { display:'flex', gap:8 },
  card:    { flex:1, background:'#162950', border:'1px solid #1E3A6E', borderRadius:10, padding:'10px 10px 8px', display:'flex', flexDirection:'column', minWidth:0 },
  wolfBox: { background:'rgba(229,83,75,0.05)', border:'1px solid rgba(229,83,75,0.2)', borderRadius:10, padding:'12px' },
};

Object.assign(window, { RoundTracker, WolfTracker, PTMTracker, NassauTracker });
