import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { CAFE_CONFIG, MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency } from '@/lib/utils';
import {
  MapPin, Leaf, Clock, ChevronRight, ExternalLink,
  Car, PartyPopper, UtensilsCrossed, Coffee, Phone,
  Sparkles, Heart, ShieldCheck, SmilePlus,
} from 'lucide-react';
import { useEffect } from 'react';
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

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();

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
            <button onClick={() => navigate('/menu')} className="flex-1 py-3 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg">
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
        <button onClick={() => navigate('/menu')} className="w-full mt-4 py-3 rounded-xl border-2 border-primary text-primary font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
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
    </div>
  );
}
