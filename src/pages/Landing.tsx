import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency, cn } from '@/lib/utils';
import { X, UtensilsCrossed, MapPin, Clock, Leaf, ChevronRight, PartyPopper, MessageCircle, Phone, ExternalLink, Star, ShoppingBag } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

// ─── Config ───────────────────────────────────────────────────────────────────
const CAFE = {
  name: 'Cafe Aadvikam', address: '109 Bagalur Main Road, Berikai 635105',
  hours: '6 AM – 10 PM Daily', type: 'Pure Vegetarian',
  mapsUrl: 'https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9628595,17z',
  waWhatsapp: '917667117803', waPretext: 'Hi, I need to enquire and book the Party Hall.',
};
const BAKERY = {
  name: 'SNB Bakery', tagline: 'Sri Nanjundeshwara Bakery',
  since: '1988', address: 'Berigai, Hosur',
  phone: '+91 9443388257', website: 'https://www.snbbakery.in',
  waPhone: '919443388257',
  about: 'Mr. Venugopal\'s father started Sri Nanjundeshwara Bakery (SNB) in 1988. Over 36 years of serving unforgettable melting sweets, cookies, cakes and the most exquisite savouries.',
  logo: 'https://www.snbbakery.in/img/SNB.png',
};
const SNB_PRODUCTS = [
  { name: 'Dough Nut',         price: 15,   img: 'https://www.snbbakery.in/images/1664203693_donut.jpg',               cat: 'Bakery' },
  { name: 'Banana Cake',       price: 440,  img: 'https://www.snbbakery.in/images/1664205307_bananacake.jpg',           cat: 'Cakes' },
  { name: 'Black Forest',      price: 550,  img: 'https://www.snbbakery.in/images/1664204580_blackforest.jpg',          cat: 'Cakes' },
  { name: 'Carrot Cake',       price: 440,  img: 'https://www.snbbakery.in/images/1664188140_carrotcake.jpg',           cat: 'Cakes' },
  { name: 'Butter Scotch',     price: 800,  img: 'https://www.snbbakery.in/images/1664204542_butterscotch.jpg',         cat: 'Cakes' },
  { name: 'SPL Bun',           price: 10,   img: 'https://www.snbbakery.in/images/1664187794_bun1.jpg',                 cat: 'Bakery' },
  { name: 'Pakoda',            price: 320,  img: 'https://www.snbbakery.in/images/1664212527_pakkoda.jpeg',             cat: 'Snacks' },
  { name: 'Kara Boondhi',      price: 300,  img: 'https://www.snbbakery.in/images/1664181239_karapoondhi.jpg',          cat: 'Snacks' },
  { name: 'Masala Cashew',     price: 1200, img: 'https://www.snbbakery.in/images/1664178165_masala-cashew-nut.jpg',    cat: 'Snacks' },
  { name: 'Benne Muruk',       price: 300,  img: 'https://www.snbbakery.in/images/1664211674_murukku.jpg.jpg',          cat: 'Snacks' },
  { name: 'Rings',             price: 300,  img: 'https://www.snbbakery.in/images/1664211694_andhra-murukku.jpg',       cat: 'Snacks' },
  { name: 'Wheat Biscuit',     price: 440,  img: 'https://www.snbbakery.in/images/1664253033_wheat-biscuit.jpg',        cat: 'Biscuits' },
  { name: 'Coconut Biscuit',   price: 440,  img: 'https://www.snbbakery.in/images/1664204841_coconutbiscuit.jpg',       cat: 'Biscuits' },
  { name: 'Honey Badam Cookies', price: 440, img: 'https://www.snbbakery.in/images/1664278859_Honey-Almond-Cookies.jpg', cat: 'Biscuits' },
  { name: 'Peda',              price: 440,  img: 'https://www.snbbakery.in/images/1664209287_peda.jpg',                 cat: 'Sweets' },
  { name: 'Jamoon',            price: 20,   img: 'https://www.snbbakery.in/images/1664280684_dryjamun.jpg',             cat: 'Sweets' },
  { name: 'SNB Dairy Milk (Dry Fruits)', price: 90, img: 'https://www.snbbakery.in/images/1664252458_dairy-milk-fruit.jpeg', cat: 'Sweets' },
  { name: 'SNB Dairy Milk',    price: 40,   img: 'https://www.snbbakery.in/images/1664252470_diarysmall.jpg',           cat: 'Sweets' },
];
const BAKERY_CATS = ['All', 'Cakes', 'Bakery', 'Biscuits', 'Snacks', 'Sweets'];
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
  partyHall: 'https://lh3.googleusercontent.com/gps-cs-s/APNQkAEbyUHrbpJmJBUVejgvzmi1WtL7Q0xfUdorUxTS_UgyVUYeo4y7OFEy_WhQi7f0wXwCCQ8xtiyiNhEUMdLJ3-sjCUVKGNbuNUV9mZLTHbOGH_ujlZc4bCMqO1RTUFbArg83Mowadj6b3FSW=w1200-h2136-k-no',
};
function getTimePeriod() {
  const now = new Date(); const h = now.getHours();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (h >= 6 && h < 11)  return { label: '🌅 Breakfast Menu Now Serving · ' + timeStr, id: 'south-indian-breakfast' };
  if (h >= 11 && h < 15) return { label: '☀️ Lunch Menu Now Serving · ' + timeStr, id: 'lunch' };
  if (h >= 15 && h < 19) return { label: '🧆 Evening Snacks Now Serving · ' + timeStr, id: 'evening-snacks' };
  return { label: '🌙 Dinner Menu Now Serving · ' + timeStr, id: 'biriyani' };
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
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <img src={FOOD_IMAGES.partyHall} alt="Party Hall" className="w-full h-full object-contain" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 size-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}><X className="size-5 text-white" /></button>
      <p className="absolute bottom-6 text-white/50 text-xs font-body">Tap anywhere to close</p>
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

// ─── Cafe Content ─────────────────────────────────────────────────────────────
function CafeContent({ setShowMenu, setDrawerCat, setPartyFullscreen }: { setShowMenu: (v: boolean) => void; setDrawerCat: (v: string | null) => void; setPartyFullscreen: (v: boolean) => void }) {
  const [timePeriod] = useState(getTimePeriod);
  const navigate = useNavigate();
  const bookPartyHall = () => window.open(`https://wa.me/${CAFE.waWhatsapp}?text=${encodeURIComponent(CAFE.waPretext)}`, '_blank');
  const openDirections = () => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) window.open(`maps://maps.apple.com/?daddr=12.808481,77.9628595`, '_blank');
    else if (/android/.test(ua)) window.open(`geo:12.808481,77.9628595?q=Cafe+Aadvikam`, '_blank');
    else window.open(CAFE.mapsUrl, '_blank');
  };
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ height: '90vh', minHeight: 540 }}>
        <HeroBg />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(170deg,rgba(0,0,0,0.1) 0%,rgba(10,4,0,0.5) 40%,rgba(5,2,0,0.92) 100%)' }} />
        <div className="relative h-full flex flex-col justify-end px-5 pb-10">
          <div className="mb-4" style={{ animation: 'fadeUp .7s both' }}>
            <span className="time-badge inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-body font-bold"
              style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
              {timePeriod.label}
            </span>
          </div>
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

      {/* Food strip */}
      <section className="py-6">
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
          {[{ img: FOOD_IMAGES.idly, label: 'South Indian' }, { img: FOOD_IMAGES.biryani, label: 'Biriyani' }, { img: FOOD_IMAGES.tandoor, label: 'Tandoori' }, { img: FOOD_IMAGES.paneer, label: 'North Indian' }, { img: FOOD_IMAGES.soup, label: 'Soups' }].map(({ img, label }) => (
            <div key={label} className="shrink-0 relative rounded-2xl overflow-hidden shadow-md" style={{ width: 130, height: 160 }}>
              <img src={img} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 55%)' }} />
              <p className="absolute bottom-2 left-0 right-0 text-center text-white font-body font-bold text-[11px]">{label}</p>
            </div>
          ))}
        </div>
      </section>

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
        <div className="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all shadow-xl border border-border" style={{ height: 220 }} onClick={() => setPartyFullscreen(true)}>
          <img src={FOOD_IMAGES.partyHall} alt="Party Hall" className="w-full h-full object-cover" />
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
      <section className="pb-8">
        <div className="px-4 mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-foreground">From Our Kitchen</h2>
          <button onClick={() => setShowMenu(true)} className="text-xs font-body font-semibold text-primary flex items-center gap-1">View All <ChevronRight className="size-3" /></button>
        </div>
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
          {[
            { img: FOOD_IMAGES.dosa,    label: 'Masala Dosa ₹69' },
            { img: FOOD_IMAGES.paneer,  label: 'Paneer Masala ₹170' },
            { img: FOOD_IMAGES.soup,    label: 'Tomato Soup ₹59' },
            { img: FOOD_IMAGES.biryani, label: 'Handi Biriyani ₹169' },
            { img: FOOD_IMAGES.south,   label: 'South Indian Thali' },
          ].map(({ img, label }) => (
            <div key={label} className="shrink-0 relative rounded-2xl overflow-hidden shadow-md" style={{ width: 150, height: 180 }}>
              <img src={img} alt={label} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 50%)' }} />
              <p className="absolute bottom-2.5 left-2 right-2 text-white font-body font-semibold text-[10px] leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ─── Bakery Content ───────────────────────────────────────────────────────────
function BakeryContent() {
  const [activeCat, setActiveCat] = useState('All');
  const filtered = activeCat === 'All' ? SNB_PRODUCTS : SNB_PRODUCTS.filter(p => p.cat === activeCat);

  return (
    <div className="pb-10">
      {/* Bakery Hero */}
      <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
        {/* Warm bakery gradient background */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#1a0800 0%,#3d1500 40%,#5c2200 70%,#2d0f00 100%)' }} />
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Ccircle cx='30' cy='30' r='25' stroke='%23FFD700' stroke-width='0.5'/%3E%3Ccircle cx='30' cy='30' r='15' stroke='%23FFD700' stroke-width='0.4'/%3E%3Ccircle cx='30' cy='30' r='5' fill='%23FFD700' opacity='0.3'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }} />
        {/* Floating warm orbs */}
        {[{ s:80,l:'10%',t:'20%',c:'#FF6B35',op:0.15 },{ s:120,l:'70%',t:'10%',c:'#FFD700',op:0.1 },{ s:60,l:'50%',t:'60%',c:'#E07A3A',op:0.12 }].map((o,i)=>(
          <div key={i} className="absolute rounded-full" style={{ width:o.s, height:o.s, left:o.l, top:o.t, background:`radial-gradient(circle,${o.c},transparent)`, opacity:o.op, filter:'blur(20px)' }} />
        ))}

        {/* Content */}
        <div className="relative px-5 pt-10 pb-8 flex flex-col items-center text-center">
          {/* 3D Logo badge */}
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

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {[['🎂','Cakes'],['🍪','Biscuits'],['🍬','Sweets'],['🥐','Bakery'],['🧆','Snacks']].map(([icon,label])=>(
              <span key={label} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-body font-semibold" style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)', color: '#FFD700' }}>{icon} {label}</span>
            ))}
          </div>

          {/* CTA buttons */}
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

      {/* Category filter */}
      <div className="px-4 mb-4">
        <h2 className="font-display text-xl font-bold text-foreground mb-3">Our Products</h2>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {BAKERY_CATS.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={cn('px-4 py-2 rounded-full text-xs font-body font-bold whitespace-nowrap shrink-0 transition-all active:scale-95',
                activeCat === cat ? 'text-white shadow-lg' : 'bg-card border border-border text-foreground')}
              style={activeCat === cat ? { background: 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: '0 4px 12px rgba(224,122,58,0.35)' } : {}}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid — 3D tilt cards */}
      <div className="px-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map(product => (
          <TiltCard key={product.name}
            onClick={() => window.open(`${BAKERY.website}`, '_blank')}>
            <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm" style={{ transformStyle: 'preserve-3d' }}>
              {/* Product image */}
              <div className="relative overflow-hidden" style={{ height: 140 }}>
                <img src={product.img} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                  onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1558303215-4f3c4a53e2c0?w=300&q=70'; }} />
                {/* Category badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-body font-bold" style={{ background: 'rgba(0,0,0,0.55)', color: '#FFD700', backdropFilter: 'blur(4px)' }}>
                  {product.cat}
                </span>
              </div>
              {/* Info */}
              <div className="p-3">
                <p className="font-body font-bold text-foreground text-xs leading-tight mb-1.5 line-clamp-2">{product.name}</p>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-base tabular-nums" style={{ color: '#C84B0A' }}>₹{product.price}</span>
                  <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#b8860b,#E07A3A)' }}>
                    <ShoppingBag className="size-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </TiltCard>
        ))}
      </div>

      {/* Visit website CTA */}
      <div className="mx-4 mt-6">
        <a href={BAKERY.website} target="_blank" rel="noopener noreferrer"
          className="w-full py-4 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          style={{ background: 'linear-gradient(135deg,#1a0800,#3d1500)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <ExternalLink className="size-4" />
          Visit Full SNB Bakery Website
          <ChevronRight className="size-4" />
        </a>
        <p className="text-center text-[10px] font-body text-muted-foreground mt-2">Online ordering available at snbbakery.in</p>
      </div>
    </div>
  );
}

// ─── 3D Flip Toggle ───────────────────────────────────────────────────────────
function TabSwitcher({ active, onChange }: { active: 'cafe' | 'bakery'; onChange: (v: 'cafe' | 'bakery') => void }) {
  return (
    <div className="sticky top-14 z-30 px-4 py-3 bg-background/80 backdrop-blur-xl border-b border-border/60">
      <div className="relative flex rounded-2xl overflow-hidden p-1" style={{
        background: 'linear-gradient(135deg,rgba(20,8,2,0.08),rgba(180,100,20,0.06))',
        border: '1px solid rgba(180,120,40,0.2)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        {/* Sliding 3D pill */}
        <div className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            left: active === 'cafe' ? 4 : 'calc(50% + 0px)',
            background: active === 'cafe'
              ? 'linear-gradient(135deg,#E07A3A,#C84B0A)'
              : 'linear-gradient(135deg,#b8860b,#8B5E04)',
            boxShadow: active === 'cafe'
              ? '0 4px 16px rgba(200,75,10,0.45), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.2) inset'
              : '0 4px 16px rgba(180,140,0,0.4), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.2) inset',
            transform: 'translateZ(0)',
          }}
        />
        {/* Cafe button */}
        <button onClick={() => onChange('cafe')} className="relative flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-200 z-10">
          <div className={cn('transition-all duration-200', active === 'cafe' ? 'scale-110' : 'scale-100')}>
            <UtensilsCrossed className={cn('size-4 transition-all', active === 'cafe' ? 'text-white drop-shadow' : 'text-muted-foreground')} />
          </div>
          <span className={cn('font-body font-bold text-sm tracking-wide transition-all', active === 'cafe' ? 'text-white drop-shadow' : 'text-muted-foreground')}>
            Cafe
          </span>
          {active === 'cafe' && (
            <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-white/60 animate-pulse" />
          )}
        </button>
        {/* Bakery button */}
        <button onClick={() => onChange('bakery')} className="relative flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all duration-200 z-10">
          <div className={cn('transition-all duration-200', active === 'bakery' ? 'scale-110' : 'scale-100')}>
            <span className={cn('text-base transition-all', active === 'bakery' ? 'drop-shadow-[0_0_6px_rgba(255,215,0,0.8)]' : 'opacity-50')}>🥐</span>
          </div>
          <span className={cn('font-body font-bold text-sm tracking-wide transition-all', active === 'bakery' ? 'text-white drop-shadow' : 'text-muted-foreground')}>
            Bakery
          </span>
          {active === 'bakery' && (
            <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-white/60 animate-pulse" />
          )}
        </button>
      </div>
      {/* Tagline */}
      <p className="text-center text-[10px] font-body text-muted-foreground mt-1.5">
        {active === 'cafe' ? '🌿 Pure Veg · Dine In & Takeaway' : '🎂 Fresh Daily · Order Online or Call'}
      </p>
    </div>
  );
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();
  const [showMenu, setShowMenu] = useState(false);
  const [drawerCat, setDrawerCat] = useState<string | null>(null);
  const [partyFullscreen, setPartyFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'cafe' | 'bakery'>('cafe');
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
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        @keyframes pulseGlow { 0%,100% { box-shadow:0 0 14px rgba(255,215,0,0.2); } 50% { box-shadow:0 0 28px rgba(255,215,0,0.5); } }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
        .snb-badge { background:linear-gradient(90deg,#b8860b,#ffd700,#daa520,#ffd700,#b8860b); background-size:200% auto; animation:shimmer 2.5s linear infinite; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; font-weight:900; }
        .time-badge { animation:pulseGlow 2s ease-in-out infinite; }
      `}</style>

      {/* 3D Tab switcher */}
      <TabSwitcher active={activeTab} onChange={setActiveTab} />

      {/* Page content — slides in on switch */}
      <div key={activeTab} style={{ animation: 'fadeUp 0.35s ease-out both' }}>
        {activeTab === 'cafe' ? (
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
          <button onClick={() => window.open(CAFE.mapsUrl,'_blank')} className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><MapPin className="size-3" />Directions</button>
          <button onClick={bookPartyHall} className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><MessageCircle className="size-3" />Book Hall</button>
          <a href={BAKERY.website} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl text-xs font-body font-semibold text-white border border-white/20 flex items-center gap-1.5 active:opacity-70"><ExternalLink className="size-3" />Bakery</a>
        </div>
        <button onClick={() => navigate('/login')} className="text-xs font-body font-semibold text-white/40 underline underline-offset-4 mb-4 active:opacity-70">Staff Login</button>
        <p className="text-[10px] font-body text-white/25">© 2025 VRSNB Foods LLP. All rights reserved.</p>
      </footer>

      {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
      {drawerCat && <CategoryDrawer catId={drawerCat} onClose={() => setDrawerCat(null)} />}
      {partyFullscreen && <PartyHallViewer onClose={() => setPartyFullscreen(false)} />}
    </div>
  );
}
