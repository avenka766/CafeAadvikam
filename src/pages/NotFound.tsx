import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    console.error('404: ', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      {/* Decorative circle */}
      <div className="relative mb-8">
        <div className="size-32 rounded-full flex items-center justify-center animate-float"
          style={{ background: 'linear-gradient(135deg, hsl(164 52% 26% / 0.12), hsl(34 80% 52% / 0.08))', border: '2px solid hsl(var(--border))' }}>
          <img src={cafeLogo} alt="logo" className="size-16 rounded-2xl object-cover" />
        </div>
        <div className="absolute -bottom-2 -right-2 size-12 rounded-2xl flex items-center justify-center font-display font-black text-xl"
          style={{ background: 'linear-gradient(135deg, hsl(164 52% 26%), hsl(164 52% 18%))', color: 'white' }}>
          404
        </div>
      </div>

      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Page not found</h1>
      <p className="font-body text-muted-foreground text-sm max-w-xs mb-8">
        Looks like this dish isn't on our menu. The page you're looking for doesn't exist.
      </p>
      <p className="font-mono text-xs text-muted-foreground/60 bg-muted px-3 py-1.5 rounded-lg mb-8">
        {location.pathname}
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn-ghost"
        >
          <ArrowLeft className="size-4" />
          Go Back
        </button>
        <button
          onClick={() => navigate('/')}
          className="btn-primary"
        >
          <Home className="size-4" />
          Home
        </button>
      </div>
    </div>
  );
}
