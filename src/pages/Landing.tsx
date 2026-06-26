import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  CalendarCheck,
  Cake,
  ChevronDown,
  Clock,
  Coffee,
  Croissant,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Phone,
  Sparkles,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getRoleDefaultPath } from '@/lib/routing';
import { cn } from '@/lib/utils';
import heroMeal from '@/assets/hero-bg.jpg';
import cafeLogo from '@/assets/cafe-logo.png';
import snbLogo from '@/assets/snb-logo.png';
import bakeryBread from '@/assets/bakery/bread.jpg';
import bakeryCakes from '@/assets/bakery/cakes.jpg';
import bakeryPastries from '@/assets/bakery/pastries.jpg';
import bakerySweets from '@/assets/bakery/sweets.jpg';
import bakeryCounter from '@/assets/bakery/bakery-counter.jpg';
import bananaLeafBg from '@/assets/banana-leaf-bg.jpg';
import idliImg from '@/assets/foods/idli.jpg';
import sambarImg from '@/assets/foods/sambar.jpg';
import chutneyImg from '@/assets/foods/chutney.jpg';
import dosaImg from '@/assets/foods/ghee-roast-dosa.jpg';
import kesariImg from '@/assets/foods/rava-kesari.jpg';
import specialThaliImg from '@/assets/foods/special-thali.jpg';
import filterCoffeeImg from '@/assets/foods/filter-coffee.jpg';
import paneerImg from '@/assets/foods/paneer-butter-masala.jpg';
import limeSodaImg from '@/assets/foods/fresh-lime-soda.jpg';
import ChatBot from '@/components/features/ChatBot';

const CAFE = {
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '7 AM – 10 PM Daily',
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
  mapsQuery: 'Cafe Aadvikam 109 Bagalur Main Road Berikai 635105',
};

const BAKERY = {
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
};

const IMG = {
  partyHall: '/party-hall.jpg',
  dosa: dosaImg,
  thali: specialThaliImg,
  coffee: filterCoffeeImg,
  bakery: bakeryBread,
  cake: bakeryCakes,
  pastry: bakeryPastries,
  sweets: bakerySweets,
  lime: limeSodaImg,
  paneer: paneerImg,
  bakeryCounter: bakeryCounter,
};

const navItems = [
  ['Feast', '#leaf'],
  ['Bakery', '#bakery'],
  ['Signature', '#signature'],
  ['Party Hall', '#party-hall'],
  ['Location', '#visit'],
] as const;

const leafItems = [
  { title: 'Soft Idli', copy: 'Steamed fresh for a comforting South Indian start.', image: idliImg, x: '21%', y: '38%' },
  { title: 'Sambar', copy: 'Slow-cooked lentils, vegetables, and roasted spices.', image: sambarImg, x: '42%', y: '52%' },
  { title: 'Coconut Chutney', copy: 'Ground fresh every morning before the first breakfast order.', image: chutneyImg, x: '61%', y: '36%' },
  { title: 'Ghee Roast Dosa', copy: 'Crispy, golden, and served hot from the tawa.', image: dosaImg, x: '47%', y: '69%' },
  { title: 'Rava Kesari', copy: 'Saffron-sweet comfort to finish the meal.', image: kesariImg, x: '75%', y: '55%' },
];

const signatureItems = [
  { name: 'Ghee Roast Dosa', tag: 'Golden. Crisp. Legendary.', image: IMG.dosa },
  { name: 'Aadvikam Special Thali', tag: 'A full banana-leaf style feast.', image: IMG.thali },
  { name: 'South Indian Breakfast', tag: 'Idli, dosa, sambar, chutney, and coffee.', image: heroMeal },
  { name: 'Filter Coffee', tag: 'Traditional brew, cafe-style comfort.', image: IMG.coffee },
  { name: 'Rava Kesari', tag: 'Saffron-sweet comfort in every spoon.', image: IMG.sweets },
  { name: 'Paneer Butter Masala', tag: 'Rich, creamy, and family favourite.', image: IMG.paneer },
  { name: 'Fresh Lime Soda', tag: 'Sweet, salty, chilled, and refreshing.', image: IMG.lime },
  { name: 'Fresh Bakery', tag: 'Breads, buns, cakes, pastries, and cookies.', image: IMG.bakery },
  { name: 'Cakes & Pastries', tag: 'Celebration treats from our bakery.', image: IMG.cake },
  { name: 'Sweet Temptations', tag: 'Indian sweets meet bakery craft.', image: IMG.pastry },
];

function scrollToId(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function FloatingNav({ onMenuOpen }: { onMenuOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 px-3 pt-3 md:px-8 md:pt-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/15 bg-black/45 px-3 py-3 text-white shadow-2xl backdrop-blur-xl md:px-5">
          <button onClick={() => scrollToId('#hero')} className="flex items-center gap-3 text-left">
            <img src={cafeLogo} alt="Cafe Aadvikam" className="h-10 w-10 rounded-full bg-white object-contain p-1" />
            <div>
              <p className="font-display text-base font-black leading-none md:text-lg">Cafe Aadvikam</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-amber-100/75 md:text-[10px]">Cafe · Bakery · Party Hall</p>
            </div>
          </button>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-white/75 lg:flex">
            {navItems.map(([label, href]) => (
              <button key={label} onClick={() => scrollToId(href)} className="transition hover:text-amber-200">
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button onClick={onMenuOpen} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/20">
              Place Order
            </button>
            <button onClick={() => navigate('/order/track')} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/20">
              Track Order
            </button>
            <button onClick={() => scrollToId('#party-hall')} className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/20 transition hover:scale-105">
              <CalendarCheck className="h-4 w-4" /> Book Party Hall
            </button>
            <button onClick={() => navigate('/login')} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">
              Login
            </button>
          </div>

          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 md:hidden">
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed inset-y-0 right-0 z-[61] flex w-[min(86vw,360px)] flex-col bg-[#130d08] p-5 text-white shadow-2xl md:hidden"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <img src={cafeLogo} alt="Cafe Aadvikam" className="size-11 rounded-full bg-white object-contain p-1" />
                  <div><p className="font-display text-lg font-black">Cafe Aadvikam</p><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/70">Cafe · Bakery</p></div>
                </div>
                <button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/10"><X className="size-5" /></button>
              </div>
              <nav className="mt-5 flex flex-col gap-2">
                {navItems.map(([label, href]) => (
                  <button key={label} onClick={() => { setOpen(false); setTimeout(() => scrollToId(href), 100); }} className="rounded-2xl px-4 py-3 text-left text-base font-black transition active:bg-white/10">{label}</button>
                ))}
              </nav>
              <div className="mt-auto space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <button onClick={() => { setOpen(false); setTimeout(onMenuOpen, 120); }} className="w-full rounded-2xl bg-amber-300 px-4 py-3.5 text-sm font-black text-stone-950">Place Order</button>
                <button onClick={() => { setOpen(false); navigate('/order/track'); }} className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm font-black">Track Order</button>
                <button onClick={() => { setOpen(false); navigate('/login'); }} className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm font-black">Login</button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function VenueToggle({ active, onChange }: { active: 'cafe' | 'bakery'; onChange: (venue: 'cafe' | 'bakery') => void }) {
  return (
    <div
      className="fixed right-3 z-50 flex flex-col gap-1.5 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
      style={{
        top: '88px',
        background: 'rgba(15,6,2,0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(180,120,40,0.3)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,215,0,0.08)',
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-1.5 h-[58px] rounded-xl bg-white/10"
        animate={{ y: active === 'cafe' ? 0 : 66 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      />
      <motion.div
        className="pointer-events-none absolute -right-1 top-1 text-amber-300"
        animate={{ rotate: active === 'cafe' ? 0 : 180, scale: [1, 1.25, 1] }}
        transition={{ rotate: { duration: 0.35 }, scale: { duration: 0.45 } }}
      >
        <Sparkles className="size-4" />
      </motion.div>
      <button
        type="button"
        onClick={() => onChange('cafe')}
        aria-label="Switch to Cafe Aadvikam"
        aria-pressed={active === 'cafe'}
        className="relative flex min-w-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-2.5 transition-all duration-300 active:scale-90"
        style={active === 'cafe'
          ? { background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', boxShadow: '0 4px 16px rgba(200,75,10,0.55)' }
          : { background: 'rgba(255,255,255,0.05)' }}
      >
        <UtensilsCrossed className={cn('size-4 transition-all', active === 'cafe' ? 'text-white' : 'text-white/40')} />
        <span className={cn('text-[9px] font-body font-bold leading-none tracking-wide transition-all', active === 'cafe' ? 'text-white' : 'text-white/35')}>Cafe</span>
      </button>
      <div className="mx-1.5 h-px bg-amber-300/15" />
      <button
        type="button"
        onClick={() => onChange('bakery')}
        aria-label="Switch to VRSNB Bakery"
        aria-pressed={active === 'bakery'}
        className="relative flex min-w-[52px] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-2.5 transition-all duration-300 active:scale-90"
        style={active === 'bakery'
          ? { background: 'linear-gradient(135deg,#b8860b,#8B5E04)', boxShadow: '0 4px 16px rgba(180,140,0,0.5)' }
          : { background: 'rgba(255,255,255,0.05)' }}
      >
        <img src={snbLogo} alt="VRSNB Bakery" className={cn('size-6 object-contain transition-all', active === 'bakery' ? 'opacity-100 drop-shadow-[0_0_6px_rgba(255,215,0,0.9)]' : 'opacity-30')} />
        <span className={cn('text-[9px] font-body font-bold leading-none tracking-wide transition-all', active === 'bakery' ? 'text-white' : 'text-white/35')}>Bakery</span>
      </button>
    </div>
  );
}

function HeroScene() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1.03, 1.28]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const opacity = useTransform(scrollYProgress, [0, 0.78], [1, 0]);

  return (
    <section id="hero" ref={ref} className="relative h-[220vh] bg-stone-950">
      <div className="sticky top-0 h-screen overflow-hidden">
        <motion.img src={heroMeal} alt="South Indian meal at Cafe Aadvikam" style={{ scale, y }} className="absolute inset-0 h-full w-full object-cover" />
        <motion.div animate={{ opacity: [0.16, 0.38, 0.16], y: [0, -22, 0] }} transition={{ repeat: Infinity, duration: 5.5, ease: 'easeInOut' }} className="absolute left-[42%] top-[18%] h-72 w-72 rounded-full bg-white/25 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.08),rgba(0,0,0,0.92))]" />
        <motion.div style={{ opacity }} className="relative z-10 flex h-full items-center justify-center px-5 text-center text-white">
          <div className="max-w-6xl">
            <motion.div initial={{ y: 25, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-100 backdrop-blur-xl md:text-sm">
              <Leaf className="h-4 w-4" /> Pure vegetarian paradise in Berikai
            </motion.div>
            <motion.h1 initial={{ y: 45, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="font-display text-5xl font-black leading-[0.94] tracking-tight md:text-8xl lg:text-9xl">
              A South Indian Meal, Told As A Story.
            </motion.h1>
            <motion.p initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-white/80 md:text-2xl">
              Step into Cafe Aadvikam, where authentic South Indian flavours, fresh bakery aromas, and warm celebrations come alive in every scroll.
            </motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button onClick={() => scrollToId('#leaf')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black text-stone-950 shadow-2xl shadow-black/30">
                Begin the feast <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={() => scrollToId('#party-hall')} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 font-black text-white backdrop-blur-xl">
                <CalendarCheck className="h-4 w-4" /> Book Party Hall
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LeafItem({ item, index, progress }: { item: typeof leafItems[number]; index: number; progress: ReturnType<typeof useScroll>['scrollYProgress'] }) {
  const start = index / leafItems.length;
  const end = Math.min(1, start + 0.22);
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const y = useTransform(progress, [start, end], [80, 0]);
  const scale = useTransform(progress, [start, end], [0.7, 1]);
  return (
    <motion.div
      style={{ left: item.x, top: item.y, opacity, y, scale }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
    >
      <div className="group relative size-24 overflow-hidden rounded-full border-[6px] border-white bg-white shadow-2xl shadow-black/45 md:size-32">
        <img src={item.image} alt={item.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
        <span className="absolute bottom-2 left-2 right-2 text-center text-[9px] font-black uppercase leading-tight tracking-wide text-white drop-shadow md:text-[10px]">{item.title}</span>
      </div>
    </motion.div>
  );
}

function LeafExperience() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const leafScale = useTransform(scrollYProgress, [0, 1], [0.96, 1.05]);

  return (
    <section id="leaf" ref={ref} className="relative h-[390vh] bg-[#120e08] text-white">
      <div className="sticky top-0 grid h-screen items-center overflow-hidden px-4 py-24 lg:grid-cols-[1.18fr_.82fr] lg:px-14">
        <div className="relative mx-auto aspect-[1.65/1] w-full max-w-5xl overflow-hidden rounded-[3rem] border border-white/10 bg-[#0f1c0d] shadow-2xl shadow-black/70">
          <motion.div style={{ scale: leafScale }} className="absolute inset-0">
            <img src={bananaLeafBg} alt="Plain banana leaf" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.14),transparent)]" />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-black/10" />
          {leafItems.map((item, index) => (
            <LeafItem key={item.title} item={item} index={index} progress={scrollYProgress} />
          ))}
          <motion.div
            style={{ opacity: useTransform(scrollYProgress, [0.84, 1], [0, 1]), y: useTransform(scrollYProgress, [0.84, 1], [30, 0]) }}
            className="absolute bottom-5 left-5 right-5 rounded-[2rem] border border-white/15 bg-black/45 p-5 text-center backdrop-blur-xl"
          >
            <p className="font-display text-3xl font-black md:text-5xl">A plain banana leaf, filled dish by dish as you scroll.</p>
          </motion.div>
        </div>

        <div className="mx-auto mt-10 max-w-xl lg:mt-0">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.4em] text-amber-300">The banana leaf experience</p>
          <h2 className="font-display text-5xl font-black leading-none md:text-7xl">A feast assembled with rhythm.</h2>
          <div className="mt-8 space-y-4">
            {leafItems.map((step, i) => (
              <motion.article
                key={step.title}
                initial={{ opacity: 0.25, x: 26 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ amount: 0.35 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl"
              >
                <p className="text-lg font-black text-amber-100">{step.title}</p>
                <p className="mt-1 text-white/65">{step.copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OriginStory() {
  return (
    <section className="relative overflow-hidden bg-[#f8ecd8] px-5 py-28 text-stone-950 md:px-12 lg:px-20">
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-orange-300/40 blur-3xl" />
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }}>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-800">Cafe, bakery, hospitality</p>
          <h2 className="mt-4 font-display text-5xl font-black leading-tight md:text-7xl">From a bakery corner to Berikai&apos;s favourite gathering place.</h2>
          <p className="mt-6 text-xl leading-9 text-stone-700">Cafe Aadvikam brings together pure vegetarian dining, bakery freshness, and a party hall for the moments your family remembers.</p>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['🥐', 'Before sunrise, dough is kneaded.'],
            ['🔥', 'Ovens glow and shelves fill.'],
            ['🍮', 'Traditional sweets meet cakes and pastries.'],
            ['👨‍👩‍👧‍👦', 'Families gather around familiar flavours.'],
          ].map(([icon, text], i) => (
            <motion.div key={text} initial={{ opacity: 0, y: 35 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} viewport={{ once: true }} className="rounded-[2rem] border border-orange-900/10 bg-white/70 p-7 shadow-xl shadow-orange-950/5 backdrop-blur">
              <div className="mb-8 text-4xl">{icon}</div>
              <p className="text-2xl font-bold leading-tight">{text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BakeryScene() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [-80, 80]);
  return (
    <section id="bakery" ref={ref} className="relative overflow-hidden bg-[#2a1608] px-5 py-28 text-white md:px-12 lg:px-20">
      <motion.img style={{ y }} src={IMG.bakeryCounter} alt="Fresh bakery display" className="absolute inset-0 h-[120%] w-full object-cover opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#2a1608] via-[#2a1608]/85 to-transparent" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-300">Cafe & bakery</p>
          <h2 className="mt-4 font-display text-6xl font-black leading-none md:text-8xl">Before Berikai wakes, our ovens glow.</h2>
          <p className="mt-6 text-xl leading-9 text-white/78">Artisanal breads, daily fresh buns, cakes, pastries, Indian sweets, and filter coffee make Cafe Aadvikam more than a restaurant.</p>
        </div>
        <div className="mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            ['Artisanal Breads', 'Hand-kneaded dough prepared fresh every morning.'],
            ['Daily Fresh', 'Warm bakery delights served throughout the day.'],
            ['Sweet Temptations', 'Traditional Indian sweets meet cafe-style pastry craft.'],
          ].map(([title, copy], i) => (
            <motion.div key={title} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="rounded-[2rem] border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
              <Sparkles className="mb-8 h-8 w-8 text-amber-300" />
              <h3 className="text-2xl font-black">{title}</h3>
              <p className="mt-3 leading-7 text-white/65">{copy}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SignatureScene() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-84%']);

  return (
    <section id="signature" ref={ref} className="relative h-[520vh] bg-[#120e08] text-white">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="absolute left-5 top-28 z-20 md:left-12">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-300">Signature sensations</p>
          <h2 className="mt-3 max-w-3xl font-display text-5xl font-black leading-none md:text-7xl">More food. More bakery. More reason to return.</h2>
          <p className="mt-4 max-w-xl text-white/65">A cinematic horizontal menu journey through South Indian meals, cafe drinks, bakery favourites, and desserts.</p>
        </div>
        <motion.div style={{ x }} className="flex gap-6 pl-[5vw] pt-48">
          {signatureItems.map((dish, i) => (
            <article key={dish.name} className={`relative h-[66vh] shrink-0 overflow-hidden rounded-[2.5rem] border border-white/10 shadow-2xl ${i % 3 === 0 ? 'w-[86vw] md:w-[62vw] lg:w-[46vw]' : 'w-[78vw] md:w-[52vw] lg:w-[34vw]'}`}>
              <img src={dish.image} alt={dish.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-0 p-8 md:p-10">
                <div className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.25em] text-amber-200 backdrop-blur-xl">Cafe Aadvikam</div>
                <h3 className="font-display text-4xl font-black md:text-5xl">{dish.name}</h3>
                <p className="mt-3 text-lg text-white/75 md:text-xl">{dish.tag}</p>
              </div>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function PartyHallScene() {
  return (
    <section id="party-hall" className="relative overflow-hidden bg-[#f6efe3] px-5 py-24 text-stone-950 md:px-12 lg:px-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <motion.div initial={{ opacity: 0, x: -45 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ amount: 0.35 }} className="relative overflow-hidden rounded-[3rem] bg-stone-900 shadow-2xl shadow-orange-950/20">
          <img src={IMG.partyHall} alt="Cafe Aadvikam Party Hall" className="h-[72vh] min-h-[520px] w-full object-cover" />
          <div className="absolute bottom-5 left-5 right-5 rounded-[2rem] border border-white/15 bg-black/45 p-5 text-white backdrop-blur-xl">
            <p className="font-display text-3xl font-black">Cafe Aadvikam Party Hall</p>
            <p className="mt-2 text-white/70">A dedicated space for birthdays, family functions, meetings, and ceremonies.</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 45 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ amount: 0.35 }}>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-800">Party hall bookings</p>
          <h2 className="mt-4 font-display text-6xl font-black leading-none md:text-8xl">Celebrate in the space your guests remember.</h2>
          <p className="mt-6 max-w-2xl text-xl leading-9 text-stone-700">Birthday parties, family gatherings, corporate meetings, and traditional ceremonies with pure vegetarian food and bakery treats.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              [Cake, 'Birthdays', 'Decor-friendly space with custom vegetarian menus.'],
              [Coffee, 'Cafe Catering', 'Filter coffee, bakery snacks, sweets, and meals.'],
              [Users, 'Family Functions', 'Comfortable hosting for close family gatherings.'],
              [Sparkles, 'Ceremonies', 'Traditional occasions handled with care and respect.'],
            ].map(([Icon, title, copy]) => {
              const I = Icon as typeof Cake;
              return (
                <div key={title as string} className="rounded-[2rem] border border-orange-900/10 bg-white p-5 shadow-xl shadow-orange-950/5">
                  <I className="mb-6 h-8 w-8 text-orange-700" />
                  <h3 className="text-xl font-black">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{copy as string}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={`https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking.')}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-7 py-4 font-black text-white shadow-2xl shadow-stone-950/20">
              <Phone className="h-4 w-4" /> Book on WhatsApp
            </a>
            <button onClick={() => scrollToId('#visit')} className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-950/15 bg-white px-7 py-4 font-black text-stone-950">
              <MapPin className="h-4 w-4" /> Visit Location
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function VisitScene({ onMenuOpen }: { onMenuOpen: () => void }) {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(CAFE.mapsQuery)}`;
  return (
    <section id="visit" className="relative overflow-hidden bg-stone-950 px-5 py-28 text-white md:px-12 lg:px-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.2),transparent_32%),linear-gradient(135deg,#0c0a09,#1c1208_45%,#0c0a09)]" />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-300">Location</p>
          <h2 className="mt-5 font-display text-6xl font-black leading-none md:text-8xl">Find Cafe Aadvikam in Berikai.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
              <MapPin className="mb-3 h-6 w-6 text-amber-300" />
              <p>{CAFE.address}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
              <Clock className="mb-3 h-6 w-6 text-amber-300" />
              <p>{CAFE.hours}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
              <Phone className="mb-3 h-6 w-6 text-amber-300" />
              <p>{CAFE.phone}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <button onClick={onMenuOpen} className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-8 py-4 font-black text-stone-950 shadow-2xl shadow-amber-500/20">
              Place Order <ArrowRight className="h-4 w-4" />
            </button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-4 font-black backdrop-blur-xl">
              Get Directions <MapPin className="h-4 w-4" />
            </a>
          </div>
        </div>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="group relative min-h-[520px] overflow-hidden rounded-[2.5rem] border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px] opacity-50" />
          <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-amber-300/10" />
          <div className="absolute left-[52%] top-[47%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 p-4 text-stone-950 shadow-2xl shadow-amber-500/30 transition group-hover:scale-110">
            <MapPin className="h-9 w-9" />
          </div>
          <div className="relative z-10 flex h-full flex-col justify-end">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300">Map preview</p>
            <h3 className="mt-3 font-display text-4xl font-black">109 Bagalur Main Road</h3>
            <p className="mt-3 max-w-md text-white/65">Open Google Maps for directions to Cafe Aadvikam. No broken embedded map image.</p>
          </div>
        </a>
      </div>
    </section>
  );
}

function BakeryHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1.04, 1.22]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 130]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  return (
    <section id="bakery-hero" ref={ref} className="relative h-[210vh] bg-[#160d05]">
      <div className="sticky top-0 h-screen overflow-hidden">
        <motion.img src={bakeryCounter} alt="VRSNB Bakery counter" style={{ scale, y }} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#160d05] via-[#160d05]/82 to-[#160d05]/25" />
        <motion.div style={{ opacity }} className="relative z-10 flex h-full items-center px-5 py-28 md:px-12 lg:px-20">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4">
              <img src={snbLogo} alt="VRSNB Bakery" className="h-20 w-20 rounded-3xl bg-white p-3 object-contain shadow-2xl" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300">Sri Nanjundeshwara Bakery</p>
                <h1 className="mt-2 font-display text-6xl font-black leading-none md:text-8xl">Fresh from the oven.</h1>
              </div>
            </div>
            <p className="mt-8 max-w-3xl text-xl leading-9 text-white/78">A warm bakery story of breads, cakes, cookies, sweets, savouries, and celebration treats from VRSNB Bakery.</p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <button onClick={() => scrollToId('#bakery-story')} className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-8 py-4 font-black text-stone-950">
                Start Bakery Story <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={() => scrollToId('#bakery-menu')} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-4 font-black backdrop-blur-xl">
                View Bakery Highlights <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function BakeryStoryScene() {
  const rows = [
    ['Bread & Buns', 'Soft buns, fresh bread, wheat bread, rusk, and bakery classics.', bakeryBread],
    ['Cakes & Pastries', 'Cream cakes, brownies, pastries, doughnuts, puffs, and celebration treats.', bakeryCakes],
    ['Sweets & Savouries', 'Mixtures, muruku, chikki, burfi, halwa, and traditional snacks.', bakerySweets],
  ] as const;
  return (
    <section id="bakery-story" className="bg-[#fff3de] px-5 py-28 text-stone-950 md:px-12 lg:px-20">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-800">VRSNB bakery journey</p>
        <h2 className="mt-4 max-w-4xl font-display text-5xl font-black leading-none md:text-7xl">From dough to display, every shelf tells a story.</h2>
        <div className="mt-14 space-y-8">
          {rows.map(([title, copy, image], i) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ amount: 0.35, once: true }}
              className="grid overflow-hidden rounded-[3rem] bg-white shadow-2xl shadow-orange-950/10 md:grid-cols-[0.95fr_1.05fr]"
            >
              <div className={cn('relative min-h-[360px] overflow-hidden', i % 2 ? 'md:order-2' : '')}>
                <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-105" />
              </div>
              <div className="flex flex-col justify-center p-8 md:p-12">
                <span className="mb-8 grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-2xl">{['🍞','🎂','🍬'][i]}</span>
                <h3 className="font-display text-4xl font-black md:text-6xl">{title}</h3>
                <p className="mt-5 text-xl leading-9 text-stone-650">{copy}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BakeryMenuHighlights() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-68%']);
  const cards = [
    ['Bread & Buns', 'BUN, SPL BUN, BREAD, WHEAT BREAD, RUSK', bakeryBread],
    ['Individual Cakes', 'Chocolate Cake, Cream Cake, Brownie, Ice Cake', bakeryCakes],
    ['Buns & Pastries', 'Cream Bun, Doughnut, Veg Puff, Samosa, Pizza', bakeryPastries],
    ['Namkeens & Mixtures', 'Kara Boondhi, Bombay Mixture, Muruku, Om Pudi', bakerySweets],
    ['Bakery Counter', 'Packed fresh for daily walk-ins and orders.', bakeryCounter],
  ] as const;
  return (
    <section id="bakery-menu" ref={ref} className="relative h-[430vh] bg-[#160d05] text-white">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="absolute left-5 top-28 z-20 md:left-12">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-300">Bakery menu</p>
          <h2 className="mt-3 max-w-3xl font-display text-5xl font-black leading-none md:text-7xl">The VRSNB bakery menu, told visually.</h2>
        </div>
        <motion.div style={{ x }} className="flex gap-6 pl-[5vw] pt-48">
          {cards.map(([title, copy, image]) => (
            <article key={title} className="relative h-[66vh] w-[82vw] shrink-0 overflow-hidden rounded-[2.5rem] border border-white/10 shadow-2xl md:w-[56vw] lg:w-[40vw]">
              <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute bottom-0 p-8 md:p-10">
                <div className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.25em] text-amber-200 backdrop-blur-xl">VRSNB Bakery</div>
                <h3 className="font-display text-4xl font-black md:text-5xl">{title}</h3>
                <p className="mt-3 text-lg text-white/75 md:text-xl">{copy}</p>
              </div>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function BakeryFinalCTA({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <section className="relative overflow-hidden bg-[#fff3de] px-5 py-28 text-stone-950 md:px-12 lg:px-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <img src={snbLogo} alt="VRSNB Bakery" className="mb-8 h-20 w-20 rounded-3xl bg-white p-3 object-contain shadow-xl" />
          <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-800">Order bakery items</p>
          <h2 className="mt-4 font-display text-5xl font-black leading-none md:text-7xl">Fresh bakery favourites for home, work, and celebrations.</h2>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button onClick={onMenuOpen} className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-8 py-4 font-black text-white">
              Open Bakery Menu <ArrowRight className="h-4 w-4" />
            </button>
            <a href={`https://wa.me/${BAKERY.whatsapp}?text=${encodeURIComponent('Hi, I want to order from VRSNB Bakery')}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-950/15 bg-white px-8 py-4 font-black text-stone-950">
              <MessageCircle className="h-4 w-4" /> WhatsApp Order
            </a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[bakeryBread, bakeryCakes, bakeryPastries, bakerySweets].map((image, i) => (
            <img key={i} src={image} alt="Bakery item" className="h-56 w-full rounded-[2rem] object-cover shadow-xl" />
          ))}
        </div>
      </div>
    </section>
  );
}

function BakeryLanding({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <main className="min-h-screen bg-[#160d05] text-white">
      <BakeryHero />
      <BakeryStoryScene />
      <BakeryMenuHighlights />
      <BakeryFinalCTA onMenuOpen={onMenuOpen} />
    </main>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [activeVenue, setActiveVenue] = useState<'cafe' | 'bakery'>('cafe');
  const progressSections = useMemo(() => ['#hero', '#leaf', '#bakery', '#signature', '#party-hall', '#visit'], []);

  useEffect(() => {
    if (currentUser) navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);

  if (currentUser) return null;

  return (
    <main className="min-h-screen scroll-smooth bg-stone-950 font-body antialiased">
      <FloatingNav onMenuOpen={() => navigate('/order')} />
      <VenueToggle active={activeVenue} onChange={setActiveVenue} />
      {activeVenue === 'bakery' ? (
        <BakeryLanding onMenuOpen={() => navigate('/order')} />
      ) : (
        <>
          <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
            {progressSections.map((id) => (
              <button key={id} onClick={() => scrollToId(id)} className="h-10 w-1.5 rounded-full bg-white/20 transition hover:bg-amber-300" aria-label={`Go to ${id}`} />
            ))}
          </div>
          <HeroScene />
          <LeafExperience />
          <OriginStory />
          <BakeryScene />
          <SignatureScene />
          <PartyHallScene />
          <VisitScene onMenuOpen={() => navigate('/order')} />
        </>
      )}
          <ChatBot />
    </main>
  );
}
