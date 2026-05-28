import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getRoleDefaultPath } from '@/lib/routing';
import { Eye, EyeOff, Loader2, AlertCircle, Lock, User } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

const HERO     = 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=85';
// PERF-04: smaller variants so mobile doesn't download the full 1200px image
const HERO_400 = 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=75&fm=webp';
const HERO_800 = 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&fm=webp';

export default function Login() {
  const { login, currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);

  // C-03 FIX: client-side brute-force protection.
  // After MAX_ATTEMPTS failures the form locks for LOCKOUT_MS (15 min).
  // Between failures, an exponential back-off delay is applied so rapid
  // retries are throttled even before full lockout.
  const MAX_ATTEMPTS  = 5;
  const LOCKOUT_MS    = 15 * 60 * 1000;
  const [failCount,   setFailCount]   = useState(0);
  const [lockUntil,   setLockUntil]   = useState<number | null>(null);
  const [backoffMs,   setBackoffMs]   = useState(0);

  const nowLocked         = lockUntil !== null && Date.now() < lockUntil;
  const remainingSecs     = nowLocked ? Math.ceil((lockUntil! - Date.now()) / 1000) : 0;
  const remainingMins     = Math.ceil(remainingSecs / 60);

  if (currentUser) {
    return <Navigate to={getRoleDefaultPath(currentUser.role)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Please enter both username and password'); return; }

    // C-03: reject immediately if locked out
    if (nowLocked) {
      setError(`Too many failed attempts. Try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}.`);
      return;
    }

    // C-03: apply exponential back-off delay between retries
    if (backoffMs > 0) {
      setLoading(true);
      await new Promise(r => setTimeout(r, backoffMs));
    }

    setLoading(true);
    const ok = await login(username.trim(), password);
    if (ok) {
      // Reset all rate-limit counters on success
      setFailCount(0); setLockUntil(null); setBackoffMs(0);
      const user = useAuthStore.getState().currentUser;
      navigate(user ? getRoleDefaultPath(user.role) : '/billing', { replace: true });
    } else {
      const newCount = failCount + 1;
      setFailCount(newCount);
      if (newCount >= MAX_ATTEMPTS) {
        setLockUntil(Date.now() + LOCKOUT_MS);
        setError('Too many failed attempts. Account locked for 15 minutes.');
      } else {
        // 1 s → 2 s → 4 s → 8 s … capped at 30 s
        const delay = Math.min(Math.pow(2, newCount - 1) * 1000, 30_000);
        setBackoffMs(delay);
        const left = MAX_ATTEMPTS - newCount;
        setError(`Invalid username or password. ${left} attempt${left !== 1 ? 's' : ''} remaining.`);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">

      {/* ── Full-screen hero background ── */}
      <div className="absolute inset-0">
        <img
          src={HERO}
          srcSet={`${HERO_400} 400w, ${HERO_800} 800w, ${HERO} 1200w`}
          sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(160deg, rgba(6,20,14,0.85) 0%, rgba(20,10,4,0.78) 50%, rgba(6,20,14,0.92) 100%)'
        }} />
        {/* Decorative blur orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20 animate-float"
          style={{ background: 'radial-gradient(circle, hsl(164 52% 38%), transparent)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-15 animate-float delay-300"
          style={{ background: 'radial-gradient(circle, hsl(34 80% 52%), transparent)', filter: 'blur(50px)' }} />
      </div>

      {/* ── Login card ── */}
      <div className="relative z-10 w-full max-w-sm mx-4 animate-scale-in">
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(32px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(32px) saturate(1.5)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-8 animate-fade-up">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl"
                style={{ background: 'hsl(34 80% 52% / 0.3)', filter: 'blur(16px)', transform: 'scale(1.2)' }} />
              <img src={cafeLogo} alt="Cafe Aadvikam" className="relative size-20 rounded-2xl object-cover border-2"
                style={{ borderColor: 'rgba(255,255,255,0.25)' }} />
            </div>
            <h1 className="font-display text-3xl font-bold text-white">Staff Login</h1>
            <p className="text-sm font-body text-white/55 mt-1 text-center">
              Cafe Aadvikam · VRSNB Foods LLP
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl animate-fade-up"
                style={{ background: 'rgba(220,38,38,0.18)', border: '1px solid rgba(220,38,38,0.35)' }}>
                <AlertCircle className="size-4 text-red-300 shrink-0" />
                <span className="text-sm font-body text-red-200">{error}</span>
              </div>
            )}

            {/* Username */}
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="off"
                autoComplete="username"
                className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-body text-white placeholder:text-white/35 focus:outline-none focus:ring-2 transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  caretColor: 'white',
                }}
                onFocus={e => (e.target.style.border = '1px solid rgba(255,255,255,0.4)')}
                onBlur={e => (e.target.style.border = '1px solid rgba(255,255,255,0.14)')}
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-11 pr-12 py-3.5 rounded-xl text-sm font-body text-white placeholder:text-white/35 focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  caretColor: 'white',
                }}
                onFocus={e => (e.target.style.border = '1px solid rgba(255,255,255,0.4)')}
                onBlur={e => (e.target.style.border = '1px solid rgba(255,255,255,0.14)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                aria-label="Toggle password"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || nowLocked}
              className="w-full py-4 rounded-xl font-body font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.97] mt-2"
              style={{
                background: loading
                  ? 'rgba(255,255,255,0.12)'
                  : 'linear-gradient(135deg, hsl(164 52% 38%), hsl(164 52% 28%))',
                color: 'white',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(30,120,90,0.45)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {loading ? <><Loader2 className="size-4 animate-spin" />Signing in…</> : 'Sign In'}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-center text-xs font-body mt-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Pure Vegetarian · Restaurant &amp; Bakery
          </p>
        </div>
      </div>
    </div>
  );
}
