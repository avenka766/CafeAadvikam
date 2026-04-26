import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency, cn } from '@/lib/utils';
import { X, UtensilsCrossed, MapPin, Clock, Leaf, ChevronRight, PartyPopper, MessageCircle } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

const CAFE = {
  name: 'Cafe Aadvikam',
  tagline: 'Restaurant & Party Hall',
  subtitle: 'Authentic Flavours, Timeless Taste',
  venture: 'A Unit of SNB · VRSNB Foods LLP',
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '6 AM – 10 PM Daily',
  type: 'Pure Vegetarian',
  mapsUrl: 'https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9628595,17z/data=!3m1!4b1!4m6!3m5!1s0x3baddf00120caa5f:0x7cf353554e2c66a9!8m2!3d12.808481!4d77.9628595!16s%2Fg%2F11z0zvhx9p',
  waWhatsapp: '917667117803',
  waPretext: 'Hi, I need to enquire and book the Party Hall.',
};

const FOOD_IMAGES = {
  hero:     'https://images.unsplash.com/photo-1630409346617-c1b6fb6dfc9e?w=1200&q=90',
  idly:     'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80',
  dosa:     'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&q=80',
  biryani:  'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
  paneer:   'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
  tandoor:  'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80',
  kids:     'https://images.unsplash.com/photo-1513442542250-854d436a73f2?w=600&q=80',
  soup:     'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80',
  chat:     'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80',
  drinks:   'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=600&q=80',
  dining1:  'https://lh3.googleusercontent.com/gps-cs-s/APNQkAGskRrkDpJXe12ELf7iAG0pJacVjDqWb0aOGd4h_FoNg4yi8Ud8jUBIYkVuFd0U-CZezkURvFbTp91lYqsqRbpf1s_Cl_zaRMtWxZUib15-vrSHYlChBOoAXJhW1VRCUm1LROvOxK6c9O4_=w800-h600-k-no',
  dining2:  'https://lh3.googleusercontent.com/gps-cs-s/APNQkAEbyUHrbpJmJBUVejgvzmi1WtL7Q0xfUdorUxTS_UgyVUYeo4y7OFEy_WhQi7f0wXwCCQ8xtiyiNhEUMdLJ3-sjCUVKGNbuNUV9mZLTHbOGH_ujlZc4bCMqO1RTUFbArg83Mowadj6b3FSW=w800-h1418-k-no',
  dining3:  'https://lh3.googleusercontent.com/gps-cs-s/APNQkAG2jUTFlgbe1HI8gl6jY_RuPB6ssEnrwzSKoJX8NCt5xaXEYY6zU_ggFyimxtrUvbGYUbr5lFFOm-bF1uhPFCh82wtZzBzeDs_mQ5eNxGOCu6YoDCof2b362smO-RiX6ZyTDOo1tLa4K4LH=w800-h1422-k-no',
  partyHall:'https://lh3.googleusercontent.com/gps-cs-s/APNQkAEbyUHrbpJmJBUVejgvzmi1WtL7Q0xfUdorUxTS_UgyVUYeo4y7OFEy_WhQi7f0wXwCCQ8xtiyiNhEUMdLJ3-sjCUVKGNbuNUV9mZLTHbOGH_ujlZc4bCMqO1RTUFbArg83Mowadj6b3FSW=w1200-h2136-k-no',
  south:    'https://images.unsplash.com/photo-1505253758473-96b7015fcd40?w=600&q=80',
};

function getTimePeriod() {
  const now = new Date();
  const h = now.getHours();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (h >= 6 && h < 11)  return { label: '🌅 Breakfast Menu Now Serving · ' + timeStr, id: 'south-indian-breakfast' };
  if (h >= 11 && h < 15) return { label: '☀️ Lunch Menu Now Serving · ' + timeStr, id: 'lunch' };
  if (h >= 15 && h < 19) return { label: '🧆 Evening Snacks Now Serving · ' + timeStr, id: 'evening-snacks' };
  return { label: '🌙 Dinner Menu Now Serving · ' + timeStr, id: 'biriyani' };
}

function TiltCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY; }
    const rx = ((cy - r.top - r.height / 2) / (r.height / 2)) * -10;
    const ry = ((cx - r.left - r.width / 2) / (r.width / 2)) * 10;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.04,1.04,1.04)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'; };
  return (
    <div ref={ref} className={cn('transition-transform duration-200 ease-out cursor-pointer', className)}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onTouchMove={onMove} onTouchEnd={onLeave} onClick={onClick}>
      {children}
    </div>
  );
}

function CategoryDrawer({ catId, onClose }: { catId: string; onClose: () => void }) {
  const { items } = useMenuStore();
  const cat = MENU_CATEGORIES.find(c => c.id === catId);
  const catItems = items.filter(i => i.enabled && i.category === catId);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  if (!cat) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl flex flex-col" style={{ height: '82vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{cat.icon}</span>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">{cat.name}</h2>
              <p className="text-xs font-body text-muted-foreground">{cat.timing}</p>
            </div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"><X className="size-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {catItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40"><p className="text-3xl mb-2">🍽️</p><p className="text-sm font-body text-muted-foreground">No items available right now</p></div>
          ) : catItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" className="size-13 rounded-xl object-cover shrink-0 border border-border" />
                  : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-xl">{cat.icon}</div>}
                <div className="min-w-0">
                  <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
                  <span className="text-[9px] font-body px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">🌿 VEG</span>
                </div>
              </div>
              <span className="text-sm font-body font-bold text-primary shrink-0 ml-3">{formatCurrency(item.price)}</span>
            </div>
          ))}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

function MenuPopup({ onClose }: { onClose: () => void }) {
  const { items } = useMenuStore();
  const [sel, setSel] = useState('all');
  const enabled = useMemo(() => items.filter(i => i.enabled), [items]);
  const activeCats = useMemo(() => MENU_CATEGORIES.filter(c => enabled.some(i => i.category === c.id)), [enabled]);
  const display = useMemo(() => sel === 'all' ? activeCats : activeCats.filter(c => c.id === sel), [sel, activeCats]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div><h2 className="font-display text-xl font-bold text-foreground">Full Menu</h2><p className="text-xs font-body text-muted-foreground">Pure vegetarian · {enabled.length} items</p></div>
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"><X className="size-5 text-muted-foreground" /></button>
        </div>
        <div className="shrink-0 border-b border-border">
          <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
            <button onClick={() => setSel('all')} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', sel === 'all' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>All Items</button>
            {activeCats.map(c => (
              <button key={c.id} onClick={() => setSel(c.id)} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', sel === c.id ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>{c.icon} {c.name}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {display.map(cat => {
            const ci = enabled.filter(i => i.category === cat.id);
            if (!ci.length) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <span className="text-xl">{cat.icon}</span>
                  <div><h3 className="font-display text-lg font-bold text-foreground">{cat.name}</h3><p className="text-[10px] font-body text-muted-foreground">{cat.timing}</p></div>
                </div>
                {ci.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" /> : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-lg">{cat.icon}</div>}
                      <span className="text-sm font-body text-foreground">{item.name}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-3 gap-1">
                      <span className="text-sm font-body font-bold text-primary tabular-nums">{formatCurrency(item.price)}</span>
                      <span className="text-[9px] font-body px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">VEG</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

function PartyHallViewer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <img src={FOOD_IMAGES.partyHall} alt="Party Hall" className="w-full h-full object-contain" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 size-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <X className="size-5 text-white" />
      </button>
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-white/50 text-xs font-body">Tap anywhere to close</p>
      </div>
    </div>
  );
}

const SPECIALTY_CARDS = [
  { cat: 'South Indian Breakfast', catId: 'south-indian-breakfast', emoji: '🍳', img: FOOD_IMAGES.idly,    featured: [{ name: 'Idly (2pc)', price: 39 }, { name: 'Masala Dosa', price: 69 }, { name: 'Ghee Pongal', price: 89 }], timing: '7 AM – 11 AM',    bg: 'from-amber-900/90 to-orange-950/95', accent: '#F4A23A' },
  { cat: 'Tandoori Starters',      catId: 'tandoori-starters',      emoji: '🔥', img: FOOD_IMAGES.tandoor, featured: [{ name: 'Paneer Tikka', price: 140 }, { name: 'Malai Paneer', price: 140 }, { name: 'Tandoori Platter', price: 190 }], timing: '12–3 PM & 7–10 PM', bg: 'from-red-900/90 to-rose-950/95', accent: '#F87171' },
  { cat: 'Biriyani',               catId: 'biriyani',               emoji: '🍚', img: FOOD_IMAGES.biryani, featured: [{ name: 'Handi Biriyani', price: 169 }, { name: 'Paneer Tikka Biryani', price: 200 }, { name: 'Veg Biriyani', price: 140 }], timing: '12–3 PM & 7–10 PM', bg: 'from-yellow-900/90 to-amber-950/95', accent: '#FCD34D' },
  { cat: 'Kids Menu',              catId: 'kids-menu',              emoji: '🍔', img: FOOD_IMAGES.kids,    featured: [{ name: 'Veg Burger', price: 70 }, { name: 'Pizza', price: 99 }, { name: 'French Fries', price: 70 }], timing: '11 AM – 10 PM', bg: 'from-purple-900/90 to-violet-950/95', accent: '#C084FC' },
];

function HeroBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      el.style.transform = `translate(${x}px, ${y}px) scale(1.08)`;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={ref} className="absolute inset-[-4%] transition-transform duration-700 ease-out" style={{ willChange: 'transform' }}>
        <img src={FOOD_IMAGES.hero} alt="Authentic South Indian Food" className="w-full h-full object-cover object-center" />
      </div>
      <div className="absolute inset-0 opacity-8" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='50' cy='50' r='40' stroke='%23FFD700' stroke-width='0.8' fill='none' opacity='0.5'/%3E%3Ccircle cx='50' cy='50' r='25' stroke='%23FFD700' stroke-width='0.5' fill='none' opacity='0.4'/%3E%3C/svg%3E")`,
        backgroundSize: '100px 100px',
      }} />
    </div>
  );
}

function FloatingSpiceDots() {
  const dots = [
    { size: 8,  color: '#E07A3A', left: '8%',  top: '15%', delay: '0s',   dur: '4s' },
    { size: 12, color: '#FFD700', left: '82%', top: '12%', delay: '0.8s', dur: '5s' },
    { size: 6,  color: '#4CAF50', left: '20%', top: '60%', delay: '1.5s', dur: '3.5s' },
    { size: 10, color: '#C84B0A', left: '75%', top: '55%', delay: '0.3s', dur: '4.5s' },
    { size: 7,  color: '#D4A843', left: '55%', top: '25%', delay: '2s',   dur: '3.8s' },
    { size: 9,  color: '#8B4513', left: '40%', top: '78%', delay: '1.2s', dur: '5.2s' },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: d.size, height: d.size, background: d.color, opacity: 0.45,
          left: d.left, top: d.top,
          animation: `spiceDrift ${d.dur} ${d.delay} ease-in-out infinite alternate`,
          boxShadow: `0 0 ${d.size * 2}px ${d.color}88`,
        }} />
      ))}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();
  const [showMenu, setShowMenu] = useState(false);
  const [drawerCat, setDrawerCat] = useState<string | null>(null);
  const [partyFullscreen, setPartyFullscreen] = useState(false);
  const [timePeriod] = useState(getTimePeriod);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  if (currentUser) {
    const path = currentUser.role === 'order_taker' ? '/order-pad' : currentUser.role === 'admin' ? '/admin-dashboard' : '/billing';
    navigate(path, { replace: true }); return null;
  }

  const bookPartyHall = () => {
    window.open(`https://wa.me/${CAFE.waWhatsapp}?text=${encodeURIComponent(CAFE.waPretext)}`, '_blank');
  };

  const openDirections = () => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      window.open(`maps://maps.apple.com/?daddr=12.808481,77.9628595&q=Cafe+Aadvikam`, '_blank');
    } else if (/android/.test(ua)) {
      window.open(`geo:12.808481,77.9628595?q=12.808481,77.9628595(Cafe+Aadvikam)`, '_blank');
    } else {
      window.open(CAFE.mapsUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-background pt-14 overflow-x-hidden">
      <style>{`
        @keyframes spiceDrift {
          from { transform: translateY(0px) rotate(0deg); }
          to   { transform: translateY(-18px) rotate(15deg); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 16px rgba(255,215,0,0.25); }
          50%       { box-shadow: 0 0 32px rgba(255,215,0,0.55); }
        }
        .snb-badge {
          background: linear-gradient(90deg, #b8860b, #ffd700, #daa520, #ffd700, #b8860b);
          background-size: 200% auto;
          animation: shimmer 2.5s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-weight: 900;
        }
        .hero-content  { animation: fadeSlideUp 0.8s ease-out both; }
        .hero-c-d1     { animation: fadeSlideUp 0.8s 0.15s ease-out both; }
        .hero-c-d2     { animation: fadeSlideUp 0.8s 0.30s ease-out both; }
        .hero-c-d3     { animation: fadeSlideUp 0.8s 0.45s ease-out both; }
        .time-badge    { animation: pulseGlow 2s ease-in-out infinite; }
      `}</style>

      {/* ═══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden" style={{ height: '92vh', minHeight: 560 }}>
        <HeroBackground />
        <FloatingSpiceDots />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(170deg, rgba(0,0,0,0.1) 0%, rgba(20,8,0,0.45) 38%, rgba(10,4,0,0.86) 72%, rgba(5,2,0,0.97) 100%)'
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(5,2,0,0.5) 100%)'
        }} />

        <div className="relative h-full flex flex-col justify-end px-5 pb-10">
          {/* Time badge */}
          <div className="mb-4 hero-content">
            <span className="time-badge inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-body font-bold tracking-wide"
              style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
              {timePeriod.label}
            </span>
          </div>

          {/* Logo + SNB Since 1988 */}
          <div className="flex items-center gap-3 mb-4 hero-c-d1">
            <img src={cafeLogo} alt="logo" className="size-16 rounded-2xl border-2 object-cover shadow-2xl" style={{ borderColor: 'rgba(255,215,0,0.4)' }} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="snb-badge text-xl tracking-tight">SNB</span>
                <span className="text-white/40 text-xs">·</span>
                <span className="font-body font-extrabold text-sm px-2.5 py-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#1a0a00', letterSpacing: '0.02em' }}>
                  Since 1988
                </span>
              </div>
              <p className="text-white/45 font-body text-[10px] uppercase tracking-widest">VRSNB Foods LLP</p>
            </div>
          </div>

          {/* Name */}
          <div className="hero-c-d2 mb-3">
            <h1 className="font-display font-bold text-white leading-[0.92] drop-shadow-2xl" style={{ fontSize: 'clamp(46px, 12vw, 68px)' }}>
              Cafe<br />
              <span style={{ color: '#FFD700', textShadow: '0 0 40px rgba(255,215,0,0.4)' }}>Aadvikam</span>
            </h1>
            <p className="font-display text-base italic mt-2 drop-shadow" style={{ color: '#F4A23A' }}>Authentic Flavours, Timeless Taste</p>
            <p className="font-body text-xs text-white/45 mt-1">🌿 Pure Vegetarian · Restaurant &amp; Party Hall</p>
          </div>

          {/* Hours + location */}
          <div className="flex items-center gap-3 mb-6 hero-c-d2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span className="flex items-center gap-1.5 text-xs font-body"><Clock className="size-3.5" />{CAFE.hours}</span>
            <span className="text-white/25">·</span>
            <span className="flex items-center gap-1.5 text-xs font-body"><MapPin className="size-3.5" />Berikai, Hosur</span>
          </div>

          {/* CTAs */}
          <div className="flex gap-3 hero-c-d3">
            <button onClick={() => setShowMenu(true)}
              className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 24px rgba(224,122,58,0.5)' }}>
              <UtensilsCrossed className="size-4" />View Menu
            </button>
            <button onClick={openDirections}
              className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border"
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)', color: 'white', backdropFilter: 'blur(10px)' }}>
              <MapPin className="size-4" />Get Directions
            </button>
          </div>
        </div>
      </section>

      {/* ═══ INFO STRIP ════════════════════════════════════════════════════════ */}
      <section className="bg-primary text-primary-foreground px-5 py-4">
        <div className="grid grid-cols-2 gap-2 text-sm font-body">
          <div className="flex items-center gap-2"><Clock className="size-4 opacity-80" /><span className="font-semibold text-xs">{CAFE.hours}</span></div>
          <div className="flex items-center gap-2"><Leaf className="size-4 opacity-80" /><span className="text-xs">{CAFE.type}</span></div>
          <div className="flex items-center gap-2 col-span-2"><MapPin className="size-4 opacity-80 shrink-0" /><span className="text-xs">{CAFE.address}</span></div>
        </div>
      </section>

      {/* ═══ FOOD PHOTO STRIP ══════════════════════════════════════════════════ */}
      <section className="py-6 overflow-hidden">
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
          {[
            { img: FOOD_IMAGES.idly,    label: 'South Indian' },
            { img: FOOD_IMAGES.biryani, label: 'Biriyani' },
            { img: FOOD_IMAGES.tandoor, label: 'Tandoori' },
            { img: FOOD_IMAGES.paneer,  label: 'North Indian' },
            { img: FOOD_IMAGES.chat,    label: 'Chats' },
            { img: FOOD_IMAGES.drinks,  label: 'Beverages' },
          ].map(({ img, label }) => (
            <div key={label} className="shrink-0 relative rounded-2xl overflow-hidden shadow-md" style={{ width: 130, height: 160 }}>
              <img src={img} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)' }} />
              <p className="absolute bottom-2 left-0 right-0 text-center text-white font-body font-bold text-[11px]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SPECIALTY CARDS ═══════════════════════════════════════════════════ */}
      <section className="px-4 py-6">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-bold text-foreground">Specialty Menu</h2>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Tap a card to see all items in that category</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SPECIALTY_CARDS.map(card => (
            <TiltCard key={card.cat} onClick={() => setDrawerCat(card.catId)}>
              <div className="relative rounded-2xl overflow-hidden" style={{ height: 200, transformStyle: 'preserve-3d' }}>
                <img src={card.img} alt={card.cat} className="absolute inset-0 w-full h-full object-cover" />
                <div className={cn('absolute inset-0 bg-gradient-to-t', card.bg)} />
                <div className="relative h-full flex flex-col justify-between p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>{card.emoji}</span>
                    <span className="text-[9px] font-body font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(4px)', border: '0.5px solid rgba(255,255,255,0.2)' }}>
                      {card.timing}
                    </span>
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold text-white mb-1.5 drop-shadow">{card.cat}</p>
                    <div className="space-y-0.5">
                      {card.featured.map(f => (
                        <div key={f.name} className="flex items-center justify-between">
                          <span className="text-[10px] font-body text-white/80 truncate pr-1">{f.name}</span>
                          <span className="text-[10px] font-body font-bold shrink-0" style={{ color: card.accent }}>₹{f.price}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-white/60">
                      <span className="text-[9px] font-body">Tap to see all</span>
                      <ChevronRight className="size-3" />
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* ═══ OUR AMBIANCE — no Browse Full Menu button ═════════════════════════ */}
      <section className="px-4 py-4">
        <h2 className="font-display text-2xl font-bold text-foreground mb-4">Our Ambiance</h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl overflow-hidden" style={{ height: 180 }}>
            <img src={FOOD_IMAGES.dining1} alt="Dining" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl overflow-hidden flex-1">
              <img src={FOOD_IMAGES.dining2} alt="Dining" className="w-full h-full object-cover" />
            </div>
            <div className="rounded-2xl overflow-hidden flex-1">
              <img src={FOOD_IMAGES.dining3} alt="Dining" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
        {/* Browse Full Menu button removed */}
      </section>

      {/* ═══ WHY CAFE AADVIKAM ══════════════════════════════════════════════════ */}
      <section className="px-5 py-10 text-center bg-card border-y border-border">
        <div className="flex flex-col items-center gap-4">
          <img src={cafeLogo} alt="logo" className="size-16 rounded-2xl object-cover border-2 border-border shadow-md" />
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Why Cafe Aadvikam?</h2>
            <p className="text-xs font-body text-muted-foreground mt-1">VRSNB Foods LLP · A Unit of <strong>SNB</strong> · Since 1988</p>
          </div>
          <p className="text-sm font-body text-muted-foreground leading-relaxed max-w-xs">
            Experience the perfect blend of traditional flavours and modern ambiance. From classic South Indian breakfast to aromatic biriyani, every dish is crafted with care, hygiene, and premium quality ingredients.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[['🌿','Pure Vegetarian'],['✨','Fresh Ingredients'],['🛡️','Hygienic Kitchen'],['😊','Friendly Service'],['🅿️','Ample Parking'],['🎉','Party Hall']].map(([icon, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-body font-semibold">{icon} {label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PARTY HALL ════════════════════════════════════════════════════════ */}
      <section className="px-4 py-8">
        <div className="flex items-center gap-2 mb-2">
          <PartyPopper className="size-5 text-primary" />
          <h2 className="font-display text-2xl font-bold text-foreground">Party Hall</h2>
        </div>
        <p className="text-sm font-body text-muted-foreground mb-4">Perfect for birthdays, family gatherings &amp; corporate events. Tap to view in full.</p>

        {/* Tapping opens fullscreen image viewer */}
        <div className="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all shadow-xl border border-border"
          style={{ height: 220 }}
          onClick={() => setPartyFullscreen(true)}>
          <img src={FOOD_IMAGES.partyHall} alt="Party Hall" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%)' }} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full font-body text-xs font-bold whitespace-nowrap"
            style={{ background: 'rgba(255,215,0,0.9)', color: '#1a0a00' }}>🎉 PARTY HALL AVAILABLE</div>
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-white font-display text-lg font-bold">Celebrate with Us</p>
            <p className="text-white/70 font-body text-xs mt-0.5">Spacious hall · Ample parking · 6 AM – 10 PM</p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="px-5 py-2.5 rounded-xl font-body text-sm font-semibold text-white flex items-center gap-2"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              Tap to explore <ChevronRight className="size-4" />
            </div>
          </div>
        </div>

        <button onClick={bookPartyHall}
          className="mt-4 w-full py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg"
          style={{ background: 'linear-gradient(135deg,#0F6E56,#1D9E75)', color: 'white', boxShadow: '0 4px 20px rgba(15,110,86,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg,#B8860B,#FFD700)'; e.currentTarget.style.color = '#1a0a00'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg,#0F6E56,#1D9E75)'; e.currentTarget.style.color = 'white'; }}>
          <MessageCircle className="size-4" />
          Book Party Hall via WhatsApp
          <ChevronRight className="size-4" />
        </button>
        <p className="text-center text-[10px] font-body text-muted-foreground mt-2">Opens WhatsApp with pre-filled message</p>
      </section>

      {/* ═══ FROM OUR KITCHEN — images matched to names ═════════════════════════ */}
      <section className="pb-8">
        <div className="px-4 mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-foreground">From Our Kitchen</h2>
          <button onClick={() => setShowMenu(true)} className="text-xs font-body font-semibold text-primary flex items-center gap-1">View All <ChevronRight className="size-3" /></button>
        </div>
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
          {[
            { img: FOOD_IMAGES.dosa,    label: 'Masala Dosa ₹69' },
            { img: FOOD_IMAGES.paneer,  label: 'Paneer Tikka Masala ₹170' },
            { img: FOOD_IMAGES.soup,    label: 'Tomato Soup ₹59' },
            { img: FOOD_IMAGES.biryani, label: 'Handi Biriyani ₹169' },
            { img: FOOD_IMAGES.south,   label: 'South Indian Thali' },
          ].map(({ img, label }) => (
            <div key={label} className="shrink-0 relative rounded-2xl overflow-hidden shadow-md" style={{ width: 150, height: 180 }}>
              <img src={img} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)' }} />
              <p className="absolute bottom-2.5 left-2 right-2 text-white font-body font-semibold text-[10px] leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer className="bg-foreground text-primary-foreground px-5 py-8 text-center">
        <img src={cafeLogo} alt="logo" className="size-12 rounded-xl object-cover mx-auto mb-3 border border-white/20" />
        <p className="font-display text-lg font-bold text-white mb-0.5">{CAFE.name}</p>
        <p className="text-[10px] font-body font-bold mb-1" style={{ color: '#FFD700' }}>SNB · Since 1988</p>
        <p className="text-xs font-body text-white/60 mb-3">{CAFE.address}</p>
        <div className="flex gap-3 justify-center mb-5">
          <button onClick={openDirections}
            className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70">
            <MapPin className="size-3" />Directions
          </button>
          <button onClick={bookPartyHall} className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><MessageCircle className="size-3" />Book Hall</button>
        </div>
        <button onClick={() => navigate('/login')} className="text-xs font-body font-semibold text-white/50 underline underline-offset-4 mb-4 active:opacity-70">Staff Login</button>
        <p className="text-[10px] font-body text-white/30">© 2025 Cafe Aadvikam · VRSNB Foods LLP</p>
      </footer>

      {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
      {drawerCat && <CategoryDrawer catId={drawerCat} onClose={() => setDrawerCat(null)} />}
      {partyFullscreen && <PartyHallViewer onClose={() => setPartyFullscreen(false)} />}
    </div>
  );
}
