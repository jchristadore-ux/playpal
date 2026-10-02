// Summary.jsx — updated design system

const SummaryScreen = ({ round, scores, wolfData, putts, nassauPresses, manualChips, popFlags, bbbData, teeBallData, firData, girData, extraStats, dropouts, indexUpdates, onNewRound, readOnly }) => {
  const { calcAllPayouts, calcWolfStandings, computePTMState, calcStablefordPoints, totalScore, totalVsPar, getAdjustedHoleScore, calcSkins, nassauSegmentStatus, calcBBBStandings, calcTeeBallStandings } = window;
  const { players, course, formats, syncCode } = round;

  // Defensive defaults — snapshot data may omit these fields
  const _scores      = scores      || {};
  const _wolfData    = wolfData    || {};
  const _putts       = putts       || {};
  const _popFlags    = popFlags    || {};
  const _bbbData     = bbbData     || {};
  const _teeBallData = teeBallData || {};
  const _firData     = firData     || {};
  const _girData     = girData     || {};
  const _extraStats  = extraStats  || {};
  const _dropouts    = dropouts    || round.dropouts || {};
  const _presses     = nassauPresses || [];
  const roundGames   = round.games || [];

  const [toast, setToast]         = React.useState(null);
  const [tab, setTab]             = React.useState('scorecard');
  const [ghinStep, setGhinStep]   = React.useState('idle');
  const [emailSent, setEmailSent] = React.useState(false);
  const [venmoSent, setVenmoSent] = React.useState({});

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const ptmState = React.useMemo(() => {
    try {
      return formats.some(f => f.type === 'passmoney')
        ? computePTMState(_scores, _putts, players, course, players[0].id, _dropouts)
        : { holderId: null, log: [] };
    } catch(e) {
      return { holderId: null, log: [] };
    }
  }, []);

  const roundData = { scores:_scores, wolfData:_wolfData, putts:_putts, popFlags:_popFlags, bbbData:_bbbData, teeBallData:_teeBallData, firData:_firData, girData:_girData, dropouts:_dropouts };

  // Tracked stats in the shape MatchEngine award formats read them.
  const _statsData = { putts:_putts, fir:_firData, gir:_girData };

  // Whole-round money: every money game plus every MatchEngine game that
  // carries a stake, rounded to cents and still netting to zero.
  const payouts = React.useMemo(() => {
    try {
      return window.calcRoundPayouts(round, roundData);
    } catch(e) {
      console.warn('[Summary] calcRoundPayouts failed:', e);
      return Object.fromEntries(players.map(p => [p.id, 0]));
    }
  }, []);

  const payoutsByFormat = React.useMemo(() => {
    return formats.map(f => {
      try {
        return calcAllPayouts(_scores, _wolfData, players, course, [f], _presses, ptmState.holderId, _popFlags, null, _bbbData, _teeBallData, { dropouts: _dropouts });
      } catch(e) {
        return Object.fromEntries(players.map(p => [p.id, 0]));
      }
    });
  }, []);

  // Per-engine-game money, aligned with roundGames/engineGameResults by index.
  const payoutsByGame = React.useMemo(() => {
    return roundGames.map(g => {
      try {
        return window.MatchEngine.payouts(g, {
          course, players, scores: _scores,
          startingTee: round.startingTee,
          stats: _statsData, dropouts: _dropouts,
          gameState: { wolf: _wolfData, bbb: _bbbData },
        });
      } catch(e) {
        return Object.fromEntries(players.map(p => [p.id, 0]));
      }
    });
  }, []);

  const wolfPts = React.useMemo(() => {
    try {
      return formats.some(f => f.type === 'wolf') ? calcWolfStandings(_scores, _wolfData, players, course) : {};
    } catch(e) { return {}; }
  }, []);

  const stablefordPts = React.useMemo(() => {
    try {
      if (!formats.some(f => f.type === 'stableford')) return Object.fromEntries(players.map(p => [p.id, 0]));
      return Object.fromEntries(players.map(p => [p.id, course.holes.reduce((a,h,i) => a + calcStablefordPoints(getAdjustedHoleScore(_scores, _popFlags, p.id, i), h.par), 0)]));
    } catch(e) { return Object.fromEntries(players.map(p => [p.id, 0])); }
  }, []);

  const bbbStandings = React.useMemo(() => {
    try {
      return formats.some(f => f.type === 'bingobangobongo') ? calcBBBStandings(_bbbData, players) : {};
    } catch(e) { return {}; }
  }, []);

  const teeBallStandings = React.useMemo(() => {
    try {
      return formats.some(f => f.type === 'teeball') ? calcTeeBallStandings(_teeBallData, players) : {};
    } catch(e) { return {}; }
  }, []);

  const markeyMatchStates = React.useMemo(() => {
    try {
      const fmt = formats.find(f => f.type === 'markeymatch');
      if (!fmt?.markeyMatchConfig) return [];
      return window.calcMarkeyMatchState(_scores, fmt.markeyMatchConfig.markeyPopStrokes, players, fmt, course.holes.length);
    } catch(e) { return []; }
  }, []);

  // Final standings for every MatchEngine game on this round
  const engineGameResults = React.useMemo(() => {
    if (!roundGames.length || !window.MatchEngine) return [];
    return roundGames.map(g => {
      try {
        return window.MatchEngine.compute(g, {
          course, players, scores: _scores,
          startingTee: round.startingTee,
          stats: _statsData, dropouts: _dropouts,
          gameState: { wolf: _wolfData, bbb: _bbbData },
        });
      } catch(e) { console.warn('[Summary] game compute failed:', e); return null; }
    }).filter(Boolean);
  }, []);

  // Net totals (100% course handicap) shown whenever anyone carries an index
  const netTotals = React.useMemo(() => {
    try {
      if (!window.HandicapService || !players.some(p => (p.handicap || 0) !== 0)) return null;
      const tee = window.CourseService
        ? window.CourseService.getTee(course, round.teeId)
        : { rating: course.rating, slope: course.slope };
      const hcp = window.HandicapService.playingHandicaps(players, course.holes, tee, { allowancePct: 100 });
      return Object.fromEntries(players.map(p => {
        const strokes = hcp[p.id].strokes;
        let net = 0;
        course.holes.forEach((h, i) => {
          const s = _scores[p.id]?.[i];
          if (s) net += Math.max(1, s - strokes[i]);
        });
        return [p.id, { net, courseHcp: hcp[p.id].rounded }];
      }));
    } catch(e) { return null; }
  }, []);

  const shareRound = () => {
    const text = report ? report.full : window.SharingService.scorecardText(
      { course, players, date: round.date },
      _scores,
      { gameResults: engineGameResults.map(r => ({ name: r.name, status: r.status })), payouts }
    );
    window.SharingService.share({ title: 'PlayPal — ' + course.name, text }, (how) => {
      showToast(how === 'shared' ? 'Scorecard shared' : how === 'copied' ? 'Scorecard copied to clipboard' : 'Could not share on this device', how === 'failed' ? 'error' : 'success');
    });
  };

  const exportCSV = () => {
    if (window.ProService && window.ProService.canUse && !window.ProService.canUse('export')) {
      try {
        window.dispatchEvent(new CustomEvent('pp:pro-gate', { detail: { feature: 'export' } }));
      } catch (e) {}
      if (window.Toast) {
        try { window.Toast('Export is a Pro feature — unlock PlayPal Pro to download CSV / printable recaps.'); } catch (e) {}
      } else {
        alert('Export is a Pro feature. Unlock PlayPal Pro to download CSV / printable recaps.');
      }
      return;
    }

    const fname = 'playpal-' + (course.name || 'round').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
    const ok = window.SharingService.downloadCSV(fname, window.SharingService.scorecardCSV(round, _scores, _putts));
    showToast(ok ? 'Scorecard CSV downloaded' : 'Export not available here', ok ? 'success' : 'error');
  };

  // A part round never tops the board: whoever walked in is listed after the
  // players who finished, however good their nine holes were.
  const leaderboard = [...players].map(p=>({
    ...p,
    gross:  totalScore(_scores, p.id),
    vsPar:  totalVsPar(_scores, p.id, course.holes),
    payout: payouts[p.id]||0,
    stPts:  stablefordPts[p.id]||0,
    wd:     window.isDropped(_dropouts, p.id),
  })).sort((a,b)=> (a.wd?1:0)-(b.wd?1:0) || (a.gross===0)-(b.gross===0) || a.vsPar-b.vsPar || a.gross-b.gross);

  // One report drives the screen, the email and the share sheet.
  const report = React.useMemo(() => {
    try { return window.SharingService.roundReport({ ...round, tripName: round.tripName || null }, { ...roundData, indexUpdates: indexUpdates || null }); }
    catch(e) { console.warn('[Summary] roundReport failed:', e); return null; }
  }, []);

  const debts = React.useMemo(() =>
    report ? report.debts : window.SharingService.settleDebts(players, payouts), [report]);

  const missingEmail = players.filter(p => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email || '').trim()));
  const missingVenmo = debts.filter(d => !window.SharingService.venmoHandle(d.from.venmo)).map(d => d.from);

  // Charges the player who owes. The amount is the exact figure on screen —
  // to the cent — so nobody is asked for a different number than they read.
  const venmoNote = `PlayPal · ${course.name}${round.date ? ' · ' + round.date : ''}`;
  // The REQUEST control is a real <a href target=_blank> — iOS only hands a
  // link to the Venmo app on a genuine tap, never on a JS redirect — so this
  // just records the tap (or explains a missing username).
  const openVenmo = (debt, debtKey) => {
    const req = window.SharingService.venmoRequest(debt, venmoNote);
    if (!req) { showToast(`Add ${debt.from.name.split(' ')[0]}'s Venmo username on their player profile (Home → Players) to request it`, 'error'); return; }
    setVenmoSent(prev => ({ ...prev, [debtKey]: req }));
  };

  const copyVenmo = (req) => {
    const done = () => showToast('Copied: ' + req.copyText);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(req.copyText).then(done, () => showToast(req.copyText)); return; }
    } catch (e) {}
    showToast(req.copyText);
  };

  const requestAllVenmo = () => {
    const payable = debts.filter(d => window.SharingService.venmoHandle(d.from.venmo));
    if (!payable.length) { showToast('No Venmo usernames on file — add them on each player\'s profile (Home → Players)', 'error'); return; }
    // iOS opens one app link per tap, so PREP ALL only readies the rows.
    const next = {};
    debts.forEach((d, i) => {
      const req = window.SharingService.venmoRequest(d, venmoNote);
      if (req) next[i] = req;
    });
    setVenmoSent(next);
    showToast(`${Object.keys(next).length} request${Object.keys(next).length === 1 ? '' : 's'} ready — tap REQUEST on each row`);
  };

  // PlayPal has no GHIN integration — there is no public API a client app may
  // post to. Rather than pretend, it hands over the adjusted gross scores in
  // the shape GHIN's own score entry asks for, ready to paste.
  const ghinText = () => {
    const lines = [`${course.name} — ${round.date || new Date().toLocaleDateString()}`];
    const tee = window.CourseService ? window.CourseService.getTee(course, round.teeId) : { name:'', rating:course.rating, slope:course.slope };
    lines.push(`Tees: ${tee.name || 'Standard'} · Rating ${tee.rating} · Slope ${tee.slope} · ${course.holes.length} holes`);
    lines.push('');
    players.forEach(p => {
      const holesArr = course.holes.map((h, i) => _scores[p.id]?.[i] || '-').join(' ');
      lines.push(`${p.name}${p.ghin ? ' (GHIN ' + p.ghin + ')' : ''} — ${totalScore(_scores, p.id) || '—'}`);
      lines.push(`  ${holesArr}`);
    });
    return lines.join('\n');
  };

  const copyForGhin = () => {
    const text = ghinText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => { setGhinStep('copied'); showToast('Scores copied — paste them into GHIN'); })
        .catch(() => showToast('Could not copy on this device', 'error'));
    } else {
      showToast('Copying is not available on this device', 'error');
    }
  };

  const sendEmail = () => {
    if (!report) { showToast('Could not build the round summary', 'error'); return; }
    const recipients = players
      .map(p => String(p.email || '').trim())
      .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (!recipients.length) {
      showToast('No player has an email address — add one on their profile', 'error');
      return;
    }
    // The full card goes to the clipboard first: a mailto: body is capped, so
    // the trimmed version in the mail always has a complete source to paste.
    const finish = () => {
      const mailto = 'mailto:' + recipients.map(encodeURIComponent).join(',')
        + '?subject=' + encodeURIComponent(report.subject)
        + '&body='    + encodeURIComponent(report.mail);
      window.location.href = mailto;
      setEmailSent(true);
      showToast(
        missingEmail.length
          ? `Mail opened for ${recipients.length} of ${players.length} — ${missingEmail.map(p=>p.name.split(' ')[0]).join(', ')} need an email`
          : `Mail opened for all ${recipients.length} players`,
        missingEmail.length ? 'error' : 'success'
      );
    };
    if (report.mailTrimmed && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report.full).then(finish).catch(finish);
    } else {
      finish();
    }
  };

  const copyFullSummary = () => {
    if (!report) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report.full)
        .then(() => showToast('Full round summary copied'))
        .catch(() => showToast('Could not copy on this device', 'error'));
    } else {
      showToast('Copying is not available on this device', 'error');
    }
  };

  const tabs = readOnly
    ? [['scorecard','📊 SCORES'],['payouts','💰 PAYOUTS']]
    : [['scorecard','📊 SCORES'],['payouts','💰 PAYOUTS'],['actions','📤 SEND']];

  // 💸 VENMO REQUESTS — one card, shown on the round-ended screen's PAYOUTS
  // tab (top), the SEND tab, and linked from the SCORES tab banner, so match
  // money can be requested the moment the round ends. https venmo.com links.
  const venmoCard = debts.length > 0 ? (
<div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'16px'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20'}}>💸 VENMO REQUESTS</div>
                  <Btn onClick={requestAllVenmo} variant="gold" style={{marginLeft:'auto', padding:'7px 12px', fontSize:11}}>PREP ALL</Btn>
                </div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A', marginBottom:12, lineHeight:1.5}}>
                  REQUEST opens Venmo with the amount and note filled in. If it doesn't, tap "Venmo app" (needs Venmo installed), "Profile" to open their Venmo page, or "Copy" and paste. PlayPal never moves money; you confirm every request inside Venmo.
                </div>
                {missingVenmo.length > 0 && (
                  <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#B45309', background:'rgba(180,83,9,0.06)', border:'1px solid rgba(180,83,9,0.2)', borderRadius:8, padding:'8px 10px', marginBottom:10, lineHeight:1.5}}>
                    No Venmo handle on file for {missingVenmo.map(p=>p.name.split(' ')[0]).join(', ')} — add one on their profile, or settle up in person.
                  </div>
                )}
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {debts.map((d,i)=>{
                    const req = venmoSent[i];
                    const handle = window.SharingService.venmoHandle(d.from.venmo);
                    return (
                      <div key={i} style={{display:'flex', alignItems:'center', gap:10, background:'#F6F4EE', borderRadius:12, padding:'12px 14px', flexWrap:'wrap'}}>
                        <Avatar player={d.from} size={32}/>
                        <div style={{flex:1, minWidth:140}}>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20'}}>{d.from.name}</div>
                          <div style={{fontSize:12, color:'#3F5F4A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>
                            owes <span style={{color:'#C8A15A', fontWeight:700, whiteSpace:'nowrap'}}>{window.fmtMoney(d.amount)}</span> to {d.to.name.split(' ')[0]}{handle ? ` · @${handle}` : ''}
                          </div>
                          {!handle && (
                            <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#B45309', marginTop:2}}>
                              No Venmo username — add one on {d.from.name.split(' ')[0]}'s profile (Home → Players).
                            </div>
                          )}
                        </div>
                        {handle ? (() => {
                          const link = window.SharingService.venmoRequest(d, venmoNote);
                          const small = {fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, fontWeight:700, color:'#2563EB', textDecoration:'underline', background:'none', border:'none', padding:0, cursor:'pointer'};
                          return (
                            <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0}}>
                              {/* Real anchor + new tab: venmo.com hands phones to the Venmo app pre-filled. */}
                              <a href={link.url} target="_blank" rel="noopener noreferrer"
                                onClick={() => openVenmo(d, i)}
                                data-venmo-request={i}
                                style={{padding:'9px 14px', fontSize:12, borderRadius:10, textDecoration:'none', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, letterSpacing:0.5,
                                  background: req ? 'transparent' : '#C8A15A', color: req ? '#3F5F4A' : '#0E2B20', border: req ? '1px solid #E7E3D9' : '1px solid #C8A15A'}}>
                                {req ? '✓ REQUEST AGAIN' : '💸 REQUEST'}
                              </a>
                              <div style={{display:'flex', gap:10}}>
                                <a href={link.appLink} data-venmo-app={i} onClick={() => openVenmo(d, i)} style={small}>Venmo app</a>
                                <a href={link.profileLink} target="_blank" rel="noopener noreferrer" data-venmo-profile={i} style={small}>Profile</a>
                                <button onClick={() => copyVenmo(link)} data-venmo-copy={i} style={small}>Copy</button>
                              </div>
                            </div>
                          );
                        })() : (
                          <Btn onClick={()=>openVenmo(d,i)} variant="ghost" style={{padding:'9px 14px', fontSize:12, flexShrink:0}}>ADD VENMO</Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
  ) : null;

  return (
    <div style={sumS.root}>
      {/* Hero */}
      <div style={sumS.hero}>
        {readOnly
          ? <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:3, color:'#6B7280'}}>COMPLETED ROUND</div>
          : <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, letterSpacing:3, color:'#15803D'}}>ROUND COMPLETE</div>
        }
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:24, color:'#0E2B20', marginTop:2}}>{course.name}</div>
        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A'}}>
          {round.date || new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
        </div>

        <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap', justifyContent:'center'}}>
          {leaderboard.map((p,i)=>(
            <div key={p.id} style={{display:'flex', alignItems:'center', gap:8, background:'#FFFFFF',
              border:`1px solid ${i===0 && !p.wd ?'#C8A15A':'#E7E3D9'}`, borderRadius:22, padding:'5px 12px 5px 7px'}}>
              <Avatar player={p} size={26}/>
              <div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:i===0 && !p.wd ?'#C8A15A':'#0E2B20', lineHeight:1}}>
                  {p.name.split(' ')[0]}
                </div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:p.vsPar<0?'#15803D':p.vsPar===0?'#6B7280':'#DC2626'}}>
                  {p.vsPar===0?'E':p.vsPar>0?`+${p.vsPar}`:p.vsPar} · {p.gross||'—'}
                  {p.stPts>0 && <span style={{color:'#C8A15A', marginLeft:4}}>★{p.stPts}</span>}
                  {window.isDropped(_dropouts, p.id) && (
                    <span style={{color:'#8A9E8A', marginLeft:4}}>· 👋 {window.dropoutThru(_dropouts, p.id)} holes</span>
                  )}
                </div>
              </div>
              {i===0 && !p.wd && <span style={{fontSize:14}}>🏆</span>}
            </div>
          ))}
        </div>

        {readOnly && syncCode && (
          <div style={{marginTop:8, background:'rgba(200,161,90,0.06)', border:'1px solid rgba(200,161,90,0.15)', borderRadius:6, padding:'4px 12px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:10, letterSpacing:1.5, color:'#C8A15A'}}>
            READ-ONLY · CODE {syncCode}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={sumS.tabBar}>
        {tabs.map(([id,lbl])=>(
          <div key={id} onClick={()=>setTab(id)} style={{...sumS.tab, color:tab===id?'#C8A15A':'#6B7280', borderBottom:tab===id?'2px solid #C8A15A':'2px solid transparent'}}>
            {lbl}
          </div>
        ))}
      </div>

      <div style={sumS.content}>

        {/* SCORECARD */}
        {tab==='scorecard' && debts.length > 0 && (
          <button onClick={()=>setTab('payouts')} data-venmo-banner="1"
            style={{width:'100%', display:'flex', alignItems:'center', gap:10, background:'rgba(200,161,90,0.10)', border:'1px solid rgba(200,161,90,0.45)', borderRadius:12, padding:'10px 14px', marginBottom:12, cursor:'pointer', textAlign:'left', WebkitTapHighlightColor:'transparent'}}>
            <span style={{fontSize:18}} aria-hidden="true">💸</span>
            <span style={{flex:1, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, fontWeight:700, color:'#0E2B20'}}>
              {debts.length} payment{debts.length===1?'':'s'} to settle — request on Venmo
            </span>
            <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, fontWeight:800, letterSpacing:1, color:'#C8A15A'}}>PAYOUTS →</span>
          </button>
        )}
        {tab==='scorecard' && (
          <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
            <table style={sumS.table}>
              <thead>
                <tr>
                  <th style={{...sumS.th, textAlign:'left', minWidth:90}}>PLAYER</th>
                  {course.holes.slice(0,9).map(h=><th key={h.num} style={{...sumS.th, color:'#6B7280', minWidth:28}}>{h.num}</th>)}
                  <th style={{...sumS.th, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9', minWidth:32}}>OUT</th>
                  {course.holes.slice(9,18).map(h=><th key={h.num} style={{...sumS.th, color:'#6B7280', minWidth:28}}>{h.num}</th>)}
                  <th style={{...sumS.th, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9', minWidth:32}}>IN</th>
                  <th style={{...sumS.th, color:'#0E2B20'}}>TOT</th>
                  <th style={{...sumS.th, color:'#0E2B20'}}>+/−</th>
                </tr>
                <tr>
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:11}}>PAR</td>
                  {course.holes.slice(0,9).map(h=><td key={h.num} style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:12}}>{h.par}</td>)}
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>{course.holes.slice(0,9).reduce((a,h)=>a+h.par,0)}</td>
                  {course.holes.slice(9,18).map(h=><td key={h.num} style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, fontSize:12}}>{h.par}</td>)}
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>{course.holes.slice(9,18).reduce((a,h)=>a+h.par,0)}</td>
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600}}>{course.holes.reduce((a,h)=>a+h.par,0)}</td>
                  <td style={{...sumS.td, color:'#8A9E8A'}}>—</td>
                </tr>
              </thead>
              <tbody>
                {players.map(p=>{
                  const vs   = totalVsPar(_scores,p.id,course.holes);
                  const ftot = course.holes.slice(0,9).reduce((a,h,i)=>a+(_scores[p.id]?.[i]||0),0);
                  const btot = course.holes.slice(9,18).reduce((a,h,i)=>a+(_scores[p.id]?.[i+9]||0),0);
                  return (
                    <tr key={p.id}>
                      <td style={{...sumS.td, textAlign:'left'}}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <div style={{width:7, height:7, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#0E2B20', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                          {window.isDropped(_dropouts, p.id) && (
                            <span title={window.dropoutLabel(_dropouts, p.id)}
                              style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:9, letterSpacing:0.5, color:'#8A9E8A', border:'1px solid #E7E3D9', borderRadius:4, padding:'0 3px'}}>WD</span>
                          )}
                        </div>
                      </td>
                      {course.holes.slice(0,9).map((h,i)=>{
                        const s=_scores[p.id]?.[i]; const d=s?s-h.par:null;
                        const c=d===null?'#E7E3D9':d<=-2?'#C8A15A':d===-1?'#15803D':d===0?'#6B7280':d===1?'#DC2626':'#991B1B';
                        const popN = window.popStrokesAt(_popFlags, p.id, i);
                        return (
                          <td key={i} style={{...sumS.td, color:c, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14}}>
                            {s||'·'}
                            {popN !== 0 && <span title={`${popN} stroke${Math.abs(popN)===1?'':'s'}`} style={{display:'inline-block',marginLeft:1,fontSize:7,color:'#C8A15A',verticalAlign:'super'}}>{Math.abs(popN) > 1 ? '●●' : '●'}</span>}
                          </td>
                        );
                      })}
                      <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>{ftot||'·'}</td>
                      {course.holes.slice(9,18).map((h,i)=>{
                        const ri=i+9; const s=_scores[p.id]?.[ri]; const d=s?s-h.par:null;
                        const c=d===null?'#E7E3D9':d<=-2?'#C8A15A':d===-1?'#15803D':d===0?'#6B7280':d===1?'#DC2626':'#991B1B';
                        const popN = window.popStrokesAt(_popFlags, p.id, ri);
                        return (
                          <td key={ri} style={{...sumS.td, color:c, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14}}>
                            {s||'·'}
                            {popN !== 0 && <span title={`${popN} stroke${Math.abs(popN)===1?'':'s'}`} style={{display:'inline-block',marginLeft:1,fontSize:7,color:'#C8A15A',verticalAlign:'super'}}>{Math.abs(popN) > 1 ? '●●' : '●'}</span>}
                          </td>
                        );
                      })}
                      <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, color:'#0E2B20', background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>{btot||'·'}</td>
                      <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:'#0E2B20'}}>{totalScore(_scores,p.id)||'—'}</td>
                      <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:15, color:vs<0?'#15803D':vs===0?'#6B7280':'#DC2626'}}>{vs===0?'E':vs>0?`+${vs}`:vs}</td>
                    </tr>
                  );
                })}
                {_putts && Object.keys(_putts).length > 0 && <tr>
                  <td style={{...sumS.td, color:'#8A9E8A', fontSize:11, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, letterSpacing:1}}>PUTTS</td>
                  {course.holes.slice(0,9).map((_,i)=>{
                    const tot = players.reduce((a,p)=>a+window.puttCount(_putts[p.id]?.[i]),0);
                    return <td key={i} style={{...sumS.td, color:'#8A9E8A', fontSize:12, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{tot||'·'}</td>;
                  })}
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>
                    {players.reduce((a,p)=>a+window.sumPutts((_putts[p.id]||[]).slice(0,9)),0)||'·'}
                  </td>
                  {course.holes.slice(9,18).map((_,i)=>{
                    const ri=i+9; const tot = players.reduce((a,p)=>a+window.puttCount(_putts[p.id]?.[ri]),0);
                    return <td key={ri} style={{...sumS.td, color:'#8A9E8A', fontSize:12, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{tot||'·'}</td>;
                  })}
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, background:'#F0EDE4', borderLeft:'2px solid #E7E3D9'}}>
                    {players.reduce((a,p)=>a+window.sumPutts((_putts[p.id]||[]).slice(9,18)),0)||'·'}
                  </td>
                  <td style={{...sumS.td, color:'#8A9E8A', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif'}}>{players.reduce((a,p)=>a+window.sumPutts(_putts[p.id]||[]),0)}</td>
                  <td style={{...sumS.td}}/>
                </tr>}
              </tbody>
            </table>

            {Object.keys(wolfPts).length>0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>WOLF STANDINGS</Label>
                <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  {players.map(p=>(
                    <div key={p.id} style={{flex:1, minWidth:80, background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:12, padding:'10px', textAlign:'center'}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#0E2B20'}}>{p.name.split(' ')[0]}</div>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color:(wolfPts[p.id]||0)>0?'#15803D':(wolfPts[p.id]||0)<0?'#DC2626':'#6B7280'}}>
                        {(wolfPts[p.id]||0)>0?'+':''}{wolfPts[p.id]||0} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Round Stats: Putts / FIR / GIR */}
            {(() => {
              const hasPutts = window.hasAnyPutts(_putts, players);
              const hasChipIns = players.some(p => window.countZeroPutts(_putts[p.id]) > 0);
              const hasFir   = _firData && players.some(p => (_firData[p.id]||[]).some(v=>v!==null));
              const hasGir   = _girData && players.some(p => (_girData[p.id]||[]).some(v=>v!==null));
              if (!hasPutts && !hasFir && !hasGir) return null;
              const firEligHoles = (course.holes||[]).filter(h=>h.par>3).length;
              const girTotal     = (course.holes||[]).length;
              return (
                <div style={{marginTop:16, background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden'}}>
                  <div style={{padding:'10px 14px', borderBottom:'1px solid #E7E3D9', background:'rgba(200,161,90,0.04)'}}>
                    <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:9, letterSpacing:2, fontWeight:700, color:'#C8A15A'}}>ROUND STATS</div>
                  </div>
                  <div style={{overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
                    <table style={{borderCollapse:'collapse', width:'100%', minWidth:240}}>
                      <thead>
                        <tr>
                          <th style={{...sumS.th, textAlign:'left', paddingLeft:14}}>PLAYER</th>
                          {hasPutts && <th style={sumS.th}>PUTTS</th>}
                          {hasChipIns && <th style={sumS.th}>CHIP-INS</th>}
                          {hasFir   && <th style={sumS.th}>FIR</th>}
                          {hasGir   && <th style={sumS.th}>GIR</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {players.map(p => {
                          const totalPutts = hasPutts ? window.sumPutts(_putts[p.id]) : null;
                          const chipIns    = window.countZeroPutts(_putts[p.id]);
                          const firArr  = _firData?.[p.id] || [];
                          const firHit  = firArr.filter((v,i)=>(course.holes[i]?.par||4)>3 && v===true).length;
                          const firElig = firArr.filter((v,i)=>(course.holes[i]?.par||4)>3 && v!==null).length || firEligHoles;
                          const girArr  = _girData?.[p.id] || [];
                          const girHit  = girArr.filter(v=>v===true).length;
                          const girPlyd = girArr.filter(v=>v!==null).length || girTotal;
                          return (
                            <tr key={p.id}>
                              <td style={{...sumS.td, textAlign:'left', paddingLeft:14}}>
                                <div style={{display:'flex', alignItems:'center', gap:6}}>
                                  <div style={{width:7, height:7, borderRadius:'50%', background:p.color, flexShrink:0}}/>
                                  <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#0E2B20', whiteSpace:'nowrap'}}>{p.name.split(' ')[0]}</span>
                                </div>
                              </td>
                              {hasPutts && <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20'}}>{totalPutts||'—'}</td>}
                              {hasChipIns && <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:chipIns?'#15803D':'#8A9E8A'}}>{chipIns||'—'}</td>}
                              {hasFir   && <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A'}}>{firArr.some(v=>v!==null)?`${firHit}/${firElig}`:'—'}</td>}
                              {hasGir   && <td style={{...sumS.td, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A'}}>{girArr.some(v=>v!==null)?`${girHit}/${girPlyd}`:'—'}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
            {/* PlayPal Index — the number moving right after the round */}
            {indexUpdates && Object.keys(indexUpdates).length > 0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>PLAYPAL INDEX</Label>
                <div style={{marginTop:8, border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden', background:'#FFFFFF'}}>
                  {players.filter(p => indexUpdates[p.id]).map(p => {
                    const u = indexUpdates[p.id];
                    const down = u.posted && u.before !== null && u.after !== null && u.after < u.before;
                    const up   = u.posted && u.before !== null && u.after !== null && u.after > u.before;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', minHeight:44, borderBottom:'1px solid #F0EDE4'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20'}}>{p.name}</div>
                          <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color: u.posted ? '#3F5F4A' : '#8A9E8A', lineHeight:1.4, overflowWrap:'anywhere'}}>{u.detail}</div>
                        </div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:14, textAlign:'right', maxWidth:'50%',
                          color: down ? '#15803D' : up ? '#DC2626' : '#0E2B20'}}>{u.headline}</div>
                      </div>
                    );
                  })}
                  <div style={{padding:'10px 14px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A', lineHeight:1.5, background:'#F6F4EE'}}>
                    {window.IndexService ? window.IndexService.DISCLAIMER : ''}
                  </div>
                </div>
              </div>
            )}

            {/* The Brovisional — separate from the PlayPal Index (tracking only) */}
            {syncCode && window.BrovisionalService && <BrovisionalBlock round={round} players={players}/>}

            {/* Engine game results */}
            {engineGameResults.length > 0 && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>GAME RESULTS</Label>
                <div style={{marginTop:8, border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden', background:'#FFFFFF'}}>
                  {engineGameResults.map((r, i) => <GameStandingsCard key={i} result={r} stake={roundGames[i]?.config?.stake || 0} final={true}/>)}
                </div>
              </div>
            )}

            {/* Gross vs Net */}
            {netTotals && (
              <div style={{marginTop:16}}>
                <Label style={{padding:'0 4px'}}>NET SCORES (FULL COURSE HANDICAP)</Label>
                <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
                  {players.map(p => {
                    const gross = totalScore(_scores, p.id);
                    const n = netTotals[p.id];
                    return (
                      <div key={p.id} style={{flex:1, minWidth:90, background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:12, padding:'10px', textAlign:'center'}}>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#0E2B20'}}>{p.name.split(' ')[0]}</div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color:'#0E2B20'}}>{n.net || '—'}</div>
                        <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:10, color:'#8A9E8A'}}>gross {gross || '—'} · CH {n.courseHcp}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Share / export */}
            <div style={{display:'flex', gap:10, marginTop:16}}>
              <Btn onClick={shareRound} variant="green" style={{flex:1, fontSize:14}}>📤 SHARE</Btn>
              <Btn onClick={exportCSV} variant="surface" style={{flex:1, fontSize:14}}>⬇️ EXPORT CSV</Btn>
            </div>
          </div>
        )}

        {/* PAYOUTS */}
        {tab==='payouts' && (
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {venmoCard}
            {formats.map((f,fi)=>{
              const info = FORMAT_INFO[f.type];
              const fmtStake = f.nassauMatches?.[0]?.stakes ?? f.stakes;
              return (
                <div key={f.type+fi} style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #E7E3D9'}}>
                    <span style={{fontSize:18}}>{info.icon}</span>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20'}}>{info.label}</span>
                    <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:'#C8A15A'}}>
                      {f.type==='wolf'            ? `$${f.stakes} round pot` :
                       f.type==='passmoney'       ? `$${f.stakes} round pot` :
                       f.type==='nassau'          ? `$${fmtStake}·$${fmtStake}·$${fmtStake*2}` :
                       f.type==='skins'           ? `$${f.stakes}/skin` :
                       f.type==='stableford'      ? `$${f.stakes} match` :
                       f.type==='bingobangobongo' ? `$${f.stakes} round pot` :
                       f.type==='teeball'         ? `$${f.stakes} round pot` :
                       f.type==='markeymatch'     ? `$${f.markeyMatchConfig?.stake || f.stakes}/match` : ''}
                    </span>
                  </div>
                  {players.map(p=>{
                    const v=(payoutsByFormat[fi]?.[p.id])||0;
                    const isWinner = v > 0;
                    const isPTMWinner = f.type==='passmoney' && ptmState.holderId===p.id;
                    const markeyTeam = f.type==='markeymatch' && f.markeyMatchConfig ? ((f.markeyMatchConfig.team1||[]).includes(p.id) ? 'A' : (f.markeyMatchConfig.team2||[]).includes(p.id) ? 'B' : null) : null;
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #F0EDE4'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1}}>
                          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>{p.name}</span>
                          {f.type==='wolf' && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>{wolfPts[p.id]||0} wolf pts{isWinner?` — wins $${f.stakes} from each`:''}</div>}
                          {isPTMWinner && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#C8A15A'}}>💰 holds the money — wins ${f.stakes} from each player</div>}
                          {f.type==='stableford' && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#C8A15A'}}>{stablefordPts[p.id]||0} pts</div>}
                          {f.type==='bingobangobongo' && (() => { const st=bbbStandings[p.id]||{bingo:0,bango:0,bongo:0,total:0}; return <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>{st.total} pts · Bingo {st.bingo} · Bango {st.bango} · Bongo {st.bongo}</div>; })()}
                          {f.type==='teeball' && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>{teeBallStandings[p.id]||0} tee ball pts</div>}
                          {markeyTeam && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A'}}>Team {markeyTeam} · {markeyMatchStates.length} match{markeyMatchStates.length!==1?'es':''}</div>}
                        </div>
                        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:20, whiteSpace:'nowrap', color:v>0?'#15803D':v<0?'#DC2626':'#6B7280'}}>
                          {window.fmtMoney(v, { signed:true })}
                        </span>
                      </div>
                    );
                  })}

                  {f.type==='markeymatch' && markeyMatchStates.length > 0 && (
                    <div style={{padding:'10px 14px', borderTop:'1px solid #E7E3D9'}}>
                      <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:10, letterSpacing:2, color:'#C8A15A', marginBottom:8}}>MATCH RESULTS</div>
                      <div style={{display:'flex', flexDirection:'column', gap:6}}>
                        {markeyMatchStates.map((match, idx) => {
                          const mc = ['#C8A15A','#7B9FE0','#E07BE0'][idx % 3] || '#C8A15A';
                          const stake = f.markeyMatchConfig?.stake || f.stakes || 0;
                          const winner = match.team1Holes > match.team2Holes ? 'Team A' : match.team2Holes > match.team1Holes ? 'Team B' : null;
                          const resultColor = winner === 'Team A' ? '#C8A15A' : winner === 'Team B' ? '#7B9FE0' : '#6B7280';
                          return (
                            <div key={match.matchId} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'#F6F4EE', borderRadius:10, border:`1px solid ${mc}22`}}>
                              <div style={{width:6, height:6, borderRadius:'50%', background:mc, flexShrink:0}}/>
                              <div style={{flex:1}}>
                                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:mc}}>Match {match.matchId}</span>
                                <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#8A9E8A', marginLeft:6}}>H{match.startHole+1}–{(match.endHole ?? 17)+1}</span>
                                {match.matchId > 1 && <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:9, color:'#E07BE0', background:'rgba(224,123,224,0.1)', border:'1px solid rgba(224,123,224,0.25)', borderRadius:4, padding:'1px 5px', marginLeft:6}}>{match.isTurnPress ? 'TURN' : 'PRESS'}</span>}
                              </div>
                              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, color:'#3F5F4A'}}>{match.team1Holes}–{match.team2Holes}</span>
                              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:12, color:resultColor, minWidth:60, textAlign:'right'}}>{winner ? `${winner} wins` : 'Push'}</span>
                              <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:11, color:'#C8A15A'}}>${stake}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {engineGameResults.map((r, gi) => {
              const g       = roundGames[gi] || {};
              const gStake  = Number(g.config?.stake) || 0;
              const gPay    = payoutsByGame[gi] || {};
              const inGame  = players.filter(p => gPay[p.id] !== undefined);
              const roster  = inGame.length ? inGame : players;
              return (
                <div key={'game'+gi} style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid #E7E3D9'}}>
                    <span style={{fontSize:18}}>{r.icon}</span>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20'}}>{r.name}</span>
                    <span style={{marginLeft:'auto', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:13, color:gStake > 0 ? '#C8A15A' : '#8A9E8A'}}>
                      {gStake > 0 ? window.fmtMoney(gStake) : 'no money'}
                    </span>
                  </div>
                  <div style={{padding:'8px 16px 0', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A'}}>
                    {r.complete && r.winner ? '🏆 ' : ''}{r.status}
                  </div>
                  {roster.map(p => {
                    const v = gPay[p.id] || 0;
                    const entry = (r.entries || []).find(e => (e.playerIds || []).includes(p.id));
                    return (
                      <div key={p.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #F0EDE4'}}>
                        <Avatar player={p} size={28}/>
                        <div style={{flex:1, minWidth:0}}>
                          <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:15, color:'#0E2B20'}}>{p.name}</span>
                          {entry && <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#3F5F4A'}}>{entry.label} · {entry.totalLabel} · {entry.detail}</div>}
                        </div>
                        <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:800, fontSize:20, whiteSpace:'nowrap', color:v>0?'#15803D':v<0?'#DC2626':'#6B7280'}}>
                          {gStake > 0 ? window.fmtMoney(v, { signed:true }) : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{background:'rgba(200,161,90,0.04)', border:'1px solid rgba(200,161,90,0.2)', borderRadius:16, padding:'16px'}}>
              <Label style={{color:'#C8A15A', display:'block', marginBottom:12}}>NET SETTLEMENT</Label>
              {debts.length===0
                ? <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A'}}>All square — no money changes hands 🎉</div>
                : debts.map((d,i)=>(
                  <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(200,161,90,0.1)'}}>
                    <Avatar player={d.from} size={26}/>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:14, color:'#0E2B20', flex:1}}>
                      {d.from.name.split(' ')[0]} → {d.to.name.split(' ')[0]}
                    </span>
                    <span style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:900, fontSize:22, color:'#C8A15A', whiteSpace:'nowrap'}}>{window.fmtMoney(d.amount)}</span>
                  </div>
                ))
              }
            </div>

            {!readOnly && onNewRound && (
              <Btn onClick={onNewRound} variant="ghost" style={{width:'100%', marginTop:4, fontSize:15}}>⛳ START NEW ROUND</Btn>
            )}
          </div>
        )}

        {/* SEND / ACTIONS */}
        {tab==='actions' && !readOnly && (
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'16px'}}>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20', marginBottom:4}}>✉️ EMAIL THE ROUND</div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A', marginBottom:12, lineHeight:1.5}}>
                Leaderboard, net scores, every game with its money, the settle-up list and Venmo links — to everyone who played.
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:12}}>
                {players.map(p => {
                  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email || '').trim());
                  return (
                    <div key={p.id} style={{fontSize:12, fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', color: ok ? '#8A9E8A' : '#DC2626'}}>
                      {ok ? '→ ' + p.email : `⚠️ ${p.name} has no email address — add one on their profile`}
                    </div>
                  );
                })}
              </div>
              {report && report.mailTrimmed && (
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:11, color:'#B45309', background:'rgba(180,83,9,0.06)', border:'1px solid rgba(180,83,9,0.2)', borderRadius:8, padding:'8px 10px', marginBottom:10, lineHeight:1.5}}>
                  This round is bigger than an email link can carry, so the message holds the summary and the full hole-by-hole card is copied to your clipboard — paste it in before you send.
                </div>
              )}
              <Btn onClick={sendEmail} variant={emailSent?'ghost':'green'} disabled={missingEmail.length === players.length} style={{width:'100%', fontSize:15}}>
                {emailSent ? '✓ SENT — SEND AGAIN' : `SEND TO ${players.length - missingEmail.length} PLAYER${players.length - missingEmail.length === 1 ? '' : 'S'}`}
              </Btn>
              <div style={{display:'flex', gap:10, marginTop:10}}>
                <Btn onClick={copyFullSummary} variant="surface" style={{flex:1, fontSize:13}}>📋 COPY FULL SUMMARY</Btn>
                <Btn onClick={shareRound} variant="surface" style={{flex:1, fontSize:13}}>📤 SHARE</Btn>
              </div>
            </div>

            <div style={{background:'#FFFFFF', border:'1px solid #E7E3D9', borderRadius:16, padding:'16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:4}}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <circle cx="9" cy="9" r="8" stroke="#C8A15A" strokeWidth="1.5" fill="none"/>
                  <path d="M6 7 Q9 4 12 7 Q9 10 6 7Z" fill="#C8A15A"/>
                  <circle cx="9" cy="13" r="1.5" fill="#C8A15A"/>
                </svg>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:16, color:'#0E2B20'}}>SCORES FOR GHIN</div>
              </div>
              <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:12, color:'#3F5F4A', marginBottom:12, lineHeight:1.5}}>
                PlayPal can't post to GHIN on your behalf — there's no public API for it. This copies every player's hole-by-hole scores, tees, rating and slope so you can paste them straight into GHIN's score entry.
              </div>
              <Btn onClick={copyForGhin} variant={ghinStep==='copied'?'ghost':'surface'} style={{width:'100%', fontSize:15}}>
                {ghinStep==='copied' ? '✓ COPIED — COPY AGAIN' : '📋 COPY SCORES FOR GHIN'}
              </Btn>
              <Btn onClick={exportCSV} variant="surface" style={{width:'100%', fontSize:13, marginTop:10}}>⬇️ EXPORT CSV</Btn>
            </div>

            {venmoCard}
            {debts.length===0 && (
              <div style={{background:'rgba(21,128,61,0.04)', border:'1px solid rgba(21,128,61,0.15)', borderRadius:16, padding:'16px', textAlign:'center'}}>
                <div style={{fontSize:28, marginBottom:8}} aria-hidden="true">🎉</div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:18, color:'#15803D'}}>ALL SQUARE</div>
                <div style={{fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize:13, color:'#3F5F4A', marginTop:4}}>No money changes hands this round</div>
              </div>
            )}

            {onNewRound && <Btn onClick={onNewRound} variant="ghost" style={{width:'100%', marginTop:4, fontSize:15}}>⛳ START NEW ROUND</Btn>}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type}/>}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
};

// The Brovisional status + toggles. The result lives on the round doc
// (`brovisional`, written by /api/handicap/post) and in a local cache that
// BrovisionalService updates; this block only reads it and re-posts on edits.
const BrovisionalBlock = ({ round, players }) => {
  const BS = window.BrovisionalService;
  const code = round.syncCode;
  const gid = (() => { try { return window.GroupService.current(); } catch (e) { return 'LEGACY'; } })();
  const [brov, setBrov] = React.useState(() => BS.getCached(code));
  const [roundOn, setRoundOn] = React.useState(() => BS.roundPostEnabled(round));
  const [playerOn, setPlayerOn] = React.useState(() => Object.fromEntries(players.map(p => [p.id, BS.playerPostEnabled(round, p.id)])));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const off = BS.subscribe(d => { if (d && d.roundId === code) setBrov(d.brovisional); });
    // Latest server-side result (also picks up the daily cron's retries).
    try {
      window.RoundSyncService && window.RoundSyncService.fetchRound(code, (r, err, d) => {
        if (d && d.brovisional && d.brovisional.status) { BS.setCached(code, d.brovisional); }
      });
    } catch (e) {}
    return off;
  }, [code]);

  // Older rounds (before this feature) with no result stay quiet.
  const explicit = typeof round.postToHandicap === 'boolean';
  if (BS.isDisabled() || (brov && brov.status === 'disabled')) return null;
  if (!explicit && !(brov && brov.status)) return null;

  const persist = (patch) => {
    // Round doc (server reads toggles from here) + local snapshot (so the
    // toggle survives reopening this round on this device), then re-post.
    try {
      const k = 'pp_round_snap_' + code; const raw = localStorage.getItem(k);
      if (raw) { const snap = JSON.parse(raw); snap.round = { ...snap.round, ...patch.round, handicapPost: { ...(snap.round.handicapPost || {}), ...(patch.round.handicapPost || {}) } }; localStorage.setItem(k, JSON.stringify(snap)); }
    } catch (e) {}
    setBusy(true);
    const go = () => BS.post(gid, code, { retry: true }).finally(() => setBusy(false));
    if (window.RoundSyncService && window.RoundSyncService.writeMeta) window.RoundSyncService.writeMeta(code, patch, () => go());
    else go();
  };
  const toggleRound = () => { const v = !roundOn; setRoundOn(v); persist({ round: { postToHandicap: v } }); };
  const togglePlayer = (pid) => { const v = !playerOn[pid]; setPlayerOn(prev => ({ ...prev, [pid]: v })); persist({ round: { handicapPost: { [pid]: v } } }); };
  const retry = () => { setBusy(true); BS.post(gid, code, { retry: true }).finally(() => setBusy(false)); };

  const v = BS.view(roundOn ? brov : (brov && brov.status === 'pending' ? brov : { status: 'skipped', reason: 'opted_out', players: {} }), players);
  const rowByPid = Object.fromEntries((v.rows || []).map(r => [r.pid, r]));
  const font = 'Plus Jakarta Sans, Inter, system-ui, sans-serif';
  const tone = v.kind === 'posted' || v.kind === 'partial' ? '#15803D' : v.kind === 'failed' ? '#DC2626' : '#8A9E8A';
  const Check = ({ on }) => (
    <div style={{width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      background:on?'#0E2B20':'transparent', border:`2px solid ${on?'#0E2B20':'#E7E3D9'}`}}>
      {on && <span style={{color:'#F6F4EE', fontSize:14, fontWeight:900}}>✓</span>}
    </div>
  );

  return (
    <div style={{marginTop:16}}>
      <Label style={{padding:'0 4px'}}>THE BROVISIONAL</Label>
      <div style={{marginTop:8, border:'1px solid #E7E3D9', borderRadius:16, overflow:'hidden', background:'#FFFFFF'}}>
        <div role="switch" aria-checked={roundOn} tabIndex={0} onClick={busy ? undefined : toggleRound}
          onKeyDown={e => { if (!busy && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggleRound(); } }}
          style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', minHeight:44, borderBottom:'1px solid #F0EDE4', cursor:busy?'wait':'pointer'}}>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontFamily:font, fontWeight:700, fontSize:14, color:'#0E2B20'}}>Post to handicap</div>
            <div style={{fontFamily:font, fontSize:11, color:tone, lineHeight:1.4}} aria-live="polite">{v.kind === 'hidden' ? '' : v.headline}</div>
          </div>
          <Check on={roundOn}/>
        </div>
        {roundOn && players.map(p => {
          const r = rowByPid[p.id];
          const on = playerOn[p.id] !== false;
          return (
            <div key={p.id} role="switch" aria-checked={on} aria-label={'Post ' + p.name} tabIndex={0}
              onClick={busy ? undefined : () => togglePlayer(p.id)}
              onKeyDown={e => { if (!busy && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); togglePlayer(p.id); } }}
              style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', minHeight:44, borderBottom:'1px solid #F0EDE4', cursor:busy?'wait':'pointer'}}>
              <Avatar player={p} size={28}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:font, fontWeight:700, fontSize:14, color:'#0E2B20'}}>{p.name}</div>
                <div style={{fontFamily:font, fontSize:11, color: r && r.counted ? '#3F5F4A' : '#8A9E8A', lineHeight:1.4, overflowWrap:'anywhere'}}>
                  {!on ? 'opted out' : r ? (r.counted ? 'Posted' + (r.note ? ' · ' + r.note : '') : 'Skipped — ' + r.text) : ''}
                </div>
              </div>
              {r && r.counted && on && (
                <div style={{fontFamily:font, fontWeight:800, fontSize:13, color:'#0E2B20', textAlign:'right'}}>
                  <div>Diff {r.differential || '—'}</div>
                  <div style={{fontSize:11, fontWeight:700, color:'#3F5F4A'}}>Index {r.index || '—'}</div>
                </div>
              )}
              <Check on={on}/>
            </div>
          );
        })}
        {v.kind === 'failed' && (
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FEF2F2'}}>
            <div style={{flex:1, fontFamily:font, fontSize:11, color:'#991B1B', lineHeight:1.4, overflowWrap:'anywhere'}}>
              Couldn't reach The Brovisional{v.error ? ' (' + String(v.error).slice(0, 120) + ')' : ''}. It retries automatically.
            </div>
            <Btn onClick={retry} variant="surface" disabled={busy} style={{fontSize:13, padding:'8px 14px'}}>{busy ? '…' : 'RETRY'}</Btn>
          </div>
        )}
        <div style={{padding:'10px 14px', fontFamily:font, fontSize:10, color:'#8A9E8A', lineHeight:1.5, background:'#F6F4EE'}}>
          The Brovisional is an unofficial handicap app, separate from the PlayPal Index (tracking only) and from GHIN.
        </div>
      </div>
    </div>
  );
};

const sumS = {
  root:    { flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:'#F6F4EE' },
  hero:    { padding:'20px 16px', borderBottom:'1px solid #E7E3D9', background:'#F6F4EE', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:4 },
  tabBar:  { display:'flex', borderBottom:'1px solid #E7E3D9', flexShrink:0, background:'#FFFFFF' },
  tab:     { flex:1, padding:'13px 6px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:700, fontSize:12, letterSpacing:1.5, textAlign:'center', cursor:'pointer', transition:'color 0.15s' },
  content: { flex:1, padding:'16px', overflowY:'auto' },
  table:   { borderCollapse:'collapse', fontSize:13, width:'max-content', minWidth:'100%' },
  th:      { padding:'6px 7px', fontFamily:'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight:600, letterSpacing:1.5, fontSize:10, color:'#6B7280', textAlign:'center', borderBottom:'2px solid #E7E3D9', whiteSpace:'nowrap' },
  td:      { padding:'8px 6px', textAlign:'center', borderBottom:'1px solid #F0EDE4' },
};

Object.assign(window, { SummaryScreen });
