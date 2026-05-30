import { useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CalendarCheck,
  Cake,
  ChevronDown,
  Clock,
  Coffee,
  Croissant,
  Flame,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  Phone,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import heroMeal from '@/assets/hero-bg.jpg';
import cafeLogo from '@/assets/cafe-logo.png';

const CAFE = {
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '7 AM – 10 PM Daily',
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
  mapsQuery: '109 Bagalur Main Road Berikai 635105 Cafe Aadvikam',
};

const IMG = {
  partyHall: '/party-hall.jpg',
  dosa: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=1600&q=90',
  thali: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=1600&q=90',
  coffee: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1400&q=90',
  bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1600&q=90',
  cake: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1600&q=90',
  pastry: 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1500&q=90',
  sweets: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=1500&q=90',
  lime: 'https://images.unsplash.com/photo-1523371054106-bbf80586c38c?auto=format&fit=crop&w=1500&q=90',
  bakeryCounter: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1600&q=90',
};

const navItems = [
  ['Feast', '#leaf'],
  ['Bakery', '#bakery'],
  ['Signature', '#signature'],
  ['Party Hall', '#party-hall'],
  ['Location', '#visit'],
] as const;

const leafHotspots = [
  { title: 'Soft Idli', copy: 'Steamed fresh for a comforting South Indian start.' },
  { title: 'Sambar', copy: 'Slow-cooked lentils, vegetables, and roasted spices.' },
  { title: 'Ghee Roast Dosa', copy: 'Crispy, golden, and served hot from the tawa.' },
  { title: 'Fresh Chutneys', copy: 'Coconut and house chutneys ground fresh every day.' },
  { title: 'Filter Coffee', copy: 'Traditional cafe finish with warm aroma and foam.' },
];

const menuHighlights = [
  ['Ghee Roast Dosa', 'Crispy perfection with aromatic ghee'],
  ['Aadvikam Special Thali', 'A complete vegetarian feast'],
  ['Filter Coffee', 'Traditional brew in steel tumblers'],
  ['Rava Kesari', 'Saffron-infused semolina dessert'],
  ['Paneer Butter Masala', 'Creamy cottage cheese in rich gravy'],
  ['Fresh Lime Soda', 'Sweet, salty, and refreshing'],
  ['Fresh Bakery', 'Breads, buns, pastries, cakes, and sweets'],
  ['South Indian Breakfast', 'Idli, dosa, sambar, chutney, and coffee'],
];

const signatureItems = [
  { name: 'Ghee Roast Dosa', tag: 'Golden. Crisp. Legendary.', image: IMG.dosa },
  { name: 'Aadvikam Special Thali', tag: 'A full banana-leaf style feast.', image: IMG.thali },
  { name: 'South Indian Breakfast', tag: 'Idli, dosa, sambar, chutney, and coffee.', image: heroMeal },
  { name: 'Filter Coffee', tag: 'Traditional brew, cafe-style comfort.', image: IMG.coffee },
  { name: 'Rava Kesari', tag: 'Saffron-sweet comfort in every spoon.', image: IMG.sweets },
  { name: 'Paneer Butter Masala', tag: 'Rich, creamy, and family favourite.', image: IMG.thali },
  { name: 'Fresh Lime Soda', tag: 'Sweet, salty, chilled, and refreshing.', image: IMG.lime },
  { name: 'Fresh Bakery', tag: 'Breads, buns, cakes, pastries, and cookies.', image: IMG.bakery },
  { name: 'Cakes & Pastries', tag: 'Celebration treats from our bakery.', image: IMG.cake },
  { name: 'Sweet Temptations', tag: 'Indian sweets meet bakery craft.', image: IMG.pastry },
];

function scrollToId(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function MenuModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/80 px-4 py-8 text-white backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 30, opacity: 0 }}
            className="relative max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#120e08] shadow-2xl"
          >
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white text-stone-950 shadow-xl transition hover:scale-105"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="grid max-h-[88vh] overflow-y-auto lg:grid-cols-[0.8fr_1.2fr]">
              <div className="relative min-h-[320px] overflow-hidden">
                <img src={heroMeal} alt="Cafe Aadvikam menu" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/10" />
                <div className="absolute bottom-6 left-6 right-6">
                  <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300">Menu highlights</p>
                  <h2 className="mt-3 font-display text-4xl font-black md:text-5xl">Pure vegetarian favourites</h2>
                </div>
              </div>
              <div className="p-6 md:p-9">
                <p className="mb-6 text-white/65">A quick view of Cafe Aadvikam favourites. This popup intentionally has no waiter/call-waiter button.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {menuHighlights.map(([name, desc]) => (
                    <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <h3 className="font-black text-amber-100">{name}</h3>
                      <p className="mt-1 text-sm leading-6 text-white/65">{desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={`https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to know today\'s menu.')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 font-black text-stone-950"
                  >
                    Ask on WhatsApp <ArrowRight className="h-4 w-4" />
                  </a>
                  <button onClick={onClose} className="rounded-full border border-white/20 px-6 py-3 font-black text-white">Close</button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FloatingNav({ onMenuOpen }: { onMenuOpen: () => void }) {
  const [open, setOpen] = useState(false);
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
              <button key={label} onClick={() => scrollToId(href)} className="transition hover:text-amber-200">{label}</button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button onClick={onMenuOpen} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/20">View Menu</button>
            <button onClick={() => scrollToId('#party-hall')} className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/20 transition hover:scale-105"><CalendarCheck className="h-4 w-4" /> Book Party Hall</button>
          </div>

          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 md:hidden"><MenuIcon className="h-5 w-5" /></button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-stone-950/96 p-6 text-white md:hidden">
            <button onClick={() => setOpen(false)} className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-white/10"><X /></button>
            <div className="mt-14 grid gap-5 text-4xl font-black">
              {navItems.map(([label, href]) => (
                <button key={label} onClick={() => { setOpen(false); setTimeout(() => scrollToId(href), 100); }} className="text-left">{label}</button>
              ))}
              <button onClick={() => { setOpen(false); setTimeout(onMenuOpen, 120); }} className="text-left text-amber-200">View Menu</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
              <button onClick={() => scrollToId('#leaf')} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black text-stone-950 shadow-2xl shadow-black/30">Begin the feast <ChevronDown className="h-4 w-4" /></button>
              <button onClick={() => scrollToId('#party-hall')} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 font-black text-white backdrop-blur-xl"><CalendarCheck className="h-4 w-4" /> Book Party Hall</button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LeafExperience() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.04, 1.16]);
  const imageY = useTransform(scrollYProgress, [0, 1], [0, -45]);

  return (
    <section id="leaf" ref={ref} className="relative h-[360vh] bg-[#120e08] text-white">
      <div className="sticky top-0 grid h-screen items-center overflow-hidden px-4 py-24 lg:grid-cols-[1.18fr_.82fr] lg:px-14">
        <div className="relative mx-auto aspect-[1.65/1] w-full max-w-5xl overflow-hidden rounded-[3rem] border border-white/10 shadow-2xl shadow-black/70">
          <motion.img src={heroMeal} alt="Real South Indian meal at Cafe Aadvikam" style={{ scale: imageScale, y: imageY }} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/20" />
          <div className="absolute bottom-5 left-5 right-5 rounded-[2rem] border border-white/15 bg-black/45 p-5 text-center backdrop-blur-xl">
            <p className="font-display text-3xl font-black md:text-5xl">The real Cafe Aadvikam meal — no fake leaf, no broken circles.</p>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl lg:mt-0">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.4em] text-amber-300">The banana leaf experience</p>
          <h2 className="font-display text-5xl font-black leading-none md:text-7xl">A real South Indian plate, narrated as you scroll.</h2>
          <div className="mt-8 space-y-4">
            {leafHotspots.map((step, i) => (
              <motion.article
                key={step.title}
                initial={{ opacity: 0.25, x: 26 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ amount: 0.35 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl"
              >
                <p className="text-lg font-black text-amber-100">{step.title}</p>
                <p className="mt-1 leading-7 text-white/65">{step.copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OriginStory() {
  const cards = [
    { title: 'A Dream Takes Shape', copy: 'Born from generations of culinary wisdom and a family passion for vegetarian cooking.', icon: Leaf },
    { title: 'Before Dawn Bakery', copy: 'Hand-kneaded dough, warm ovens, cakes, buns, cookies, and sweet temptations.', icon: Croissant },
    { title: 'South Indian Soul Food', copy: 'Tamil classics, Karnataka favourites, and Kerala flavours in one destination.', icon: Flame },
    { title: 'Community At The Core', copy: 'Berikai families, students, artists, and celebrations all find a place here.', icon: Users },
  ];
  return (
    <section id="origin" className="relative overflow-hidden bg-[#f8ecd8] px-5 py-28 text-stone-950 md:px-12 lg:px-20">
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-orange-300/40 blur-3xl" />
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }}>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-800">Cafe, bakery, hospitality</p>
          <h2 className="mt-4 font-display text-5xl font-black leading-tight md:text-7xl">From a bakery corner to Berikai's favourite gathering place.</h2>
          <p className="mt-6 text-xl leading-9 text-stone-700">Cafe Aadvikam brings together pure vegetarian dining, bakery freshness, and a party hall for the moments your family remembers.</p>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ title, copy, icon: Icon }, i) => (
            <motion.article key={title} initial={{ opacity: 0, y: 35 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} viewport={{ once: true }} className="rounded-[2rem] border border-orange-900/10 bg-white/70 p-7 shadow-xl shadow-orange-950/5 backdrop-blur">
              <Icon className="mb-8 h-10 w-10 text-orange-800" />
              <h3 className="text-2xl font-black leading-tight">{title}</h3>
              <p className="mt-3 leading-7 text-stone-650">{copy}</p>
            </motion.article>
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
            <a href={`https://wa.me/${CAFE.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking.')}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-7 py-4 font-black text-white shadow-2xl shadow-stone-950/20"><Phone className="h-4 w-4" /> Book on WhatsApp</a>
            <button onClick={() => scrollToId('#visit')} className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-950/15 bg-white px-7 py-4 font-black text-stone-950"><MapPin className="h-4 w-4" /> Visit Location</button>
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
      <img src={heroMeal} alt="Cafe Aadvikam meal" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/88 to-stone-950/50" />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-300">Location</p>
          <h2 className="mt-5 font-display text-6xl font-black leading-none md:text-8xl">Find Cafe Aadvikam in Berikai.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl"><MapPin className="mb-3 h-6 w-6 text-amber-300" /><p>{CAFE.address}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl"><Clock className="mb-3 h-6 w-6 text-amber-300" /><p>{CAFE.hours}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl"><Phone className="mb-3 h-6 w-6 text-amber-300" /><p>{CAFE.phone}</p></div>
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <button onClick={onMenuOpen} className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-8 py-4 font-black text-stone-950 shadow-2xl shadow-amber-500/20">View Menu <ArrowRight className="h-4 w-4" /></button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-4 font-black backdrop-blur-xl">Get Directions <MapPin className="h-4 w-4" /></a>
          </div>
        </div>
        <div className="overflow-hidden rounded-[2.5rem] border border-white/15 bg-white/10 p-2 shadow-2xl backdrop-blur-xl">
          <iframe
            title="Cafe Aadvikam location map"
            src={`https://www.google.com/maps?q=${encodeURIComponent(CAFE.mapsQuery)}&output=embed`}
            className="h-[420px] w-full rounded-[2rem] border-0 md:h-[560px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const progressSections = useMemo(() => ['#hero', '#leaf', '#bakery', '#signature', '#party-hall', '#visit'], []);
  return (
    <main className="min-h-screen scroll-smooth bg-stone-950 font-body antialiased">
      <FloatingNav onMenuOpen={() => setMenuOpen(true)} />
      <MenuModal open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        {progressSections.map((id) => <button key={id} onClick={() => scrollToId(id)} className="h-10 w-1.5 rounded-full bg-white/20 transition hover:bg-amber-300" aria-label={`Go to ${id}`} />)}
      </div>
      <HeroScene />
      <LeafExperience />
      <OriginStory />
      <BakeryScene />
      <SignatureScene />
      <PartyHallScene />
      <VisitScene onMenuOpen={() => setMenuOpen(true)} />
    </main>
  );
}
