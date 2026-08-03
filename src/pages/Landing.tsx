// src/pages/Landing.tsx
// REDESIGN: replaced the old scroll-jacked, blur-heavy landing experience with
// a calmer, premium single-page layout built around a prominent Cafe/Bakery
// toggle in the nav (per the approved preview). No scroll-jacking (the old
// version had 200-500vh "cinematic scroll" sections), and no backdrop-blur —
// same lessons learned from the billing-terminal performance pass apply here:
// a fast page reads as premium; a janky one doesn't, no matter how it looks.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Cake,
  CalendarCheck,
  Check,
  Clock,
  Coffee,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Phone,
  Sparkles,
  Truck,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getRoleDefaultPath } from '@/lib/routing';
import { cn } from '@/lib/utils';
import cafeLogo from '@/assets/cafe-logo.png';
import snbLogo from '@/assets/snb-logo.png';
import heroMeal from '@/assets/hero-bg.jpg';
import bakeryCounter from '@/assets/bakery/bakery-counter.jpg';
import bakeryBread from '@/assets/bakery/bread.jpg';
import bakeryCakes from '@/assets/bakery/cakes.jpg';
import bakeryPastries from '@/assets/bakery/pastries.jpg';
import bakerySweets from '@/assets/bakery/sweets.jpg';
import dosaImg from '@/assets/foods/ghee-roast-dosa.jpg';
import specialThaliImg from '@/assets/foods/special-thali.jpg';
import filterCoffeeImg from '@/assets/foods/filter-coffee.jpg';
import paneerImg from '@/assets/foods/paneer-butter-masala.jpg';
import ChatBot from '@/components/features/ChatBot';

const CAFE_INFO = {
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '7 AM – 10 PM Daily',
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
  mapsQuery: 'Cafe Aadvikam 109 Bagalur Main Road Berikai 635105',
};

type Venue = 'cafe' | 'bakery';

type MenuItem = { image: string; tag: string; name: string };

type VenueContent = {
  navSub: string;
  logo: string;
  ctaNav: string;
  badge: string;
  title: string;
  lede: string;
  cta1: string;
  cta2: string;
  statLabel: string;
  heroImage: string;
  highlightsEyebrow: string;
  highlightsTitle: string;
  highlights: { icon: typeof Leaf; title: string; copy: string }[];
  menuEyebrow: string;
  menuTitle: string;
  menuSub: string;
  menu: MenuItem[];
  storyImage: string;
  storyBadge: string;
  storyTitle: string;
  storyP1: string;
  storyList: string[];
  waMessage: string;
};

const CONTENT: Record<Venue, VenueContent> = {
  cafe: {
    navSub: 'Cafe · Bakery · Party hall',
    logo: cafeLogo,
    ctaNav: 'Place order',
    badge: 'Fresh, from scratch, every single day',
    title: 'South Indian comfort, cafe warmth, one honest kitchen',
    lede: 'Ghee-roast dosas, slow-brewed filter coffee, and a banana-leaf feast — served in a space built for long breakfasts and longer conversations.',
    cta1: 'View the menu',
    cta2: 'Reserve a table',
    statLabel: 'Signature dishes',
    heroImage: heroMeal,
    highlightsEyebrow: 'Why guests keep coming back',
    highlightsTitle: 'Made fresh. Served warm. Always on time.',
    highlights: [
      { icon: Leaf, title: 'Fresh daily', copy: 'Batter ground and chutneys made each morning, not the night before.' },
      { icon: UtensilsCrossed, title: 'Dine-in and takeaway', copy: 'Sit down for a full breakfast, or call ahead and grab it on the way.' },
      { icon: CalendarCheck, title: 'Party hall on-site', copy: 'Seats 120 for birthdays, get-togethers, and family functions.' },
      { icon: Clock, title: 'Consistent quality', copy: 'Same recipe, same standard, on your first visit or your hundredth.' },
    ],
    menuEyebrow: 'The lineup',
    menuTitle: 'Signature dishes guests order on repeat',
    menuSub: 'A short list of what we’re known for — the full menu has a lot more.',
    menu: [
      { image: dosaImg, tag: 'Breakfast', name: 'Ghee roast dosa' },
      { image: specialThaliImg, tag: 'Full meal', name: 'Aadvikam special thali' },
      { image: filterCoffeeImg, tag: 'Beverage', name: 'Filter coffee' },
      { image: paneerImg, tag: 'Main course', name: 'Paneer butter masala' },
    ],
    storyImage: bakeryCounter,
    storyBadge: 'Since 2012',
    storyTitle: 'Two kitchens, one standard: nothing leaves half-effort',
    storyP1: 'Cafe Aadvikam started as a single breakfast counter on Bagalur Main Road. Today it’s a full-service cafe, a working bakery under the Sri Nanjundeshwara Bakery name, and a party hall — all run by the same family, on the same standard.',
    storyList: [
      'Stone-ground batter, made fresh every morning',
      'Traditional filter coffee, brewed the slow way',
      'A party hall for up to 120 guests, run by the same team',
    ],
    waMessage: 'Hi Cafe Aadvikam, I would like to place an order.',
  },
  bakery: {
    navSub: 'Sri Nanjundeshwara Bakery',
    logo: snbLogo,
    ctaNav: 'Order a cake',
    badge: 'Baked fresh, decorated to order',
    title: 'Cakes, breads, and sweets baked the way you remember',
    lede: 'From birthday cakes to festival sweets, Sri Nanjundeshwara Bakery bakes everything in-house — nothing frozen, nothing rushed.',
    cta1: 'View bakery menu',
    cta2: 'Order a custom cake',
    statLabel: 'Bakery items',
    heroImage: bakeryCounter,
    highlightsEyebrow: 'Why Berigai bakes with us',
    highlightsTitle: 'Baked fresh. Decorated with care. Ready on time.',
    highlights: [
      { icon: Cake, title: 'Custom cakes', copy: 'Any flavour, size, or message — designed around your occasion.' },
      { icon: Sparkles, title: 'Fresh bakes daily', copy: 'Breads, buns, and pastries baked in small batches through the day.' },
      { icon: Coffee, title: 'Festival sweets', copy: 'Traditional Indian sweets made the same way our family always has.' },
      { icon: Truck, title: 'Pickup and delivery', copy: 'Order ahead and collect in-store, or have it delivered locally.' },
    ],
    menuEyebrow: 'The counter',
    menuTitle: 'Bakery favourites, made in-house every day',
    menuSub: 'A short list of what leaves the counter fastest — ask about custom orders too.',
    menu: [
      { image: bakeryCakes, tag: 'Celebration', name: 'Custom cakes' },
      { image: bakeryPastries, tag: 'Bakery', name: 'Fresh pastries' },
      { image: bakeryBread, tag: 'Bakery', name: 'Breads and buns' },
      { image: bakerySweets, tag: 'Sweets', name: 'Indian sweet temptations' },
    ],
    storyImage: bakeryCounter,
    storyBadge: 'Sri Nanjundeshwara',
    storyTitle: 'Baked in-house, the same recipes since day one',
    storyP1: 'Every cake is decorated to order, every loaf is baked in small daily batches, and every festival sweet is still made the traditional way — by the same family that runs the cafe next door.',
    storyList: [
      'Every cake decorated to order, never pulled from a freezer',
      'Small daily batches of bread, buns, and pastries',
      'Festival sweets made the traditional way',
    ],
    waMessage: 'Hi, I would like to order from Sri Nanjundeshwara Bakery.',
  },
};

function scrollToId(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function VenueToggle({ venue, onChange }: { venue: Venue; onChange: (v: Venue) => void }) {
  return (
    <div className="relative flex items-center rounded-full border border-border bg-muted p-1" role="tablist" aria-label="Choose Cafe or Bakery">
      <span
        className={cn(
          'absolute inset-y-1 w-[calc(50%-4px)] rounded-full cafe-gradient transition-transform duration-300 ease-out',
          venue === 'bakery' ? 'translate-x-[calc(100%+8px)] gold-gradient' : 'translate-x-0',
        )}
        aria-hidden="true"
      />
      <button
        type="button"
        role="tab"
        aria-selected={venue === 'cafe'}
        onClick={() => onChange('cafe')}
        className={cn('relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors', venue === 'cafe' ? 'text-primary-foreground' : 'text-muted-foreground')}
      >
        <UtensilsCrossed className="size-3.5" /> Cafe
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={venue === 'bakery'}
        onClick={() => onChange('bakery')}
        className={cn('relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors', venue === 'bakery' ? 'text-primary-foreground' : 'text-muted-foreground')}
      >
        <Cake className="size-3.5" /> Bakery
      </button>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [venue, setVenue] = useState<Venue>('cafe');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (currentUser) navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);

  if (currentUser) return null;

  const c = CONTENT[venue];
  const goOrder = () => navigate('/order');
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}`;
  const waUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent(c.waMessage)}`;

  return (
    <main className="min-h-screen bg-background font-body antialiased">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 md:px-8">
          <button onClick={() => scrollToId('#top')} className="flex items-center gap-3 text-left">
            <img src={c.logo} alt={venue === 'cafe' ? 'Cafe Aadvikam' : 'Sri Nanjundeshwara Bakery'} className="size-11 rounded-full border border-border bg-white object-contain p-1" />
            <div>
              <p className="font-display text-lg font-bold leading-none text-foreground">Cafe Aadvikam</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{c.navSub}</p>
            </div>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground lg:flex">
            <button onClick={() => scrollToId('#menu')} className="hover:text-primary">Menu</button>
            <button onClick={() => scrollToId('#story')} className="hover:text-primary">Our story</button>
            {venue === 'cafe' && <button onClick={() => scrollToId('#occasion')} className="hover:text-primary">Party hall</button>}
            <button onClick={() => scrollToId('#visit')} className="hover:text-primary">Visit us</button>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <VenueToggle venue={venue} onChange={setVenue} />
            <button onClick={() => navigate('/login')} className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted">
              Login
            </button>
            <button onClick={goOrder} className="rounded-full cafe-gradient px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
              {c.ctaNav}
            </button>
          </div>

          <button onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-full bg-muted md:hidden" aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
        </div>
      </header>

      {/* ── Mobile menu ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] flex md:hidden">
          <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/60" />
          <aside className="relative ml-auto flex h-full w-[min(86vw,360px)] flex-col bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <img src={c.logo} alt="" className="size-10 rounded-full border border-border bg-white object-contain p-1" />
                <p className="font-display text-lg font-bold">Cafe Aadvikam</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-full bg-muted" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5">
              <VenueToggle venue={venue} onChange={setVenue} />
            </div>
            <nav className="mt-5 flex flex-col gap-1">
              {[['Menu', '#menu'], ['Our story', '#story'], ...(venue === 'cafe' ? [['Party hall', '#occasion']] as const : []), ['Visit us', '#visit']].map(([label, href]) => (
                <button key={href} onClick={() => { setMobileOpen(false); setTimeout(() => scrollToId(href), 100); }} className="rounded-xl px-4 py-3 text-left text-base font-bold text-foreground active:bg-muted">
                  {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button onClick={() => { setMobileOpen(false); goOrder(); }} className="w-full rounded-2xl cafe-gradient px-4 py-3.5 text-sm font-bold text-primary-foreground">{c.ctaNav}</button>
              <button onClick={() => { setMobileOpen(false); navigate('/login'); }} className="w-full rounded-2xl border border-border px-4 py-3.5 text-sm font-bold text-foreground">Login</button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Hero ── */}
      <section id="top" className="relative flex min-h-[85vh] items-end overflow-hidden">
        <img src={c.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,15,12,0.15) 0%, rgba(10,15,12,0.4) 55%, rgba(8,10,8,0.9) 100%)' }} />
        <div className="relative z-10 w-full px-4 pb-16 md:px-8">
          <div className="mx-auto max-w-7xl text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="size-3.5" /> {c.badge}
            </div>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.02] md:text-6xl lg:text-7xl">{c.title}</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">{c.lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => scrollToId('#menu')} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-stone-950 shadow-2xl shadow-black/30">
                {c.cta1}
              </button>
              <button onClick={() => scrollToId('#visit')} className="rounded-full border border-white/35 bg-white/5 px-6 py-3 text-sm font-bold text-white">
                {c.cta2}
              </button>
            </div>
            <div className="mt-12 flex flex-wrap gap-10">
              <div><p className="font-display text-3xl font-bold">12+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Years serving Berigai</p></div>
              <div><p className="font-display text-3xl font-bold">60+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">{c.statLabel}</p></div>
              <div><p className="font-display text-3xl font-bold">7am–10pm</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Open every day</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Highlights ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.highlightsEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.highlightsTitle}</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {c.highlights.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Menu grid ── */}
      <section id="menu" className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.menuEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.menuTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{c.menuSub}</p>
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {c.menu.map((item) => (
              <div key={item.name} className="group relative aspect-[3/4] overflow-hidden rounded-2xl">
                <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">{item.tag}</p>
                  <h3 className="font-display text-lg font-bold">{item.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Story ── */}
      <section id="story" className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
          <div className="relative overflow-hidden rounded-[28px]">
            <img src={c.storyImage} alt="" className="h-[420px] w-full object-cover md:h-[480px]" />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-card/95 px-5 py-4 shadow-lifted">
              <p className="font-display text-xl font-bold text-foreground">{c.storyBadge}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Family run, Berigai</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Our story</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.storyTitle}</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">{c.storyP1}</p>
            <ul className="mt-6 space-y-3">
              {c.storyList.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-medium text-foreground">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3" /></span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Party hall (cafe) / Custom orders (bakery) ── */}
      <section id="occasion" className="py-10">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className={cn('grid gap-10 rounded-[32px] p-8 text-white md:p-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center', venue === 'cafe' ? 'bg-espresso-gradient' : 'espresso-gradient')} style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}>
            {venue === 'cafe' ? (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Celebrations</p>
                  <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">A party hall built for birthdays, get-togethers, and family functions</h2>
                  <p className="mt-4 max-w-md text-white/70">Seats up to 120. In-house catering from the same kitchen, decor support, and a team that’s done this a hundred times.</p>
                  <a href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking.')}`} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold">
                    <Phone className="size-4" /> Check availability
                  </a>
                </div>
                <div className="overflow-hidden rounded-2xl">
                  <img src={specialThaliImg} alt="" className="h-[280px] w-full object-cover md:h-[320px]" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Custom orders</p>
                  <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Order a cake for the day that deserves one</h2>
                  <p className="mt-4 max-w-md text-white/70">Birthdays, anniversaries, weddings — tell us the flavour, size, and message, and we’ll have it ready for pickup or delivery around Berigai.</p>
                  <a href={waUrl} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold">
                    <MessageCircle className="size-4" /> Order a custom cake
                  </a>
                </div>
                <div className="overflow-hidden rounded-2xl">
                  <img src={bakeryCakes} alt="" className="h-[280px] w-full object-cover md:h-[320px]" />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Visit us ── */}
      <section id="visit" className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="grid gap-8 rounded-[32px] bg-espresso-gradient p-8 text-white md:grid-cols-3 md:p-14" style={{ background: 'linear-gradient(160deg, #0a4a3a 0%, #083a2e 100%)' }}>
            <div>
              <MapPin className="mb-3 size-6 text-amber-300" />
              <h3 className="text-lg font-bold">Find us</h3>
              <p className="mt-2 font-display text-2xl font-bold">109 Bagalur Main Road</p>
              <p className="mt-1 text-sm text-white/70">Berigai, Tamil Nadu 635105</p>
            </div>
            <div>
              <Clock className="mb-3 size-6 text-amber-300" />
              <h3 className="text-lg font-bold">Hours</h3>
              <p className="mt-2 font-display text-2xl font-bold">{CAFE_INFO.hours}</p>
              <p className="mt-1 text-sm text-white/70">Open every day of the week</p>
            </div>
            <div>
              <Phone className="mb-3 size-6 text-amber-300" />
              <h3 className="text-lg font-bold">Reach us</h3>
              <p className="mt-2 font-display text-2xl font-bold">{CAFE_INFO.phone}</p>
              <p className="mt-1 text-sm text-white/70">Call or WhatsApp for orders and bookings</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={goOrder} className="inline-flex items-center gap-2 rounded-full cafe-gradient px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-teal">
              {c.ctaNav} <ArrowRight className="size-4" />
            </button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-foreground">
              Get directions <MapPin className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-muted-foreground">&copy; Cafe Aadvikam · Sri Nanjundeshwara Bakery</p>
      </footer>

      <ChatBot />
    </main>
  );
}
