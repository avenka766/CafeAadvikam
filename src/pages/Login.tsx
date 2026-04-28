import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { CAFE_CONFIG } from '@/constants/config';
import { Leaf, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (currentUser) {
    const path = currentUser.role === 'order_taker' ? '/order-pad'
      : currentUser.role === 'admin' ? '/admin-dashboard'
      : currentUser.role === 'kitchen' ? '/kitchen' : '/billing';
    navigate(path, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Please enter both username and password'); return; }
    setLoading(true);
    const ok = await login(username.trim(), password);
    if (ok) {
      const user = useAuthStore.getState().currentUser;
      const path = user?.role === 'admin' ? '/admin-dashboard'
        : user?.role === 'order_taker' ? '/order-pad'
        : user?.role === 'kitchen' ? '/kitchen'
        : '/billing';
      navigate(path, { replace: true });
    } else {
      setError('Invalid username or password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="size-16 rounded-2xl cafe-gradient flex items-center justify-center mb-4 shadow-lg">
          <Leaf className="size-8 text-primary-foreground" />
        </div>
        <h1 className="font-display text-3xl font-bold text-foreground text-center">{CAFE_CONFIG.name}</h1>
        <p className="font-display text-base text-muted-foreground italic mt-0.5">{CAFE_CONFIG.tagline}</p>
        <p className="text-xs font-body text-muted-foreground mt-1.5">{CAFE_CONFIG.address}</p>

        <div className="w-full max-w-sm mt-8 space-y-2">
          <h2 className="font-display text-xl font-bold text-foreground">Staff Login</h2>
          <p className="text-sm font-body text-muted-foreground mb-4">Sign in to access your dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="size-4 text-destructive shrink-0" />
                <span className="text-sm font-body text-destructive">{error}</span>
              </div>
            )}
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="off" autoComplete="username" className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full px-4 py-3 pr-11 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Toggle password">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg disabled:opacity-60">
              {loading ? <><Loader2 className="size-4 animate-spin" />Signing in...</> : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-xs font-body text-muted-foreground">VRSNB Foods LLP • {CAFE_CONFIG.type}</p>
      </div>
    </div>
  );
}
