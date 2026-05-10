import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { useVenueStore } from '@/stores/venueStore';
import { useBakeryItemsStore } from '@/bakery/bakeryItemsStore';
import { MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency, cn } from '@/lib/utils';
import { X, UtensilsCrossed, MapPin, Clock, Leaf, ChevronRight, PartyPopper, MessageCircle, Phone, Star, Send, SmilePlus } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';
import ChatBot from '@/components/features/ChatBot';


// ─── Scroll Reveal Hook ───────────────────────────────────────────────────────
function useScrollReveal<T extends HTMLElement>(options: { threshold?: number } = {}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.dataset.visible = 'true'; obs.disconnect(); } },
      { threshold: options.threshold ?? 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const CAFE = {
  name: 'Cafe Aadvikam', address: '109 Bagalur Main Road, Berikai 635105',
  hours: '6 AM – 10 PM Daily', type: 'Pure Vegetarian',
  mapsUrl: 'https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9628595,17z',
  waWhatsapp: '918883122246', waPretext: 'Hi, I need to enquire and book the Party Hall.',
};
const BAKERY = {
  name: 'SNB Bakery', tagline: 'Sri Nanjundeshwara Bakery',
  since: '1988', address: 'Berigai, Hosur',
  phone: '+91 9443388257', website: 'https://www.snbbakery.in',
  waPhone: '919443388257',
  about: 'Mr. Venugopal\'s father started Sri Nanjundeshwara Bakery (SNB) in 1988. Over 36 years of serving unforgettable melting sweets, cookies, cakes and the most exquisite savouries.',
  logo: 'https://www.snbbakery.in/img/SNB.png',
};


const FOOD_IMAGES = {
  hero: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=90',
  idly: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80',
  dosa: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&q=80',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
  paneer: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
  tandoor: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80',
  kids: 'https://images.unsplash.com/photo-1513442542250-854d436a73f2?w=600&q=80',
  soup: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80',
  south: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80',
  partyHall: '/party-hall.jpg',
  partyHallExtra: 'https://lh3.googleusercontent.com/gps-cs-s/APNQkAEbyUHrbpJmJBUVejgvzmi1WtL7Q0xfUdorUxTS_UgyVUYeo4y7OFEy_WhQi7f0wXwCCQ8xtiyiNhEUMdLJ3-sjCUVKGNbuNUV9mZLTHbOGH_ujlZc4bCMqO1RTUFbArg83Mowadj6b3FSW=w1200-h2136-k-no',
};
function getTimePeriod() {
  const now = new Date(); const h = now.getHours();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (h >= 6  && h < 11) return { label: '🌅 Breakfast Menu Now Serving · ' + timeStr, id: 'south-indian-breakfast' };
  if (h >= 11 && h < 15) return { label: '☀️ Lunch Menu Now Serving · ' + timeStr, id: 'lunch' };
  if (h >= 15 && h < 19) return { label: '🧆 Evening Snacks Now Serving · ' + timeStr, id: 'evening-snacks' };
  if (h >= 19 && h < 22) return { label: '🌙 Dinner Menu Now Serving · ' + timeStr, id: 'biriyani' };
  return null; // Outside 6 AM – 10 PM, show nothing
}

// ─── 3D Tilt Card ─────────────────────────────────────────────────────────────
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
  const onLeave = () => { if (ref.current) ref.current.style.transform = 'perspective(900px) rotateX(0) rotateY(0) scale3d(1,1,1)'; };
  return (
    <div ref={ref} className={cn('transition-transform duration-200 ease-out cursor-pointer', className)}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      onMouseMove={onMove} onMouseLeave={onLeave} onTouchMove={onMove} onTouchEnd={onLeave} onClick={onClick}>
      {children}
    </div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-3"><span className="text-3xl">{cat.icon}</span><div><h2 className="font-display text-xl font-bold text-foreground">{cat.name}</h2><p className="text-xs font-body text-muted-foreground">{cat.timing}</p></div></div>
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"><X className="size-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {catItems.length === 0 ? <div className="flex flex-col items-center justify-center h-40"><p className="text-3xl mb-2">🍽️</p><p className="text-sm font-body text-muted-foreground">No items available right now</p></div>
            : catItems.map(item => (
              <div key={item.id} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" /> : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-xl">{cat.icon}</div>}
                  <div className="min-w-0"><p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p><span className="text-[9px] font-body px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">🌿 VEG</span></div>
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
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90"><X className="size-5 text-muted-foreground" /></button>
        </div>
        <div className="shrink-0 border-b border-border">
          <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
            <button onClick={() => setSel('all')} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', sel === 'all' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>All Items</button>
            {activeCats.map(c => <button key={c.id} onClick={() => setSel(c.id)} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', sel === c.id ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>{c.icon} {c.name}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {display.map(cat => { const ci = enabled.filter(i => i.category === cat.id); if (!ci.length) return null; return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border"><span className="text-xl">{cat.icon}</span><div><h3 className="font-display text-lg font-bold text-foreground">{cat.name}</h3><p className="text-[10px] font-body text-muted-foreground">{cat.timing}</p></div></div>
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
          ); })}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
function PartyHallViewer({ onClose }: { onClose: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const IMAGES = [
    { src: FOOD_IMAGES.partyHall,      label: 'Cafe Aadvikam — Front View' },
    { src: FOOD_IMAGES.partyHallExtra, label: 'Party Hall — Interior' },
  ];
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={onClose}>
      {/* Main image */}
      <div className="flex-1 flex items-center justify-center" onClick={onClose}>
        <img
          src={IMAGES[activeIdx].src}
          alt={IMAGES[activeIdx].label}
          className="max-w-full max-h-full object-contain"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Caption */}
      <p className="text-center text-white/60 text-xs font-body pb-1 pt-1">{IMAGES[activeIdx].label}</p>

      {/* Thumbnail strip */}
      <div className="flex justify-center gap-3 pb-8 pt-2" onClick={e => e.stopPropagation()}>
        {IMAGES.map((img, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className="relative rounded-xl overflow-hidden border-2 transition-all"
            style={{ width: 72, height: 52, borderColor: activeIdx === i ? '#FFD700' : 'rgba(255,255,255,0.2)' }}
          >
            <img src={img.src} alt={img.label} className="w-full h-full object-cover" />
            {activeIdx !== i && <div className="absolute inset-0 bg-black/40" />}
          </button>
        ))}
      </div>

      {/* Close button */}
      <button onClick={onClose} className="absolute top-4 right-4 size-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <X className="size-5 text-white" />
      </button>
      <p className="absolute top-5 left-4 text-white/40 text-[11px] font-body">Tap outside to close</p>
    </div>
  );
}

// ─── Cafe Hero ────────────────────────────────────────────────────────────────
const SPECIALTY_CARDS = [
  { cat: 'South Indian Breakfast', catId: 'south-indian-breakfast', emoji: '🍳', img: FOOD_IMAGES.idly,    featured: [{ name: 'Idly (2pc)', price: 39 }, { name: 'Masala Dosa', price: 69 }, { name: 'Ghee Pongal', price: 89 }], timing: '7 AM – 11 AM',    bg: 'from-amber-900/90 to-orange-950/95', accent: '#F4A23A' },
  { cat: 'Tandoori Starters',      catId: 'tandoori-starters',      emoji: '🔥', img: FOOD_IMAGES.tandoor, featured: [{ name: 'Paneer Tikka', price: 140 }, { name: 'Malai Paneer', price: 140 }, { name: 'Tandoori Platter', price: 190 }], timing: '12–3 PM & 7–10 PM', bg: 'from-red-900/90 to-rose-950/95', accent: '#F87171' },
  { cat: 'Biriyani',               catId: 'biriyani',               emoji: '🍚', img: FOOD_IMAGES.biryani, featured: [{ name: 'Handi Biriyani', price: 169 }, { name: 'Paneer Tikka Biryani', price: 200 }, { name: 'Veg Biriyani', price: 140 }], timing: '12–3 PM & 7–10 PM', bg: 'from-yellow-900/90 to-amber-950/95', accent: '#FCD34D' },
  { cat: 'Kids Menu',              catId: 'kids-menu',              emoji: '🍔', img: FOOD_IMAGES.kids,    featured: [{ name: 'Veg Burger', price: 70 }, { name: 'Pizza', price: 99 }, { name: 'French Fries', price: 70 }], timing: '11 AM – 10 PM', bg: 'from-purple-900/90 to-violet-950/95', accent: '#C084FC' },
];
function HeroBg() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fn = (e: MouseEvent) => { const x = (e.clientX / window.innerWidth - 0.5) * 12; const y = (e.clientY / window.innerHeight - 0.5) * 8; el.style.transform = `translate(${x}px, ${y}px) scale(1.08)`; };
    window.addEventListener('mousemove', fn); return () => window.removeEventListener('mousemove', fn);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={ref} className="absolute inset-[-4%] transition-transform duration-700 ease-out"><img src={FOOD_IMAGES.hero} alt="" className="w-full h-full object-cover" /></div>
    </div>
  );
}

// ─── Explore Our Menu Section ────────────────────────────────────────────────
const EXPLORE_CATS = [
  { img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80', label: 'South Indian' },
  { img: 'https://images.unsplash.com/photo-1642821373181-696a54913e93?w=600&q=80', label: 'Biriyani' },
  { img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80', label: 'Tandoori' },
  { img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80', label: 'North Indian' },
  { img: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80', label: 'Soups' },
];

function ExploreMenuSection() {
  const rowRef = useScrollReveal<HTMLDivElement>({ threshold: 0.1 });
  const titleRef = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });
  return (
    <section className="py-6">
      {/* Heading */}
      <div
        ref={titleRef}
        data-reveal="up"
        className="px-4 mb-5"
      >
        <p className="text-[10px] font-body font-bold uppercase tracking-widest text-primary mb-1">Explore Our Menu</p>
        <h2 className="font-display text-2xl font-bold text-foreground leading-tight">What are you craving?</h2>
      </div>

      {/* Horizontal scroll row with stagger */}
      <div className="relative">
        <div
          ref={rowRef}
          data-stagger
          className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-3"
          style={{ scrollbarWidth: 'none' }}
        >
          {EXPLORE_CATS.map(({ img, label }, i) => (
            <div
              key={label}
              className="group shrink-0 relative rounded-2xl overflow-hidden shadow-lg cursor-pointer"
              style={{ width: 170, height: 250 }}
            >
              {/* Image with hover zoom */}
              <img
                src={img}
                alt={label}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading={i < 2 ? 'eager' : 'lazy'}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.78) 0%,rgba(0,0,0,0.15) 50%,transparent 100%)' }} />
              {/* Label */}
              <p className="absolute bottom-3 left-0 right-0 text-center text-white font-body font-bold text-xs drop-shadow-md">{label}</p>
            </div>
          ))}
        </div>
        {/* Fade edge right */}
        <div className="absolute right-0 top-0 bottom-3 w-12 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--background, white), transparent)' }} />
      </div>
    </section>
  );
}

// ─── From Our Kitchen Section ─────────────────────────────────────────────────
const KITCHEN_ITEMS = [
  { img: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80', name: 'Masala Dosa', price: '₹69' },
  { img: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80', name: 'Paneer Masala', price: '₹170' },
  { img: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80', name: 'Tomato Soup', price: '₹59' },
  { img: 'https://images.unsplash.com/photo-1642821373181-696a54913e93?w=600&q=80', name: 'Handi Biriyani', price: '₹169' },
  { img: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=600&q=80', name: 'South Indian Thali', price: '' },
];

function FromOurKitchenSection({ onViewAll }: { onViewAll: () => void }) {
  const rowRef    = useScrollReveal<HTMLDivElement>({ threshold: 0.1 });
  const titleRef  = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });
  // Scroll-driven wipe: cafe image slides in as user scrolls
  const wipeRef    = useRef<HTMLDivElement>(null);
  const wipeImgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = wipeRef.current;
    const img       = wipeImgRef.current;
    if (!container || !img) return;

    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      const vh   = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.75)));
      const pct = Math.round(progress * 100);
      img.style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`;
      // Move the divider line to match clip edge
      const divider = container.querySelector('#wipe-divider') as HTMLElement | null;
      if (divider) divider.style.left = `${pct}%`;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initialise
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section className="pb-8">
      {/* Header */}
      <div
        ref={titleRef}
        data-reveal="up"
        className="px-4 mb-4 flex items-center justify-between"
      >
        <h2 className="font-display text-xl font-bold text-foreground">From Our Kitchen</h2>
        <button
          onClick={onViewAll}
          className="text-xs font-body font-semibold text-primary flex items-center gap-1 active:opacity-70"
        >
          View All <ChevronRight className="size-3" />
        </button>
      </div>

      {/* Horizontal scroll row */}
      <div className="relative">
        <div
          ref={rowRef}
          data-stagger
          className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-3"
          style={{ scrollbarWidth: 'none' }}
        >
          {KITCHEN_ITEMS.map(({ img, name, price }, i) => (
            <div
              key={name}
              className="group shrink-0 relative rounded-2xl overflow-hidden shadow-md cursor-pointer"
              style={{ width: 170, height: 215 }}
            >
              <img
                src={img}
                alt={name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.78) 0%,transparent 55%)' }} />
              <div className="absolute bottom-3 left-2.5 right-2.5">
                <p className="text-white font-body font-semibold text-[11px] leading-tight">{name}</p>
                {price && <p className="font-body font-bold text-xs mt-0.5" style={{ color: '#F4A23A' }}>{price}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-3 w-12 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--background, white), transparent)' }} />
      </div>

      {/* Scroll-driven wipe: South Indian Meal → Party Hall */}
      <div
        ref={wipeRef}
        className="relative mx-4 mt-8 rounded-3xl overflow-hidden shadow-2xl border border-border"
        style={{ height: 320 }}
      >
        {/* Base — South Indian Meal (revealed first, full width) */}
        <img
          src="https://images.unsplash.com/photo-1596797038530-2c107229654b?w=1200&q=80"
          alt="South Indian Meal"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {/* Label for base image — bottom-left */}
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
          <span className="text-[10px] font-body font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,215,0,0.18)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
            South Indian Meal
          </span>
        </div>

        {/* Wipe-in overlay — Party Hall, left-to-right clip */}
        <div
          ref={wipeImgRef}
          className="absolute inset-0"
          style={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
        >
          <img
            src="/party-hall.jpg"
            alt="Party Hall"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Label for wipe image — bottom-right */}
          <div className="absolute bottom-4 right-4">
            <span className="text-[10px] font-body font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,215,0,0.18)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
              Party Hall
            </span>
          </div>
        </div>

        {/* Vertical wipe divider — follows the clip edge */}
        <div
          className="absolute inset-y-0 w-[3px] shadow-[0_0_12px_rgba(255,255,255,0.6)] pointer-events-none z-20"
          style={{ left: 'var(--wipe-x, 0%)', background: 'white', transition: 'left 0.05s linear' }}
          id="wipe-divider"
        />

        {/* Gradient overlays top corners */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.25) 0%,transparent 35%, transparent 65%, rgba(0,0,0,0.35) 100%)' }} />
      </div>
    </section>
  );
}

// ─── Feedback Section ─────────────────────────────────────────────────────────
function FeedbackSection() {
  const [name, setName]       = useState('');
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [message, setMessage] = useState('');
  const [sent, setSent]       = useState(false);
  const ref = useScrollReveal<HTMLElement>({ threshold: 0.1 });

  const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

  const handleSend = () => {
    if (!rating || !message.trim()) return;
    const stars   = '⭐'.repeat(rating);
    const label   = STAR_LABELS[rating];
    const nameStr = name.trim() ? `👤 *${name.trim()}*\n` : '';
    const text = `🍽️ *Feedback — Cafe Aadvikam*\n\n${nameStr}${stars} ${label}\n\n💬 ${message.trim()}\n\n_Sent from CafeAadvikam.in_`;
    window.open(`https://wa.me/${CAFE.waWhatsapp}?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
  };

  const handleReset = () => { setName(''); setRating(0); setMessage(''); setSent(false); };

  return (
    <section ref={ref} data-reveal="up" className="px-4 py-8">
      {/* Heading */}
      <div className="flex items-center gap-2 mb-1">
        <SmilePlus className="size-5 text-primary" />
        <h2 className="font-display text-2xl font-bold text-foreground">Share Your Experience</h2>
      </div>
      <p className="text-xs font-body text-muted-foreground mb-5">
        Your feedback goes directly to us on WhatsApp 💚
      </p>

      {sent ? (
        /* ── Thank-you state ── */
        <div className="flex flex-col items-center justify-center py-10 gap-4 text-center bg-emerald-50 rounded-2xl border border-emerald-200">
          <span className="text-5xl">🙏</span>
          <div>
            <p className="font-display font-bold text-lg text-emerald-700">Thank you!</p>
            <p className="text-xs font-body text-emerald-600 mt-1">Your feedback has been sent to us on WhatsApp.</p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs font-body font-semibold text-emerald-600 underline underline-offset-4 active:opacity-70"
          >
            Submit another feedback
          </button>
        </div>
      ) : (
        /* ── Form ── */
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Name (optional) */}
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <label className="block text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Your Name <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ravi Kumar"
              className="w-full bg-muted/40 rounded-xl px-3.5 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition"
              maxLength={40}
            />
          </div>

          {/* Star rating */}
          <div className="px-4 py-4 border-b border-border/60">
            <label className="block text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Rating <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(s)}
                  className="active:scale-75 transition-transform"
                  aria-label={`${s} star`}
                >
                  <Star
                    className="size-8 transition-all duration-150"
                    fill={(hovered || rating) >= s ? '#F4A23A' : 'none'}
                    stroke={(hovered || rating) >= s ? '#F4A23A' : 'currentColor'}
                    style={{ color: (hovered || rating) >= s ? '#F4A23A' : 'var(--muted-foreground)' }}
                  />
                </button>
              ))}
              {(hovered || rating) > 0 && (
                <span className="text-xs font-body font-semibold text-primary ml-1">
                  {STAR_LABELS[hovered || rating]}
                </span>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="px-4 py-4">
            <label className="block text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Your Feedback <span className="text-destructive">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your experience — food, service, ambiance…"
              rows={4}
              className="w-full bg-muted/40 rounded-xl px-3.5 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 transition resize-none"
              maxLength={500}
            />
            <p className="text-right text-[10px] text-muted-foreground mt-0.5">{message.length}/500</p>
          </div>

          {/* Send button */}
          <div className="px-4 pb-4">
            <button
              onClick={handleSend}
              disabled={!rating || !message.trim()}
              className="w-full py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#0F6E56,#1D9E75)', color: 'white', boxShadow: '0 4px 20px rgba(29,158,117,0.35)' }}
            >
              <Send className="size-4" />
              Send Feedback via WhatsApp
            </button>
            {(!rating || !message.trim()) && (
              <p className="text-center text-[10px] text-muted-foreground mt-2">
                {!rating ? 'Please select a star rating' : 'Please write your feedback'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Cafe Content ─────────────────────────────────────────────────────────────
function CafeContent({ setShowMenu, setDrawerCat, setPartyFullscreen }: { setShowMenu: (v: boolean) => void; setDrawerCat: (v: string | null) => void; setPartyFullscreen: (v: boolean) => void }) {
  const [timePeriod] = useState(getTimePeriod);
  const navigate = useNavigate();
  const bookPartyHall = () => window.open(`https://wa.me/${CAFE.waWhatsapp}?text=${encodeURIComponent(CAFE.waPretext)}`, '_blank');
  const openDirections = () => {
    window.open('https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9602846,17z/data=!4m6!3m5!1s0x3baddf00120caa5f:0x7cf353554e2c66a9!8m2!3d12.808481!4d77.9628595!16s%2Fg%2F11z0zvhx9p', '_blank');
  };
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ height: '90vh', minHeight: 540 }}>
        <HeroBg />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(170deg,rgba(0,0,0,0.1) 0%,rgba(10,4,0,0.5) 40%,rgba(5,2,0,0.92) 100%)' }} />
        <div className="relative h-full flex flex-col justify-end px-5 pb-10">
          {timePeriod && (
          <div className="mb-4" style={{ animation: 'fadeUp .7s both' }}>
            <span className="time-badge inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-body font-bold"
              style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
              {timePeriod.label}
            </span>
          </div>
          )}
          <div className="flex items-center gap-3 mb-4" style={{ animation: 'fadeUp .7s .1s both' }}>
            <img src={cafeLogo} alt="logo" className="size-16 rounded-2xl border-2 object-cover shadow-2xl" style={{ borderColor: 'rgba(255,215,0,0.4)' }} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="snb-badge text-xl">SNB</span>
                <span className="font-body font-extrabold text-sm px-2.5 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#1a0a00' }}>Since 1988</span>
              </div>
              <p className="text-white/45 font-body text-[10px] uppercase tracking-widest">VRSNB Foods LLP</p>
            </div>
          </div>
          <div style={{ animation: 'fadeUp .7s .2s both' }} className="mb-3">
            <h1 className="font-display font-bold text-white leading-[0.92] drop-shadow-2xl" style={{ fontSize: 'clamp(46px,12vw,68px)' }}>
              Cafe<br /><span style={{ color: '#FFD700', textShadow: '0 0 40px rgba(255,215,0,0.4)' }}>Aadvikam</span>
            </h1>
            <p className="font-display text-base italic mt-2" style={{ color: '#F4A23A' }}>Authentic Flavours, Timeless Taste</p>
            <p className="font-body text-xs text-white/45 mt-1">🌿 Pure Vegetarian · Restaurant &amp; Party Hall</p>
          </div>
          <div className="flex items-center gap-3 mb-6 text-white/50" style={{ animation: 'fadeUp .7s .3s both' }}>
            <span className="flex items-center gap-1.5 text-xs font-body"><Clock className="size-3.5" />{CAFE.hours}</span>
            <span className="text-white/25">·</span>
            <span className="flex items-center gap-1.5 text-xs font-body"><MapPin className="size-3.5" />Berikai, Hosur</span>
          </div>
          <div className="flex gap-3" style={{ animation: 'fadeUp .7s .4s both' }}>
            <button onClick={() => setShowMenu(true)} className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 24px rgba(224,122,58,0.5)' }}>
              <UtensilsCrossed className="size-4" />View Menu
            </button>
            <button onClick={openDirections} className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)', color: 'white', backdropFilter: 'blur(10px)' }}>
              <MapPin className="size-4" />Get Directions
            </button>
          </div>
        </div>
      </section>

      {/* Info strip */}
      <section className="bg-primary text-primary-foreground px-5 py-4">
        <div className="grid grid-cols-2 gap-2 font-body">
          <div className="flex items-center gap-2"><Clock className="size-4 opacity-80" /><span className="font-semibold text-xs">{CAFE.hours}</span></div>
          <div className="flex items-center gap-2"><Leaf className="size-4 opacity-80" /><span className="text-xs">{CAFE.type}</span></div>
          <div className="flex items-center gap-2 col-span-2"><MapPin className="size-4 opacity-80 shrink-0" /><span className="text-xs">{CAFE.address}</span></div>
        </div>
      </section>

      {/* Explore Our Menu */}
      <ExploreMenuSection />

      {/* Specialty cards */}
      <section className="px-4 py-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">Specialty Menu</h2>
        <p className="text-xs font-body text-muted-foreground mb-5">Tap a card to see all items</p>
        <div className="grid grid-cols-2 gap-3">
          {SPECIALTY_CARDS.map(card => (
            <TiltCard key={card.cat} onClick={() => setDrawerCat(card.catId)}>
              <div className="relative rounded-2xl overflow-hidden" style={{ height: 200, transformStyle: 'preserve-3d' }}>
                <img src={card.img} alt={card.cat} className="absolute inset-0 w-full h-full object-cover" />
                <div className={cn('absolute inset-0 bg-gradient-to-t', card.bg)} />
                <div className="relative h-full flex flex-col justify-between p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{card.emoji}</span>
                    <span className="text-[9px] font-body font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(4px)' }}>{card.timing}</span>
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold text-white mb-1.5">{card.cat}</p>
                    {card.featured.map(f => <div key={f.name} className="flex items-center justify-between"><span className="text-[10px] font-body text-white/80 truncate pr-1">{f.name}</span><span className="text-[10px] font-body font-bold shrink-0" style={{ color: card.accent }}>₹{f.price}</span></div>)}
                    <div className="mt-2 flex items-center gap-1 text-white/60"><span className="text-[9px] font-body">Tap to see all</span><ChevronRight className="size-3" /></div>
                  </div>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* Why us */}
      <section className="px-5 py-10 text-center bg-card border-y border-border">
        <img src={cafeLogo} alt="logo" className="size-16 rounded-2xl object-cover border-2 border-border shadow-md mx-auto mb-4" />
        <h2 className="font-display text-2xl font-bold text-foreground">Why Cafe Aadvikam?</h2>
        <p className="text-xs font-body text-muted-foreground mt-1 mb-4">VRSNB Foods LLP · A Unit of SNB · Since 1988</p>
        <p className="text-sm font-body text-muted-foreground leading-relaxed max-w-xs mx-auto mb-4">Experience the perfect blend of traditional flavours and modern ambiance. Every dish crafted with care and premium quality ingredients.</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {[['🌿','Pure Vegetarian'],['✨','Fresh Ingredients'],['🛡️','Hygienic Kitchen'],['😊','Friendly Service'],['🅿️','Ample Parking'],['🎉','Party Hall']].map(([icon, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-body font-semibold">{icon} {label}</span>
          ))}
        </div>
      </section>

      {/* Party Hall */}
      <section className="px-4 py-8">
        <div className="flex items-center gap-2 mb-2"><PartyPopper className="size-5 text-primary" /><h2 className="font-display text-2xl font-bold text-foreground">Party Hall</h2></div>
        <p className="text-sm font-body text-muted-foreground mb-4">Perfect for birthdays, family gatherings &amp; corporate events.</p>
        <div className="group relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all shadow-xl border border-border" style={{ height: 220 }} onClick={() => setPartyFullscreen(true)}>
          <img src={FOOD_IMAGES.partyHall} alt="Party Hall" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.1) 60%)' }} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full font-body text-xs font-bold whitespace-nowrap" style={{ background: 'rgba(255,215,0,0.9)', color: '#1a0a00' }}>🎉 PARTY HALL AVAILABLE</div>
          <div className="absolute bottom-4 left-4"><p className="text-white font-display text-lg font-bold">Celebrate with Us</p><p className="text-white/70 font-body text-xs">Spacious · Ample parking · 6 AM – 10 PM</p></div>
          <div className="absolute inset-0 flex items-center justify-center"><div className="px-5 py-2.5 rounded-xl font-body text-sm font-semibold text-white flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>Tap to explore <ChevronRight className="size-4" /></div></div>
        </div>
        <button onClick={bookPartyHall} className="mt-4 w-full py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg" style={{ background: 'linear-gradient(135deg,#0F6E56,#1D9E75)', color: 'white' }}>
          <MessageCircle className="size-4" />Book Party Hall via WhatsApp<ChevronRight className="size-4" />
        </button>
      </section>

      {/* From Our Kitchen */}
      <FromOurKitchenSection onViewAll={() => setShowMenu(true)} />

      {/* Feedback */}
      <FeedbackSection />
    </>
  );
}

// ─── Bakery Content ───────────────────────────────────────────────────────────
function BakeryContent() {
  const { items, loadAllItems } = useBakeryItemsStore();
  const [activeCat, setActiveCat] = useState('All');

  useEffect(() => { loadAllItems(); }, [loadAllItems]);

  // Only show enabled items
  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);

  // Derive categories dynamically from the store
  const categories = useMemo(() => {
    const cats = Array.from(new Set(enabledItems.map(i => i.category))).sort();
    return ['All', ...cats];
  }, [enabledItems]);

  const filtered = useMemo(() =>
    activeCat === 'All' ? enabledItems : enabledItems.filter(i => i.category === activeCat),
    [enabledItems, activeCat],
  );

  return (
    <div className="pb-10">
      {/* Bakery Hero */}
      <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1a0800 0%,#3d1500 40%,#5c2200 70%,#2d0f00 100%)' }} />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Ccircle cx='30' cy='30' r='25' stroke='%23FFD700' stroke-width='0.5'/%3E%3Ccircle cx='30' cy='30' r='15' stroke='%23FFD700' stroke-width='0.4'/%3E%3Ccircle cx='30' cy='30' r='5' fill='%23FFD700' opacity='0.3'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }} />
        {[{ s:80,l:'10%',t:'20%',c:'#FF6B35',op:0.15 },{ s:120,l:'70%',t:'10%',c:'#FFD700',op:0.1 },{ s:60,l:'50%',t:'60%',c:'#E07A3A',op:0.12 }].map((o,i)=>(
          <div key={i} className="absolute rounded-full" style={{ width:o.s, height:o.s, left:o.l, top:o.t, background:`radial-gradient(circle,${o.c},transparent)`, opacity:o.op, filter:'blur(20px)' }} />
        ))}
        <div className="relative px-5 pt-10 pb-8 flex flex-col items-center text-center">
          <div className="mb-5 relative">
            <div className="size-24 rounded-3xl overflow-hidden border-2 shadow-2xl mx-auto" style={{ borderColor: 'rgba(255,215,0,0.5)', boxShadow: '0 8px 40px rgba(255,107,53,0.4), 0 0 0 1px rgba(255,215,0,0.1)' }}>
              <img src={BAKERY.logo} alt="SNB Bakery" className="w-full h-full object-contain bg-white p-2" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full font-body text-[9px] font-bold whitespace-nowrap" style={{ background: 'linear-gradient(90deg,#b8860b,#ffd700)', color: '#1a0a00' }}>
              EST. {BAKERY.since}
            </div>
          </div>
          <h1 className="font-display text-4xl font-bold mb-1" style={{ color: '#FFD700', textShadow: '0 0 30px rgba(255,215,0,0.3)' }}>SNB Bakery</h1>
          <p className="text-sm font-body mb-1" style={{ color: 'rgba(255,200,100,0.8)' }}>Sri Nanjundeshwara Bakery</p>
          <p className="text-white/50 font-body text-xs mb-5">{BAKERY.address}</p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {[['🎂','Cakes'],['🍪','Biscuits'],['🍬','Sweets'],['🥐','Bakery'],['🧆','Snacks']].map(([icon,label])=>(
              <span key={label} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-body font-semibold" style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)', color: '#FFD700' }}>{icon} {label}</span>
            ))}
          </div>
          <div className="flex gap-3 w-full max-w-sm">
            <a href={`tel:${BAKERY.phone}`} className="flex-1 py-3.5 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 20px rgba(224,122,58,0.4)' }}>
              <Phone className="size-4" />Call Us
            </a>
            <a href={`https://wa.me/${BAKERY.waPhone}?text=${encodeURIComponent('Hi, I want to order from SNB Bakery')}`} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-3.5 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>
              <MessageCircle className="size-4" />WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* About strip */}
      <div className="mx-4 my-4 rounded-2xl overflow-hidden border border-border">
        <div className="px-4 py-4 bg-card">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#b8860b,#ffd700)' }}>
              <Star className="size-5 text-white" fill="white" />
            </div>
            <div>
              <p className="font-display font-bold text-foreground text-sm mb-1">Our Story</p>
              <p className="text-xs font-body text-muted-foreground leading-relaxed">{BAKERY.about}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
          {[['36+','Years'],['100%','Hygiene'],['24×7','Service']].map(([val,lbl])=>(
            <div key={lbl} className="py-3 text-center bg-muted/30">
              <p className="font-display font-bold text-primary text-lg">{val}</p>
              <p className="text-[10px] font-body text-muted-foreground">{lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter + item count */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold text-foreground">Our Products</h2>
          <span className="text-xs font-body text-muted-foreground">{filtered.length} items</span>
        </div>
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={cn('px-4 py-2 rounded-full text-xs font-body font-bold whitespace-nowrap shrink-0 transition-all active:scale-95',
                  activeCat === cat ? 'text-white shadow-lg' : 'bg-card border border-border text-foreground')}
                style={activeCat === cat ? { background: 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: '0 4px 12px rgba(224,122,58,0.35)' } : {}}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product grid */}
      {enabledItems.length === 0 ? (
        <div className="mx-4 py-16 text-center bg-muted/30 rounded-2xl">
          <p className="text-3xl mb-2">🥐</p>
          <p className="text-sm font-body text-muted-foreground">Menu coming soon…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-4 py-12 text-center bg-muted/30 rounded-2xl">
          <p className="text-sm font-body text-muted-foreground">No items in this category.</p>
        </div>
      ) : (
        <div className="px-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(item => (
            <TiltCard key={item.id}>
              <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm h-full flex flex-col" style={{ transformStyle: 'preserve-3d' }}>
                {/* Emoji icon display */}
                <div className="flex items-center justify-center bg-amber-50 border-b border-border" style={{ height: 100 }}>
                  <span className="text-5xl">{item.icon}</span>
                </div>
                {/* Info */}
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-body font-bold self-start mb-0.5"
                    style={{ background: 'rgba(184,134,11,0.12)', color: '#b8860b', border: '1px solid rgba(184,134,11,0.25)' }}>
                    {item.category}
                  </span>
                  <p className="font-body font-bold text-foreground text-xs leading-tight line-clamp-2">{item.name}</p>
                  {item.price != null
                    ? <span className="font-display font-bold text-base tabular-nums mt-auto" style={{ color: '#C84B0A' }}>₹{item.price}</span>
                    : <span className="text-[10px] text-muted-foreground mt-auto italic">Price on request</span>
                  }
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      )}

      {/* Contact CTA */}
      <div className="mx-4 mt-6 flex gap-3">
        <a href={`tel:${BAKERY.phone}`} className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 20px rgba(224,122,58,0.3)' }}>
          <Phone className="size-4" />Call to Order
        </a>
        <a href={`https://wa.me/${BAKERY.waPhone}?text=${encodeURIComponent('Hi, I want to order from SNB Bakery')}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          style={{ background: 'linear-gradient(135deg,#0F6E56,#1D9E75)', color: 'white', boxShadow: '0 4px 20px rgba(29,158,117,0.3)' }}>
          <MessageCircle className="size-4" />WhatsApp
        </a>
      </div>
    </div>
  );
}


// ─── Compact Floating Side Toggle ────────────────────────────────────────────
function VenueToggle({ active, onChange }: { active: 'cafe' | 'bakery'; onChange: (v: 'cafe' | 'bakery') => void }) {
  return (
    <div
      className="fixed right-3 z-50 flex flex-col gap-1.5 p-1.5 rounded-2xl shadow-2xl"
      style={{
        top: '72px',
        background: 'rgba(15,6,2,0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(180,120,40,0.3)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,215,0,0.08)',
      }}
    >
      {/* Cafe button */}
      <button
        onClick={() => onChange('cafe')}
        aria-label="Switch to Cafe Aadvikam"
        className="relative flex flex-col items-center justify-center gap-1 px-2.5 py-2.5 rounded-xl transition-all duration-300 active:scale-90"
        style={
          active === 'cafe'
            ? {
                background: 'linear-gradient(135deg,#E07A3A,#C84B0A)',
                boxShadow: '0 4px 16px rgba(200,75,10,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
                minWidth: 52,
              }
            : {
                background: 'rgba(255,255,255,0.05)',
                minWidth: 52,
              }
        }
      >
        <UtensilsCrossed className={cn('size-4 transition-all', active === 'cafe' ? 'text-white' : 'text-white/40')} />
        <span
          className={cn('text-[9px] font-body font-bold tracking-wide leading-none transition-all', active === 'cafe' ? 'text-white' : 'text-white/35')}
        >
          Cafe
        </span>
        {active === 'cafe' && (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-white/70 animate-pulse" />
        )}
      </button>

      {/* Divider */}
      <div className="h-px mx-1.5" style={{ background: 'rgba(255,215,0,0.15)' }} />

      {/* Bakery button */}
      <button
        onClick={() => onChange('bakery')}
        aria-label="Switch to SNB Bakery"
        className="relative flex flex-col items-center justify-center gap-1 px-2.5 py-2.5 rounded-xl transition-all duration-300 active:scale-90"
        style={
          active === 'bakery'
            ? {
                background: 'linear-gradient(135deg,#b8860b,#8B5E04)',
                boxShadow: '0 4px 16px rgba(180,140,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
                minWidth: 52,
              }
            : {
                background: 'rgba(255,255,255,0.05)',
                minWidth: 52,
              }
        }
      >
        <span className={cn('text-base transition-all leading-none', active === 'bakery' ? 'drop-shadow-[0_0_6px_rgba(255,215,0,0.9)]' : 'opacity-30')}>🥐</span>
        <span
          className={cn('text-[9px] font-body font-bold tracking-wide leading-none transition-all', active === 'bakery' ? 'text-white' : 'text-white/35')}
        >
          Bakery
        </span>
        {active === 'bakery' && (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-white/70 animate-pulse" />
        )}
      </button>
    </div>
  );
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();
  const { activeVenue, setVenue } = useVenueStore();
  const [showMenu, setShowMenu] = useState(false);
  const [drawerCat, setDrawerCat] = useState<string | null>(null);
  const [partyFullscreen, setPartyFullscreen] = useState(false);
  const [timePeriod] = useState(getTimePeriod);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  if (currentUser) {
    const path = currentUser.role === 'order_taker' ? '/order-pad' : currentUser.role === 'admin' ? '/admin-dashboard' : currentUser.role === 'kitchen' ? '/kitchen' : '/billing';
    navigate(path, { replace: true }); return null;
  }

  const bookPartyHall = () => window.open(`https://wa.me/${CAFE.waWhatsapp}?text=${encodeURIComponent(CAFE.waPretext)}`, '_blank');

  return (
    <div className="min-h-screen bg-background pt-14 overflow-x-hidden">
      <style>{`
/* Scroll reveal */
[data-reveal] { opacity: 0; transform: translateX(var(--rv-x,0)) translateY(var(--rv-y,0)) scale(var(--rv-s,1)); transition: opacity .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1); }
[data-reveal][data-visible=true] { opacity: 1; transform: none; }
[data-reveal~=right] { --rv-x: 60px; }
[data-reveal~=up] { --rv-y: 30px; }
[data-reveal~=scale] { --rv-s: 0.94; }
[data-stagger] > * { opacity: 0; transform: translateX(60px); transition: opacity .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1); }
[data-stagger][data-visible=true] > *:nth-child(1) { opacity:1; transform:none; transition-delay:.05s }
[data-stagger][data-visible=true] > *:nth-child(2) { opacity:1; transform:none; transition-delay:.15s }
[data-stagger][data-visible=true] > *:nth-child(3) { opacity:1; transform:none; transition-delay:.25s }
[data-stagger][data-visible=true] > *:nth-child(4) { opacity:1; transform:none; transition-delay:.35s }
[data-stagger][data-visible=true] > *:nth-child(5) { opacity:1; transform:none; transition-delay:.45s }

        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        @keyframes pulseGlow { 0%,100% { box-shadow:0 0 14px rgba(255,215,0,0.2); } 50% { box-shadow:0 0 28px rgba(255,215,0,0.5); } }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
        .snb-badge { background:linear-gradient(90deg,#b8860b,#ffd700,#daa520,#ffd700,#b8860b); background-size:200% auto; animation:shimmer 2.5s linear infinite; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; font-weight:900; }
        .time-badge { animation:pulseGlow 2s ease-in-out infinite; }
      `}</style>

      {/* Floating side venue toggle */}
      <VenueToggle active={activeVenue} onChange={setVenue} />

      {/* Page content — slides in on switch */}
      <div key={activeVenue} style={{ animation: 'fadeUp 0.35s ease-out both' }}>
        {activeVenue === 'cafe' ? (
          <CafeContent setShowMenu={setShowMenu} setDrawerCat={setDrawerCat} setPartyFullscreen={setPartyFullscreen} />
        ) : (
          <BakeryContent />
        )}
      </div>

      {/* Shared footer */}
      <footer className="bg-foreground text-primary-foreground px-5 py-8 text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
          <img src={cafeLogo} alt="Cafe" className="size-10 rounded-xl object-cover border border-white/20" />
          <div className="size-6 rounded-full bg-white/10 flex items-center justify-center"><span className="text-white/60 text-xs">+</span></div>
          <img src={BAKERY.logo} alt="SNB Bakery" className="size-10 rounded-xl object-contain bg-white p-1 border border-white/20" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
        </div>
        <p className="font-display text-base font-bold text-white mb-0.5">Cafe Aadvikam · SNB Bakery</p>
        <p className="text-[10px] font-body font-bold mb-2" style={{ color: '#FFD700' }}>A Unit of SNB · VRSNB Foods LLP · Since 1988</p>
        <p className="text-xs font-body text-white/50 mb-4">{CAFE.address}</p>
        <div className="flex gap-3 justify-center mb-5">
          <button onClick={() => window.open('https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9602846,17z/data=!4m6!3m5!1s0x3baddf00120caa5f:0x7cf353554e2c66a9!8m2!3d12.808481!4d77.9628595!16s%2Fg%2F11z0zvhx9p','_blank')} className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><MapPin className="size-3" />Directions</button>
          <button onClick={bookPartyHall} className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><MessageCircle className="size-3" />Book Hall</button>
        </div>
        <button onClick={() => navigate('/login')} className="text-xs font-body font-semibold text-white/40 underline underline-offset-4 mb-4 active:opacity-70">Staff Login</button>
        <p className="text-[10px] font-body text-white/25">© 2025 VRSNB Foods LLP. All rights reserved.</p>
      </footer>

      {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
      {drawerCat && <CategoryDrawer catId={drawerCat} onClose={() => setDrawerCat(null)} />}
      {partyFullscreen && <PartyHallViewer onClose={() => setPartyFullscreen(false)} />}
      <ChatBot />
    </div>
  );
}
