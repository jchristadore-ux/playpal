// AuthScreen.jsx — Sign up / sign in / sign out + PlayPal Pro upgrade.

const AuthScreen = ({ open, onClose, initialMode }) => {
  const [mode, setMode] = React.useState(initialMode || 'signin'); // signin | signup | account
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const [snap, setSnap] = React.useState(() => window.AuthService ? window.AuthService.snapshot() : null);
  const [pro, setPro] = React.useState(() => window.ProService ? window.ProService.state() : { pro: false });

  React.useEffect(() => {
    if (!open) return;
    setError('');
    setNote('');
    const signed = window.AuthService && window.AuthService.isSignedIn && window.AuthService.isSignedIn();
    setMode(initialMode || (signed ? 'account' : 'signin'));
    setSnap(window.AuthService ? window.AuthService.snapshot() : null);
    setPro(window.ProService ? window.ProService.state() : { pro: false });
  }, [open, initialMode]);

  React.useEffect(() => {
    if (!window.AuthService) return;
    return window.AuthService.onAuth(() => setSnap(window.AuthService.snapshot()));
  }, []);

  React.useEffect(() => {
    if (!window.ProService) return;
    return window.ProService.onChange(s => setPro(s));
  }, []);

  const run = async (fn) => {
    setBusy(true); setError(''); setNote('');
    try {
      await fn();
      setSnap(window.AuthService.snapshot());
      if (window.AuthService.isSignedIn()) setMode('account');
    } catch (e) {
      setError(window.AuthService.friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const upgrade = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      await window.ProService.startCheckout();
    } catch (e) {
      if (e && e.code === 'auth_required') {
        setMode('signin');
        setError('Sign in with email or Google before unlocking Pro.');
      } else {
        setError((e && e.message) || 'Could not start checkout.');
      }
      setBusy(false);
    }
  };

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box', background: '#F6F4EE',
    border: '1.5px solid #E7E3D9', borderRadius: 12, padding: '12px 14px',
    color: '#0E2B20', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif',
    fontSize: 15, outline: 'none',
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'account' ? 'Your Account' : (mode === 'signup' ? 'Create Account' : 'Sign In')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mode === 'account' && snap && !snap.isAnonymous ? (
          <>
            <div style={{ background: '#F6F4EE', border: '1px solid #E7E3D9', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 14, color: '#0E2B20' }}>
                {snap.displayName || snap.email || 'Signed in'}
              </div>
              {snap.email && (
                <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#3F5F4A', marginTop: 4 }}>{snap.email}</div>
              )}
              <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 11, color: '#8A9E8A', marginTop: 6 }}>
                {pro.pro ? '★ PlayPal Pro unlocked' : 'Free plan — upgrade for trips, season cups & career stats'}
              </div>
            </div>

            {!pro.pro ? (
              <div style={{ border: '1px solid #C8A15A', background: 'rgba(200,161,90,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontWeight: 800, fontSize: 15, color: '#0E2B20', letterSpacing: 0.3 }}>
                  PLAYPAL PRO — {window.ProService ? window.ProService.priceDisplay() : '$9.99'} once
                </div>
                <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#3F5F4A', lineHeight: 1.6, marginTop: 6 }}>
                  Multi-round trips, season standings, career stats & export. Never gates scoring during a round.
                </div>
                <Btn onClick={upgrade} variant="green" disabled={busy} style={{ width: '100%', marginTop: 12, fontSize: 14 }}>
                  {busy ? 'STARTING CHECKOUT…' : 'UNLOCK PRO'}
                </Btn>
              </div>
            ) : (
              <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#15803D', lineHeight: 1.5 }}>
                Thanks for supporting PlayPal. Your Pro unlock is tied to this account and restores automatically on sign-in.
              </div>
            )}

            <Btn onClick={() => run(() => window.AuthService.signOut())} variant="ghost" disabled={busy} style={{ width: '100%', fontSize: 13 }}>
              SIGN OUT
            </Btn>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 13, color: '#3F5F4A', lineHeight: 1.6 }}>
              Create an account to sync your group ownership and unlock PlayPal Pro. You can still play as a guest.
            </div>

            <Btn onClick={() => run(() => window.AuthService.signInGoogle())} variant="surface" disabled={busy} style={{ width: '100%', fontSize: 14 }}>
              Continue with Google
            </Btn>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: '#E7E3D9' }} />
              <span style={{ fontSize: 11, color: '#8A9E8A', fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif' }}>OR EMAIL</span>
              <div style={{ flex: 1, height: 1, background: '#E7E3D9' }} />
            </div>

            <div>
              <Label htmlFor="pp-auth-email" style={{ display: 'block', marginBottom: 6 }}>EMAIL</Label>
              <input id="pp-auth-email" type="email" autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)} style={fieldStyle} placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="pp-auth-password" style={{ display: 'block', marginBottom: 6 }}>PASSWORD</Label>
              <input id="pp-auth-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={e => setPassword(e.target.value)} style={fieldStyle} placeholder="••••••••" />
            </div>

            <Btn
              onClick={() => run(() => mode === 'signup'
                ? window.AuthService.signUpEmail(email, password)
                : window.AuthService.signInEmail(email, password))}
              variant="green" disabled={busy || !email.trim() || !password}
              style={{ width: '100%', fontSize: 14 }}>
              {busy ? 'PLEASE WAIT…' : (mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN')}
            </Btn>

            <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3F5F4A', fontSize: 12,
                fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', textDecoration: 'underline', padding: 0 }}>
              {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>

            <div style={{ borderTop: '1px solid #E7E3D9', paddingTop: 12 }}>
              <Btn onClick={() => run(async () => {
                await window.AuthService.continueAsGuest();
                setNote('Playing as guest — you can sign in later to keep Pro and ownership.');
                onClose && onClose();
              })} variant="ghost" disabled={busy} style={{ width: '100%', fontSize: 13 }}>
                CONTINUE AS GUEST
              </Btn>
            </div>
          </>
        )}

        {error && (
          <div role="alert" style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#DC2626', lineHeight: 1.5 }}>{error}</div>
        )}
        {note && (
          <div role="status" style={{ fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif', fontSize: 12, color: '#15803D', lineHeight: 1.5 }}>{note}</div>
        )}
      </div>
    </Modal>
  );
};

if (typeof window !== 'undefined') {
  Object.assign(window, { AuthScreen });
}
