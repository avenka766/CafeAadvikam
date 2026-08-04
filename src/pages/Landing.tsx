// src/pages/Landing.tsx
// PREMIUM REDESIGN PASS: builds on the calm, fast, no-scroll-jack foundation
// from the previous pass (still no backdrop-blur — see index.css PERF FIX
// notes; that lesson from the billing-terminal work applies here too) and
// layers in the requested premium treatment: a parallax hero, scroll-reveal
// motion (Framer Motion — already an installed dependency, no new npm risk),
// a gallery, a richer Party Hall / custom-cake section, and an embedded map.
// Preserved verbatim per requirements: the Cafe/Bakery logos, the Party Hall
// WhatsApp-enquiry CTA and its message text, all branding tokens/fonts, and
// every backend/API/auth/routing call already in the app.
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, type Variants } from 'framer-motion';
import {
  ArrowRight,
  Cake,
  CalendarCheck,
  Camera,
  Check,
  Clock,
  Coffee,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Navigation,
  Phone,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Truck,
  Utensils,
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

// Real, royalty-free Unsplash photography (Unsplash License — free to use),
// hotlinked at the CDN so no binary assets ship with the app. IDs resolved
// from each photo's og:image so the links point at the actual image.
const STOCK = {
  latteArtPour: 'https://images.unsplash.com/photo-1761271046396-97d231b59dd7',
  cappuccinoFlatlay: 'https://images.unsplash.com/photo-1524671710025-d79530c2f957',
  cafeInteriorWarm: 'https://images.unsplash.com/photo-1749871615234-98bff62995ba',
  cafeInteriorPlants: 'https://images.unsplash.com/photo-1757010055832-de355d2f8f06',
  croissantCloseup: 'https://images.unsplash.com/photo-1668446377138-c763c16e99f0',
  croissantBasket: 'https://images.unsplash.com/photo-1550005399-c95f859c0fc7',
  celebrationBalloons: 'https://images.unsplash.com/photo-1646558583388-9aa91c254ee5',
  celebrationCake: 'https://images.unsplash.com/photo-1623428454614-abaf00244e52',
};
function unsplash(url: string, w: number) {
  return `${url}?auto=format&fit=crop&w=${w}&q=80`;
}

type Venue = 'cafe' | 'bakery';

type MenuItem = { image: string; tag: string; name: string };
type GalleryItem = { image: string; caption: string };
type OccasionFeature = { icon: typeof Users; label: string };

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
  galleryEyebrow: string;
  galleryTitle: string;
  gallerySub: string;
  gallery: GalleryItem[];
  storyImage: string;
  storyBadge: string;
  storyTitle: string;
  storyP1: string;
  storyList: string[];
  occasionEyebrow: string;
  occasionTitle: string;
  occasionCopy: string;
  occasionFeatures: OccasionFeature[];
  occasionCtaLabel: string;
  occasionGallery: string[];
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
    galleryEyebrow: 'Around the cafe',
    galleryTitle: 'A look inside Cafe Aadvikam',
    gallerySub: 'The food, the coffee, and the room it all happens in.',
    gallery: [
      { image: heroMeal, caption: 'A full breakfast spread' },
      { image: unsplash(STOCK.latteArtPour, 900), caption: 'Coffee, poured properly' },
      { image: unsplash(STOCK.cafeInteriorWarm, 900), caption: 'A room built for long breakfasts' },
      { image: dosaImg, caption: 'Ghee roast, straight off the tawa' },
      { image: unsplash(STOCK.cafeInteriorPlants, 900), caption: 'Corner tables, good light' },
      { image: filterCoffeeImg, caption: 'Slow-brewed filter coffee' },
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
    occasionEyebrow: 'Celebrations',
    occasionTitle: 'A party hall built for birthdays, get-togethers, and family functions',
    occasionCopy: 'Seats up to 120. In-house catering from the same kitchen, decor support, and a team that’s done this a hundred times.',
    occasionFeatures: [
      { icon: Users, label: 'Seats up to 120 guests' },
      { icon: Utensils, label: 'In-house catering, same kitchen' },
      { icon: PartyPopper, label: 'Decor and setup support' },
      { icon: ShieldCheck, label: 'One trusted team, start to finish' },
    ],
    occasionCtaLabel: 'Check availability',
    occasionGallery: [specialThaliImg, unsplash(STOCK.celebrationBalloons, 700), unsplash(STOCK.celebrationCake, 700)],
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
    galleryEyebrow: 'Around the bakery',
    galleryTitle: 'A look inside the bakery counter',
    gallerySub: 'What comes out of the oven, every single day.',
    gallery: [
      { image: bakeryCakes, caption: 'Cakes decorated to order' },
      { image: unsplash(STOCK.croissantCloseup, 900), caption: 'Baked fresh, every morning' },
      { image: bakeryBread, caption: 'Breads and buns, small batches' },
      { image: unsplash(STOCK.croissantBasket, 900), caption: 'Straight from the oven' },
      { image: bakeryPastries, caption: 'Pastries, fresh from the counter' },
      { image: bakerySweets, caption: 'Traditional Indian sweets' },
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
    occasionEyebrow: 'Custom orders',
    occasionTitle: 'Order a cake for the day that deserves one',
    occasionCopy: 'Birthdays, anniversaries, weddings — tell us the flavour, size, and message, and we’ll have it ready for pickup or delivery around Berigai.',
    occasionFeatures: [
      { icon: Cake, label: 'Any flavour, shape, or size' },
      { icon: Sparkles, label: 'Custom fondant and piping' },
      { icon: Truck, label: 'Pickup or local delivery' },
      { icon: ShieldCheck, label: 'Never frozen, always made to order' },
    ],
    occasionCtaLabel: 'Order a custom cake',
    occasionGallery: [bakeryCakes, unsplash(STOCK.celebrationCake, 700), unsplash(STOCK.croissantBasket, 700)],
    waMessage: 'Hi, I would like to order from Sri Nanjundeshwara Bakery.',
  },
};

const TRUST_STRIP = [
  { icon: CalendarCheck, value: 'Est. 2012', label: 'Family run, Berigai' },
  { icon: Users, value: '120 seats', label: 'Party hall capacity' },
  { icon: Clock, value: '7am – 10pm', label: 'Open every single day' },
  { icon: Leaf, value: '100% in-house', label: 'Nothing frozen, nothing rushed' },
];

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

// ── Motion variants (kept to transform/opacity only — cheap to composite,
// consistent with the perf-driven "no backdrop-blur" rule elsewhere in the app) ──
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const revealViewport = { once: true, margin: '-80px' };

function Reveal({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div className={className} style={style} initial="hidden" whileInView="visible" viewport={revealViewport} variants={fadeUp}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [venue, setVenue] = useState<Venue>('cafe');
  const [mobileOpen, setMobileOpen] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroImgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const heroContentY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroFade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  useEffect(() => {
    if (currentUser) navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);

  if (currentUser) return null;

  const c = CONTENT[venue];
  const goOrder = () => navigate('/order');
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}`;
  const mapsEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}&output=embed`;
  const waUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent(c.waMessage)}`;

  const navLinks: [string, string][] = [
    ['Menu', '#menu'],
    ['Gallery', '#gallery'],
    ['Our story', '#story'],
    ...(venue === 'cafe' ? ([['Party hall', '#occasion']] as [string, string][]) : []),
    ['Visit us', '#visit'],
  ];

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
            {navLinks.map(([label, href]) => (
              <button key={href} onClick={() => scrollToId(href)} className="hover:text-primary">{label}</button>
            ))}
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
              {navLinks.map(([label, href]) => (
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

      {/* ── Hero (parallax) ── */}
      <section id="top" ref={heroRef} className="relative flex min-h-[88vh] items-end overflow-hidden scroll-mt-[76px]">
        <motion.img src={c.heroImage} alt="" style={{ y: heroImgY }} className="absolute inset-0 h-[120%] w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,15,12,0.15) 0%, rgba(10,15,12,0.4) 55%, rgba(8,10,8,0.92) 100%)' }} />
        <motion.div style={{ y: heroContentY, opacity: heroFade }} className="relative z-10 w-full px-4 pb-16 md:px-8">
          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mx-auto max-w-7xl text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="size-3.5 animate-float" /> {c.badge}
            </div>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.02] md:text-6xl lg:text-7xl">{c.title}</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">{c.lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => scrollToId('#menu')} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-stone-950 shadow-2xl shadow-black/30 transition hover:scale-[1.03] active:scale-95">
                {c.cta1}
              </button>
              <button onClick={() => scrollToId('#visit')} className="rounded-full border border-white/35 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10">
                {c.cta2}
              </button>
            </div>
            <div className="mt-12 flex flex-wrap gap-10">
              <div><p className="font-display text-3xl font-bold">12+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Years serving Berigai</p></div>
              <div><p className="font-display text-3xl font-bold">60+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">{c.statLabel}</p></div>
              <div><p className="font-display text-3xl font-bold">7am–10pm</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Open every day</p></div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Trust strip ── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger} className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {TRUST_STRIP.map(({ icon: Icon, value, label }) => (
              <motion.div key={label} variants={fadeUp} className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold leading-none text-foreground">{value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Highlights ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.highlightsEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.highlightsTitle}</h2>
          </Reveal>
          <motion.div initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {c.highlights.map(({ icon: Icon, title, copy }) => (
              <motion.div key={title} variants={fadeUp} className="rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lifted">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{copy}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Menu grid ── */}
      <section id="menu" className="scroll-mt-[76px] bg-card py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.menuEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.menuTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{c.menuSub}</p>
          </Reveal>
          <motion.div initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger} className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {c.menu.map((item) => (
              <motion.div key={item.name} variants={fadeUp} className="group relative aspect-[3/4] overflow-hidden rounded-2xl">
                <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">{item.tag}</p>
                  <h3 className="font-display text-lg font-bold">{item.name}</h3>
                </div>
              </motion.div>
            ))}
          </motion.div>
          <div className="mt-10 text-center">
            <button onClick={goOrder} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted">
              See the full menu <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section id="gallery" className="scroll-mt-[76px] py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              <Camera className="size-3.5" /> {c.galleryEyebrow}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.galleryTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{c.gallerySub}</p>
          </Reveal>
          <motion.div initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger} className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {c.gallery.map((item, i) => (
              <motion.div
                key={item.caption}
                variants={fadeUp}
                className={cn(
                  'group relative overflow-hidden rounded-2xl',
                  i === 0 ? 'col-span-2 aspect-[16/9] md:col-span-1 md:aspect-[4/5]' : 'aspect-square md:aspect-[4/5]',
                )}
              >
                <img src={item.image} alt={item.caption} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 transition group-hover:opacity-100" />
                <p className="absolute inset-x-0 bottom-0 translate-y-2 p-3 text-xs font-semibold text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  {item.caption}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Story ── */}
      <section id="story" className="scroll-mt-[76px] bg-card py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
          <Reveal className="relative overflow-hidden rounded-[28px]">
            <img src={c.storyImage} alt="" className="h-[420px] w-full object-cover md:h-[480px]" />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-card/95 px-5 py-4 shadow-lifted">
              <p className="font-display text-xl font-bold text-foreground">{c.storyBadge}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Family run, Berigai</p>
            </div>
          </Reveal>
          <Reveal>
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
          </Reveal>
        </div>
      </section>

      {/* ── Party hall (cafe) / Custom orders (bakery) ── */}
      {/* Preserved exactly: the WhatsApp-enquiry CTA (href + message text) for
          both venues. Everything else here — feature grid, image collage — is
          new presentation around that same, unchanged CTA. */}
      <section id="occasion" className="scroll-mt-[76px] py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div
            className="overflow-hidden rounded-[32px] p-8 text-white md:p-14"
            style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}
          >
            <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <Reveal>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{c.occasionEyebrow}</p>
                <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.occasionTitle}</h2>
                <p className="mt-4 max-w-md text-white/70">{c.occasionCopy}</p>

                <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                  {c.occasionFeatures.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-semibold text-white/85">
                      <Icon className="size-4 shrink-0 text-amber-300" /> {label}
                    </li>
                  ))}
                </ul>

                {venue === 'cafe' ? (
                  <a
                    href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-8 inline-flex items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold transition hover:scale-[1.03] active:scale-95"
                  >
                    <Phone className="size-4" /> {c.occasionCtaLabel}
                  </a>
                ) : (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-8 inline-flex items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold transition hover:scale-[1.03] active:scale-95"
                  >
                    <MessageCircle className="size-4" /> {c.occasionCtaLabel}
                  </a>
                )}
              </Reveal>

              <motion.div initial="hidden" whileInView="visible" viewport={revealViewport} variants={stagger} className="grid grid-cols-2 gap-3">
                <motion.div variants={fadeUp} className="col-span-2 overflow-hidden rounded-2xl">
                  <img src={c.occasionGallery[0]} alt="" className="h-[190px] w-full object-cover md:h-[220px]" />
                </motion.div>
                <motion.div variants={fadeUp} className="overflow-hidden rounded-2xl">
                  <img src={c.occasionGallery[1]} alt="" className="h-[140px] w-full object-cover md:h-[160px]" />
                </motion.div>
                <motion.div variants={fadeUp} className="overflow-hidden rounded-2xl">
                  <img src={c.occasionGallery[2]} alt="" className="h-[140px] w-full object-cover md:h-[160px]" />
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Visit us ── */}
      <section id="visit" className="scroll-mt-[76px] py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal
            className="grid gap-8 rounded-[32px] p-8 text-white md:grid-cols-3 md:p-14"
            style={{ background: 'linear-gradient(160deg, #0a4a3a 0%, #083a2e 100%)' }}
          >
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
          </Reveal>

          <Reveal className="mt-6 overflow-hidden rounded-[28px] border border-border">
            <iframe
              title="Cafe Aadvikam location"
              src={mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[320px] w-full border-0 md:h-[380px]"
            />
          </Reveal>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={goOrder} className="inline-flex items-center gap-2 rounded-full cafe-gradient px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
              {c.ctaNav} <ArrowRight className="size-4" />
            </button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-foreground transition hover:bg-muted">
              Get directions <Navigation className="size-4" />
            </a>
            <a href={`https://wa.me/${CAFE_INFO.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-foreground transition hover:bg-muted">
              WhatsApp us <MessageCircle className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center md:px-8">
          <div className="flex items-center gap-3">
            <img src={cafeLogo} alt="Cafe Aadvikam" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
            <img src={snbLogo} alt="Sri Nanjundeshwara Bakery" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground">
            {navLinks.map(([label, href]) => (
              <button key={href} onClick={() => scrollToId(href)} className="hover:text-primary">{label}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">&copy; Cafe Aadvikam · Sri Nanjundeshwara Bakery · {CAFE_INFO.address}</p>
        </div>
      </footer>

      <ChatBot />
    </main>
  );
}
