import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { CAFE_CONFIG, MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  MapPin, Leaf, Clock, ChevronRight, ExternalLink,
  Car, PartyPopper, UtensilsCrossed, Coffee, Phone,
  Sparkles, Heart, ShieldCheck, SmilePlus, X, ImageOff,
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import heroBg from '@/assets/hero-bg.jpg';
import cafeLogo from '@/assets/cafe-logo.png';

const HIGHLIGHTS = [
  { icon: <Leaf className="size-5" />, label: 'Pure Vegetarian' },
  { icon: <Sparkles className="size-5" />, label: 'Fresh Ingredients' },
  { icon: <ShieldCheck className="size-5" />, label: 'Hygienic Kitchen' },
  { icon: <SmilePlus className="size-5" />, label: 'Friendly Service' },
];

const OFFERS = [
  { icon: <Leaf className="size-7 text-primary" />, title: 'Pure Vegetarian', desc: 'Authentic South Indian & North Indian cuisine' },
  { icon: <Coffee className="size-7 text-primary" />, title: 'Bakery', desc: 'Fresh baked goods & pastries daily' },
  { icon: <PartyPopper className="size-7 text-primary" />, title: 'Party Hall', desc: 'Spacious hall for celebrations & events' },
  { icon: <Car className="size-7 text-primary" />, title: 'Ample Parking', desc: 'Large parking space' },
];

const SPECIALTIES = [
  { cat: 'Breakfast', items: 'Idly, Dosa, Pongal, Vada', icon: '🍳' },
  { cat: 'Biryani', items: 'Veg, Paneer, Jackfruit', icon: '🍚' },
  { cat: 'Chinese', items: 'Manchurian, Fried Rice', icon: '🥡' },
  { cat: 'Tandoori', items: 'Paneer Tikka, Kababs', icon: '🔥' },
  { cat: 'Bakery', items: 'Bread, Pastries', icon: '🍰' },
  { cat: 'Beverages', items: 'Coffee, Tea, Juices', icon: '☕' },
];

// ── Menu Popup ─────────────────────────────────────────────────────────────
function MenuPopup({ onClose }: { onClose: () => void }) {
  const { items } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');

  const enabledItems = useMemo(() => items.filter((i) => i.enabled), [items]);

  const activeCategories = useMemo(() =>
    MENU_CATEGORIES.filter((cat) => enabledItems.some((i) => i.category === cat.id)),
    [enabledItems]
  );

  const displayCategories = useMemo(() =>
    selectedCategory === 'all' ? activeCategories : activeCategories.filter((c) => c.id === selectedCategory),
    [selectedCategory, activeCategories]
  );

  // Prevent body scroll when popup is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full bg-background rounded-t-3xl shadow-2xl flex flex-col"
        style={{ height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Our Menu</h2>
            <p className="text-xs font-body text-muted-foreground mt-0.5">Pure vegetarian delights</p>
          </div>
          <button
            onClick={onClose}
            className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Close menu"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Category filter — sticky inside popup */}
        <div className="shrink-0 border-b border-border">
          <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
                selectedCategory === 'all'
                  ? 'cafe-gradient text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-foreground'
              )}
            >
              All Items
            </button>
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
                  selectedCategory === cat.id
                    ? 'cafe-gradient text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-foreground'
                )}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable menu list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {enabledItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <p className="text-4xl">🍽️</p>
              <p className="font-body text-muted-foreground text-sm">Menu is being updated</p>
            </div>
          ) : (
            displayCategories.map((cat) => {
              const catItems = enabledItems.filter((i) => i.category === cat.id);
              if (catItems.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <span className="text-xl">{cat.icon}</span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-foreground">{cat.name}</h3>
                      <p className="text-[10px] font-body text-muted-foreground">{cat.timing}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {catItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" />
                            : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-lg">{cat.icon}</div>
                          }
                          <span className="text-sm font-body text-foreground">{item.name}</span>
                        </div>
                        <div className="flex flex-col items-end shrink-0 ml-3 gap-1">
                          <span className="text-sm font-body font-bold text-primary tabular-nums">
                            {formatCurrency(item.price)}
                          </span>
                          <span className="text-[9px] font-body px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">VEG</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {/* Bottom padding for safe scrolling */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

// ── Landing Page ───────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  if (currentUser) {
    const path = currentUser.role === 'order_taker' ? '/order-pad'
      : currentUser.role === 'admin' ? '/admin-dashboard' : '/billing';
    navigate(path, { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background pt-14">
      <section className="relative h-[75vh] min-h-[420px] overflow-hidden">
        <img src={heroBg} alt="South Indian cuisine" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
        <div className="absolute inset-0 chevron-pattern opacity-20" />
        <div className="relative h-full flex flex-col justify-end px-5 pb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-[10px] font-body font-bold uppercase tracking-wider">{CAFE_CONFIG.type}</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-[1.1]">{CAFE_CONFIG.name}</h1>
          <p className="font-display text-lg text-white/90 mt-1 italic">{CAFE_CONFIG.tagline}</p>
          <p className="text-sm font-body text-white/70 mt-1">{CAFE_CONFIG.venture}</p>
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setShowMenu(true)}
              className="flex-1 py-3 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg"
            >
              <UtensilsCrossed className="size-4" />View Menu
            </button>
            <a href={CAFE_CONFIG.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 rounded-xl bg-white/20 backdrop-blur-sm text-white font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform border border-white/30">
              <ExternalLink className="size-4" />Get Directions
            </a>
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground px-5 py-4">
        <div className="flex flex-col gap-2 text-sm font-body">
          <div className="flex items-center gap-2"><Clock className="size-4 shrink-0 opacity-80" /><span className="font-semibold">Open {CAFE_CONFIG.hours}</span></div>
          <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 opacity-80" /><span>{CAFE_CONFIG.address}</span></div>
          <div className="flex items-center gap-2"><Phone className="size-4 shrink-0 opacity-80" /><span>Contact: Available at location</span></div>
          <div className="flex items-center gap-2"><Leaf className="size-4 shrink-0 opacity-80" /><span>VRSNB Foods LLP</span></div>
        </div>
      </section>

      <section className="px-5 py-8">
        <h2 className="font-display text-2xl font-bold text-foreground mb-5">What We Offer</h2>
        <div className="grid grid-cols-2 gap-3">
          {OFFERS.map((o) => (
            <div key={o.title} className="bg-card border border-border rounded-xl p-4 flex flex-col items-center text-center gap-2">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">{o.icon}</div>
              <h3 className="font-body text-sm font-bold text-foreground">{o.title}</h3>
              <p className="text-xs font-body text-muted-foreground leading-relaxed">{o.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-8 bg-card border-y border-border">
        <div className="flex items-center gap-3 mb-4">
          <img src={cafeLogo} alt="Cafe Aadvikam Logo" className="size-14 rounded-xl object-cover" />
          <h2 className="font-display text-2xl font-bold text-foreground">Welcome to Cafe Aadvikam</h2>
        </div>
        <p className="text-sm font-body text-muted-foreground leading-relaxed mb-3">{CAFE_CONFIG.description}</p>
        <p className="text-sm font-body text-muted-foreground leading-relaxed mb-5">{CAFE_CONFIG.partyDescription}</p>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHTS.map((h) => (
            <span key={h.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-body font-semibold">{h.icon}{h.label}</span>
          ))}
        </div>
      </section>

      <section className="px-5 py-8">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">Our Specialties</h2>
        <p className="text-sm font-body text-muted-foreground mb-5">From crispy dosas to aromatic biryanis</p>
        <div className="grid grid-cols-2 gap-3">
          {SPECIALTIES.map((s) => (
            <div key={s.cat} className="bg-card border border-border rounded-xl p-3.5">
              <span className="text-2xl">{s.icon}</span>
              <h3 className="font-body text-sm font-bold text-foreground mt-1">{s.cat}</h3>
              <p className="text-xs font-body text-muted-foreground mt-0.5">{s.items}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowMenu(true)}
          className="w-full mt-4 py-3 rounded-xl border-2 border-primary text-primary font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          <UtensilsCrossed className="size-4" />View Full Menu
        </button>
      </section>

      <section className="px-5 py-8 bg-card border-y border-border">
        <div className="flex items-center gap-2 mb-3">
          <PartyPopper className="size-6 text-accent-foreground" />
          <h2 className="font-display text-2xl font-bold text-foreground">Party Hall Available</h2>
        </div>
        <p className="text-sm font-body text-muted-foreground leading-relaxed mb-4">Host your events at Cafe Aadvikam. Perfect for birthdays, family gatherings, and corporate events.</p>
        <a href={CAFE_CONFIG.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gold-gradient text-white font-body font-bold text-sm active:scale-95 transition-transform shadow-md">
          Enquire Now<ChevronRight className="size-4" />
        </a>
        <div className="mt-4 space-y-1 text-xs font-body text-muted-foreground">
          <p className="font-semibold text-foreground">{CAFE_CONFIG.name}</p>
          <p>{CAFE_CONFIG.address}</p>
          <p>Open: {CAFE_CONFIG.hours}</p>
        </div>
      </section>

      <footer className="bg-foreground text-primary-foreground px-5 py-8 text-center">
        <button onClick={() => navigate('/login')} className="text-sm font-body font-semibold text-primary-foreground/80 underline underline-offset-4 mb-3 active:opacity-70">Staff Login</button>
        <p className="text-xs font-body text-primary-foreground/60 mb-1">VRSNB Foods LLP</p>
        <p className="text-xs font-body text-primary-foreground/50">© 2025 {CAFE_CONFIG.name}. All rights reserved.</p>
        <p className="text-xs font-body text-primary-foreground/40 mt-0.5">{CAFE_CONFIG.type} Restaurant</p>
      </footer>

      {/* Menu Popup */}
      {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
    </div>
  );
}
