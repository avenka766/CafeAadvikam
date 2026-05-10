import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Eye, EyeOff, Loader2, AlertCircle, Lock, User } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

const HERO = 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=85';

export default function Login() {
  const { login, currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);

  if (currentUser) {
    const path =
      currentUser.role === 'order_taker'  ? '/order-pad'
      : currentUser.role === 'admin'      ? '/admin-dashboard'
      : currentUser.role === 'kitchen'    ? '/kitchen'
      : currentUser.role === 'order_receiver' ? '/bakery/receive'
      : currentUser.role === 'store'      ? '/bakery/store'
      : currentUser.role === 'baker'      ? '/bakery/baker'
      : currentUser.role === 'packing'    ? '/bakery/packing'
      : currentUser.role === 'branch_vrsnb' ? '/branch/vrsnb'
      : currentUser.role === 'branch_snb' ? '/branch/snb'
      : currentUser.role === 'branch_hosur' ? '/branch/hosur'
      : '/billing';
    return <Navigate to={path} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Please enter both username and password'); return; }
    setLoading(true);
    const ok = await login(username.trim(), password);
    if (ok) {
      const user = useAuthStore.getState().currentUser;
      const path =
        user?.role === 'admin'           ? '/admin-dashboard'
        : user?.role === 'order_taker'   ? '/order-pad'
        : user?.role === 'kitchen'       ? '/kitchen'
        : user?.role === 'order_receiver' ? '/bakery/receive'
        : user?.role === 'store'         ? '/bakery/store'
        : user?.role === 'baker'         ? '/bakery/baker'
        : user?.role === 'packing'       ? '/bakery/packing'
        : user?.role === 'branch_vrsnb'  ? '/branch/vrsnb'
        : user?.role === 'branch_snb'    ? '/branch/snb'
        : user?.role === 'branch_hosur'  ? '/branch/hosur'
        : '/billing';
      navigate(path, { replace: true });
    } else {
      setError('Invalid username or password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">

      {/* ── Full-screen hero background ── */}
      <div className="absolute inset-0">
        <img src={HERO} alt="" className="w-full h-full object-cover" />
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
              disabled={loading}
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
