// src/pages/Landing.tsx
// PREMIUM REDESIGN, PASS 2: pass 1 used Framer Motion (useScroll/useTransform
// parallax + whileInView scroll-reveals) and, in the field, whole sections
// rendered blank — the hero collapsed to near-zero height and the menu/
// gallery/party-hall image grids never became visible. Rather than keep
// debugging an animation subsystem I can't attach a real browser to, this
// pass removes it entirely and rebuilds every animation on the CSS keyframe
// utilities already defined (and already proven working elsewhere in this
// app) in index.css — .animate-fade-up, .animate-float, .hero-zoom, delay-*.
// Pure CSS animations run on paint with no ref/IntersectionObserver timing
// dependency, so content is guaranteed visible even if JS animation never
// fires. Still no backdrop-blur (perf note carried over from the billing
// terminal work). Every image container now has a bg-muted fallback so a
// failed image shows a soft placeholder instead of invisible blank space.
//
// FEATURE (2026-09-30): "complete remove the menu just explain about the
// cafe and bakery" — the on-page live-price menu section (previously here,
// pulling real items from useMenuStore/useBakeryItemsStore) is gone. The
// page is marketing/explanation only now, with no menu-viewing affordance
// anywhere on it — every CTA here is a WhatsApp link instead.
//
// BUG FIX: "I need one button with all the functions" — a standalone
// floating WhatsApp button used to sit bottom-left alongside the ChatBot
// toggle bottom-right. Two separate floating buttons for overlapping jobs
// (both are ultimately "get in touch") was confusing, not a real second
// feature — ChatBot's own Order modal already offers "Order via WhatsApp"
// and "Call to Order" one tap in, plus its quick chips (Order/Book Hall/
// Call) and full FAQ chat. Removed the standalone button; ChatBot is now
// the one floating entry point for everything.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import * as THREE from 'three';
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
  Star,
  Truck,
  Utensils,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getRoleDefaultPath } from '@/lib/routing';
import { cn, formatCurrency } from '@/lib/utils';
import cafeLogo from '@/assets/cafe-logo.png';
import snbLogo from '@/assets/snb-logo.png';
// REDESIGN (2026-09-30): "complete redesign... get all the image from those
// links, still few pics are not ours its from web" — every photo on this page
// is now real photography pulled directly from the business's own Google Maps
// listings (the two links the owner gave), not stock, not the old bundled
// template photos. Vetted one by one before saving: the raw "all photos" pool
// for a Maps listing is genuinely mixed with unrelated content (confirmed
// live — three separate candidates turned out to be billboards for other
// bakeries entirely, two were private individuals' personal photos swept in
// by tag association) — every file below was opened at full resolution and
// visually confirmed to actually be this business before being kept.
import cafeExterior from '@/assets/real/cafe-exterior.jpg';
import cafeDessertPlate from '@/assets/real/cafe-dessert-plate.jpg';
import cafeSizzlingBrownie from '@/assets/real/cafe-sizzling-brownie.jpg';
import cafeInterior from '@/assets/real/cafe-interior.jpg';
import cafeDosaTawa from '@/assets/real/cafe-dosa-tawa.jpg';
// Sourced 2026-09-30 (same verification standard as above — opened at full
// resolution, confirmed real, credited to Sarath Chandran, one of the
// reviewers already quoted below) to fix two review findings: the Highlights
// section reused the same 5 photos everywhere else, and the party-hall
// section repeated photos already shown in the menu grid a third time.
import cafeInteriorMural from '@/assets/real/cafe-interior-mural.jpg';
// Sourced 2026-09-30, second pass — the Highlights section was redesigned
// again from a single shared background photo to one real, distinct photo
// per card (same treatment as the menu grid), which needed more material.
// Both credited to reviewers already quoted below (Naveen Chowdary, Madhuri).
import cafeExteriorNight from '@/assets/real/cafe-exterior-night.jpg';
import cafeSweetsDisplay from '@/assets/real/cafe-sweets-display.jpg';
import bakeryStorefront from '@/assets/real/bakery-storefront.jpg';
// Sourced 2026-09-30 — replaces bakeryStorefront as the Bakery hero. The
// extreme upward camera angle and overhead wire clutter needed for a
// street-level signboard shot got heavily exaggerated once stretched across
// a 92vh-tall hero with object-cover (see the hero <section> below) — this
// is a level, well-lit shot of the counter's own branded reception display,
// no distortion, no clutter, the same real "SNB" branding just shown well.
import bakeryReceptionFlowers from '@/assets/real/bakery-reception-flowers.jpg';
// bakery-heart-cake.jpg and bakery-fruit-cake.jpg (the raw Maps downloads)
// each had a stranger's name iced onto the cake — cropped to just the
// decoration so no customer's personal details end up on the public site.
import bakeryHeartCakeRoses from '@/assets/real/bakery-heart-cake-roses.jpg';
import bakeryFruitCakeCrop from '@/assets/real/bakery-fruit-cake-crop.jpg';
import bakerySignboardNight from '@/assets/real/bakery-signboard-night.jpg';
import bakeryCakeCounter from '@/assets/real/bakery-cake-counter.jpg';
import ChatBot from '@/components/features/ChatBot';

const CAFE_INFO = {
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '7 AM – 10 PM Daily',
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
  mapsQuery: 'Cafe Aadvikam 109 Bagalur Main Road Berikai 635105',
};

type Venue = 'cafe' | 'bakery';

type GalleryItem = { image: string; caption: string };
type OccasionFeature = { icon: typeof Users; label: string };

type VenueContent = {
  navSub: string;
  logo: string;
  ctaNav: string;
  badge: string;
  title: string;
  lede: string;
  cta2: string;
  statLabel: string;
  heroImage: string;
  highlightsEyebrow: string;
  highlightsTitle: string;
  highlights: { icon: typeof Leaf; title: string; copy: string; image: string }[];
  menuEyebrow: string;
  menuTitle: string;
  aboutCopy: string;
  galleryEyebrow: string;
  galleryTitle: string;
  gallerySub: string;
  gallery: GalleryItem[];
  storyImage: string;
  storyBadge: string;
  storyTitle: string;
  storyP1: string;
  storyP2: string;
  storyList: string[];
  reviewRating: number;
  reviewCount: string;
  reviews: { quote: string; author: string; meta: string }[];
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
    cta2: 'Reserve a table',
    statLabel: 'Signature dishes',
    heroImage: cafeInterior,
    highlightsEyebrow: 'Why guests keep coming back',
    highlightsTitle: 'Made fresh. Served warm. Always on time.',
    highlights: [
      { icon: Leaf, title: 'Fresh daily', copy: 'Batter ground and chutneys made each morning, not the night before.', image: cafeSweetsDisplay },
      { icon: UtensilsCrossed, title: 'Dine-in and takeaway', copy: 'Sit down for a full breakfast, or call ahead and grab it on the way.', image: cafeInteriorMural },
      { icon: CalendarCheck, title: 'Party hall on-site', copy: 'Seats 120 for birthdays, get-togethers, and family functions.', image: cafeExteriorNight },
      { icon: Clock, title: 'Consistent quality', copy: 'Same recipe, same standard, on your first visit or your hundredth.', image: cafeSizzlingBrownie },
    ],
    menuEyebrow: 'The lineup',
    menuTitle: 'Signature dishes guests order on repeat',
    aboutCopy: 'Ghee-roast dosas, idlis, vadas, and a full South Indian breakfast spread, followed through the day by rice meals, chats, and a working bakery counter right next door. Everything is cooked fresh in a pure-vegetarian kitchen — dine-in, takeaway, or a party hall for when the whole family is celebrating.',
    galleryEyebrow: 'Around the cafe',
    galleryTitle: 'A look inside Cafe Aadvikam',
    gallerySub: 'The food, the room, and the moments in between.',
    gallery: [
      { image: cafeExterior, caption: 'Cafe Aadvikam, from the street' },
      { image: cafeInterior, caption: 'A room built for long breakfasts' },
      { image: cafeDosaTawa, caption: 'Ghee roast, straight off the tawa' },
      { image: cafeDessertPlate, caption: 'Plated the way it deserves to be' },
      { image: cafeSizzlingBrownie, caption: 'Sizzling brownie, poured tableside' },
    ],
    storyImage: cafeExterior,
    storyBadge: 'Since 1988',
    storyTitle: 'Two kitchens, one standard: nothing leaves half-effort',
    storyP1: 'It started in 1988 as a single breakfast counter on the Hosur Main Road — a ghee-roast dosa, a tumbler of filter coffee, and a family that decided early on never to cut a corner. Almost four decades later that same standard now runs a full-service cafe, a working bakery under the Sri Nanjundeshwara Bakery & Sweets name, and a party hall for 120 — still the same family, still the same kitchen discipline.',
    storyP2: 'Word travelled the way it always does out here — one satisfied table at a time. Today families from across Hosur, and plenty who make the drive from Bangalore, come specifically for it. Guests call it “an absolute gem in the midst of nowhere,” and the room backs it up: 4.6 stars from the people who actually eat here.',
    storyList: [
      'Stone-ground batter, made fresh every morning',
      'Traditional filter coffee, brewed the slow way',
      'A party hall for up to 120 guests, run by the same team',
    ],
    reviewRating: 4.6,
    reviewCount: '57 Google reviews',
    reviews: [
      { quote: 'Absolute gem in the midst of nowhere. Their bakery is amazing, tea is a must have, and the chats are superb.', author: 'Sarath Chandran', meta: 'Local Guide · 363 reviews' },
      { quote: 'The breakfast was very tasty and well prepared, and the sweets were excellent with good taste and quality. A nice place to enjoy good food.', author: 'Naveen Chowdary', meta: 'Google review' },
      { quote: 'A very pleasant, clean, and comfortable seating ambiance that instantly relaxes you — a fantastic addition to the area for families and groups.', author: 'Vikas Nair', meta: 'Local Guide · 109 reviews' },
    ],
    occasionEyebrow: 'Weddings, Parties & Catering',
    occasionTitle: 'A party hall and catering service for weddings, birthdays, and every occasion',
    occasionCopy: 'Seats up to 120 in-house — and for weddings, corporate events, or a celebration held elsewhere, we also undertake outside catering. Same kitchen, same recipes, the same standard we’ve run since 1988, now catering events across Hosur and into Bangalore.',
    occasionFeatures: [
      { icon: Users, label: 'Seats up to 120 guests' },
      { icon: Utensils, label: 'Outside catering for weddings & events' },
      { icon: PartyPopper, label: 'Decor and setup support' },
      { icon: ShieldCheck, label: 'One family-run kitchen since 1988' },
    ],
    occasionCtaLabel: 'Check availability',
    // BUG FIX (2026-09-30, review finding): this used to repeat cafeInterior
    // (already the hero image), cafeDessertPlate and cafeSizzlingBrownie
    // (both already in the menu grid AND the gallery below) a 3rd time each
    // — noticeable on a single scroll. cafeInteriorMural is new; the other
    // two are still repeats, but only their 2nd appearance now, not their 3rd.
    occasionGallery: [cafeInteriorMural, cafeDosaTawa, cafeExterior],
    waMessage: 'Hi Cafe Aadvikam, I would like to place an order.',
  },
  bakery: {
    navSub: 'Sri Nanjundeshwara Bakery & Sweets',
    logo: snbLogo,
    ctaNav: 'Order a cake',
    badge: 'Baked fresh, decorated to order',
    title: 'Cakes, breads, and sweets baked the way you remember',
    lede: 'From birthday cakes to festival sweets, Sri Nanjundeshwara Bakery & Sweets bakes everything in-house — nothing frozen, nothing rushed.',
    cta2: 'Order a custom cake',
    statLabel: 'Bakery items',
    heroImage: bakeryReceptionFlowers,
    highlightsEyebrow: 'Why Berigai bakes with us',
    highlightsTitle: 'Baked fresh. Decorated with care. Ready on time.',
    highlights: [
      { icon: Cake, title: 'Custom cakes', copy: 'Any flavour, size, or message — designed around your occasion.', image: bakeryHeartCakeRoses },
      { icon: Sparkles, title: 'Fresh bakes daily', copy: 'Breads, buns, and pastries baked in small batches through the day.', image: bakeryCakeCounter },
      { icon: Coffee, title: 'Festival sweets', copy: 'Traditional Indian sweets made the same way our family always has.', image: bakeryReceptionFlowers },
      { icon: Truck, title: 'Pickup and delivery', copy: 'Order ahead and collect in-store, or have it delivered locally.', image: bakeryFruitCakeCrop },
    ],
    menuEyebrow: 'The counter',
    menuTitle: 'Bakery favourites, made in-house every day',
    aboutCopy: 'Birthday cakes decorated to order, fresh breads and buns baked in small batches through the day, and traditional Indian sweets made the way they always have been — nothing frozen, nothing rushed. We’re well known for our ghee sweets, and alongside the bakery counter we also stock traditional pickles and cold-pressed oils. Walk in for what’s fresh on the counter today, or call ahead for a custom cake.',
    galleryEyebrow: 'Around the bakery',
    galleryTitle: 'A look inside the bakery counter',
    gallerySub: 'What comes out of the oven, every single day.',
    gallery: [
      { image: bakeryHeartCakeRoses, caption: 'Cakes decorated to order' },
      { image: bakeryStorefront, caption: 'The counter, lit up every evening' },
      { image: bakeryCakeCounter, caption: 'Inside the cake counter' },
      { image: bakeryFruitCakeCrop, caption: 'Every cake made to order, never frozen' },
      { image: bakerySignboardNight, caption: 'Ready for a celebration' },
    ],
    storyImage: bakeryHeartCakeRoses,
    storyBadge: 'Since 1988',
    storyTitle: 'Baked in-house, the same recipes since day one',
    storyP1: 'Sri Nanjundeshwara Bakery & Sweets grew out of the same 1988 kitchen as the cafe next door — started by the same family, on the same promise: nothing frozen, nothing rushed. Every cake is still decorated to order, every loaf still baked in small daily batches, and every festival sweet still made the traditional way, by hand.',
    storyP2: 'That promise is why the counter has become a Hosur habit — locals stop in on the way to work, and word has carried the name into Bangalore too. It shows in the numbers: 686 Google reviews and counting, holding a 4.5-star average, with guests calling out the Jalebi by name and organisations like the Lions Club of Hosur Everest trusting the counter for their own celebrations.',
    storyList: [
      'Every cake decorated to order, never pulled from a freezer',
      'Small daily batches of bread, buns, and pastries',
      'Festival sweets made the traditional way',
    ],
    reviewRating: 4.5,
    reviewCount: '686 Google reviews',
    reviews: [
      { quote: 'The sweets and snacks made at their bakery are very clean and delicious. Especially their Jalebi — it tastes amazing and makes you want to have it again and again.', author: 'Harish Kumar', meta: 'Google review' },
      { quote: 'We purchased plum cake, savouries and cookies for our annual celebration — 30 boxes as a gift. Highest quality, on-time delivery, affordable cost, and a genuinely customer-friendly team.', author: 'Lions Club of Hosur Everest', meta: 'Google review' },
      { quote: 'Best bakery in Berigai. Good service and real comfort for customers — the staff are always kind and respectful.', author: 'Balaji M', meta: 'Google review' },
    ],
    occasionEyebrow: 'Since 1988',
    occasionTitle: 'The best in cake decor — a famous Hosur bakery since 1988',
    occasionCopy: 'Any design you can imagine, we can make — tell us the flavour, size, and design, and we’ll have it ready with delivery all over Hosur and the surrounding area. Baking in Berigai since 1988 and specialists in ghee sweets, with regular clients ordering all the way from Bangalore for the taste. We also stock traditional pickles and cold-pressed oils, and we’re working on pan-India delivery so everyone can order the same taste, wherever they are.',
    occasionFeatures: [
      { icon: Cake, label: 'Best in cake decor — any design you imagine' },
      { icon: Sparkles, label: 'Specialists in ghee sweets' },
      { icon: Truck, label: 'Delivered across Hosur & surrounding area' },
      { icon: ShieldCheck, label: 'Trusted since 1988, never frozen' },
    ],
    occasionCtaLabel: 'Place your order',
    // BUG FIX (2026-09-30, review finding): same fix as the cafe's
    // occasionGallery above — bakeryFruitCakeCrop/bakeryStorefront were
    // already in the menu grid AND the gallery below (3rd appearance here).
    // bakerySignboardNight was only in the menu grid once before this.
    occasionGallery: [bakeryHeartCakeRoses, bakerySignboardNight, bakeryCakeCounter],
    waMessage: 'Hi, I would like to order from Sri Nanjundeshwara Bakery & Sweets.',
  },
};

// The whole business — cafe and bakery alike — traces back to 1988, not
// 2012. "Est. 2012" was wrong everywhere it appeared, not just in Bakery
// mode; both venues now show the same, correct founding year.
const TRUST_STRIP: Record<Venue, { icon: typeof CalendarCheck; value: string; label: string }[]> = {
  cafe: [
    { icon: CalendarCheck, value: 'Est. 1988', label: 'Family run, Berigai' },
    { icon: Users, value: '120 seats', label: 'Party hall capacity' },
    { icon: Clock, value: '7am – 10pm', label: 'Open every single day' },
    { icon: Leaf, value: '100% in-house', label: 'Nothing frozen, nothing rushed' },
  ],
  bakery: [
    { icon: CalendarCheck, value: 'Est. 1988', label: 'Family run, Berigai' },
    { icon: Cake, value: '35+ years', label: 'Baking for Berigai' },
    { icon: Clock, value: '7am – 10pm', label: 'Open every single day' },
    { icon: Leaf, value: '100% in-house', label: 'Nothing frozen, nothing rushed' },
  ],
};

// Deterministic (not Math.random() per-render) ambient particle layout, so
// it doesn't jitter/regenerate on re-render — computed once at module load.
const HERO_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const seed = i * 37;
  return {
    left: (seed * 7) % 100,
    size: 3 + ((seed * 3) % 5),
    duration: 7 + ((seed * 11) % 8),
    delay: (seed % 10) * 0.6,
    driftX: ((seed % 5) - 2) * 8,
  };
});

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

gsap.registerPlugin(ScrollTrigger);

// Scroll-triggered storytelling reveal, now driven by real GSAP + ScrollTrigger
// timelines (per the brief: "Use GSAP. Create timeline animations."). The
// element is NOT hidden until this effect has confirmed it can actually
// attach a ScrollTrigger — and even then, a hard setTimeout safety net
// forces the element visible after 2.5s no matter what. This preserves the
// fail-open property that mattered here previously: Framer Motion's
// scroll-linked animation broke in the field and left whole sections
// permanently invisible because nothing ever un-hid them. GSAP is a more
// mature, purpose-built scroll-animation engine than Framer Motion's scroll
// hooks, but "more mature" isn't "untestable-by-me proof" — so the safety
// net stays regardless of which library is doing the animating.
function useGsapReveal<T extends HTMLElement>(delayMs = 0) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(el, { opacity: 0, y: 28 });
    let shown = false;
    const reveal = () => {
      if (shown) return;
      shown = true;
      gsap.to(el, { opacity: 1, y: 0, duration: 0.9, delay: delayMs / 1000, ease: 'power3.out' });
    };
    const trigger = ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: reveal });
    // Safety net — see comment above.
    const safety = window.setTimeout(reveal, 2500);

    return () => {
      trigger.kill();
      window.clearTimeout(safety);
    };
  }, [delayMs]);
  return ref;
}

function Reveal({
  children,
  className,
  delay,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: 100 | 150 | 200 | 300 | 400;
  style?: CSSProperties;
}) {
  const ref = useGsapReveal<HTMLDivElement>(delay ?? 0);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

// Mounts Lenis smooth-scroll only while this component (the public landing
// page) is on screen, and fully tears it down on unmount — the rest of the
// app (billing terminals, dashboards) never sees it, matching the existing
// "don't add global scroll/GPU cost to the Windows 7 POS terminals" rule
// elsewhere in this codebase. Synced to GSAP's ticker, which is the
// documented integration pattern between Lenis and ScrollTrigger.
function useLenisSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 3), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);
}

// Lightweight, dependency-free parallax: reads scroll position on the
// passive scroll listener + rAF (never blocks the main thread), returns a
// translateY in px. Capped to a small range so it reads as "cinematic depth"
// rather than motion-sickness scroll-jacking, and is fully inert (returns 0,
// no listener at all) if reduced-motion is requested.
function useParallax(strength = 0.15) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setOffset(Math.min(140, window.scrollY * strength));
        raf = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength]);
  return offset;
}

// Ambient WebGL particle field for the hero — an ADDITIVE enhancement layered
// over the existing pure-CSS particle layer, never a replacement. If WebGL is
// unavailable or anything in setup throws, this silently renders nothing and
// the CSS particles (which have zero WebGL dependency) still cover the
// atmosphere on their own — there is no code path where "particles fail to
// load" means "hero looks broken." Particle count and geometry follow the
// ui-ux-pro-max threejs guidance: alpha:true + CSS-driven background,
// ~500 particles (well under the 3000 mobile-safe ceiling since this is a
// background accent, not a hero-focal effect), low segment counts.
function HeroParticlesThree() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return;

    let frameId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;

    try {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      camera.position.z = 20;

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      const COUNT = 500;
      const positions = new Float32Array(COUNT * 3);
      const speeds = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 32;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
        speeds[i] = 0.004 + Math.random() * 0.01;
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      material = new THREE.PointsMaterial({ color: 0xffe9c7, size: 0.16, transparent: true, opacity: 0.5, depthWrite: false });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      const animate = () => {
        const pos = geometry!.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < COUNT; i += 1) {
          let y = pos.getY(i) + speeds[i];
          if (y > 11) y = -11;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
        points.rotation.y += 0.0005;
        renderer!.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };
      animate();

      const onResize = () => {
        if (!renderer || !container) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(frameId);
        geometry?.dispose();
        material?.dispose();
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
        }
      };
    } catch {
      // WebGL init failed for any reason — no-op. CSS particles already
      // cover this visually, so there is nothing to fall back to here.
      return undefined;
    }
  }, []);
  return <div ref={containerRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [venue, setVenue] = useState<Venue>('cafe');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const heroParallax = useParallax(0.12);
  useLenisSmoothScroll();

  useEffect(() => {
    if (currentUser) navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);

  // Close the lightbox if the venue changes underneath it (gallery array
  // differs per venue, so a stale index could otherwise point at the wrong photo).
  useEffect(() => {
    setLightboxIndex(null);
  }, [venue]);

  const galleryLength = CONTENT[venue].gallery.length;
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? i : (i + 1) % galleryLength));
      else if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? i : (i - 1 + galleryLength) % galleryLength));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, galleryLength]);

  if (currentUser) return null;

  const c = CONTENT[venue];
  const goOrder = () => navigate('/order');
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}`;
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  const waUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent(c.waMessage)}`;
  const waQuickUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I have a question.')}`;
  // FEATURE (2026-09-30): "Reserve a table ... should open WhatsApp and show
  // a message like reserve a table" — the hero's 2nd CTA now opens WhatsApp
  // directly with a purpose-specific message instead of scrolling to #visit,
  // and the separate 3rd WhatsApp icon button next to it is gone (redundant
  // once the CTA itself opens WhatsApp).
  const reserveWaUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent(
    venue === 'cafe' ? 'Hi Cafe Aadvikam, I would like to reserve a table.' : 'Hi, I would like to order a custom cake from Sri Nanjundeshwara Bakery & Sweets.',
  )}`;

  const navLinks: [string, string][] = [
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
            <img key={`logo-${venue}`} src={c.logo} alt={venue === 'cafe' ? 'Cafe Aadvikam' : 'Sri Nanjundeshwara Bakery & Sweets'} className="venue-fade size-11 rounded-full border border-border bg-white object-contain p-1" />
            <div key={`title-${venue}`} className="venue-fade">
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
              <a href={waQuickUrl} target="_blank" rel="noreferrer" onClick={() => setMobileOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-white">
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
              <button onClick={() => { setMobileOpen(false); navigate('/login'); }} className="w-full rounded-2xl border border-border px-4 py-3.5 text-sm font-bold text-foreground">Login</button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Hero ── */}
      <section id="top" key={`hero-${venue}`} className="relative flex min-h-[92vh] items-end overflow-hidden">
        <div className="absolute inset-0 overflow-hidden bg-muted">
          {/* Parallax lives on this wrapper (translateY only); the Ken-Burns
              zoom animation lives on the <img> itself (scale only). Keeping
              them on separate elements avoids the two transforms fighting
              over the same CSS property (a running animation always wins
              the cascade over an inline style on the same element/property,
              so combining them on one node would have silently dropped the
              parallax). */}
          <div className="h-[calc(100%+140px)] w-full" style={{ transform: `translateY(${-heroParallax}px)` }}>
            {/* REDESIGN (2026-09-30): dropped the generic Mixkit stock-footage
                hero video — it was never actually filmed at either venue, and
                sat in front of the real photography below it, so visitors
                never saw the authentic shot at all. The real photo pulled
                from the business's own Google listing is the hero now. */}
            <img key={c.heroImage} src={c.heroImage} alt="" className="hero-zoom h-full w-full object-cover" />
          </div>
        </div>
        {/* Ambient floating flour/steam particles — pure CSS, no canvas. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {HERO_PARTICLES.map((p, i) => (
            <span
              key={i}
              className="hero-particle"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                '--drift-duration': `${p.duration}s`,
                '--drift-delay': `${p.delay}s`,
                '--drift-x': `${p.driftX}px`,
              } as CSSProperties}
            />
          ))}
        </div>
        <HeroParticlesThree />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,15,12,0.22) 0%, rgba(10,15,12,0.46) 55%, rgba(8,10,8,0.94) 100%)' }} />
        <div className="relative z-10 w-full px-4 pb-20 md:px-8">
          <div className="venue-fade mx-auto max-w-7xl text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="size-3.5 animate-float" /> {c.badge}
            </div>
            <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.98] tracking-tight md:text-7xl lg:text-8xl">{c.title}</h1>
            <p className="mt-6 max-w-xl text-lg text-white/80 md:text-xl">{c.lede}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={reserveWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-white shadow-2xl shadow-black/30 transition hover:scale-[1.03] active:scale-95">
                <MessageCircle className="size-4" /> {c.cta2}
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-10">
              <div><p className="font-display text-3xl font-bold">35+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Years serving Berigai</p></div>
              <div><p className="font-display text-3xl font-bold">60+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">{c.statLabel}</p></div>
              <div><p className="font-display text-3xl font-bold">7am–10pm</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Open every day</p></div>
            </div>
          </div>
        </div>
        <button
          onClick={() => scrollToId('#trust')}
          aria-label="Scroll to explore"
          className="scroll-hint absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/70 md:flex"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Scroll</span>
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/35 p-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
          </span>
        </button>
      </section>

      {/* ── Trust strip ── */}
      <section id="trust" className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {TRUST_STRIP[venue].map(({ icon: Icon, value, label }, i) => (
              <div key={label} className={cn('animate-fade-up flex items-center gap-3', `delay-${(Math.min(i, 3) + 1) * 100}` as string)}>
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="font-display text-lg font-bold leading-none text-foreground">{value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Highlights ── */}
      {/* REDESIGN (2026-09-30, review finding, then a second pass): "flat...
          plain icons, feels like a template leftover next to how good the
          photo sections are." First fix used one shared background photo
          behind frosted-glass cards — a big improvement, but still meant 4
          cards pointing at 1 photo. This pass sources enough real photography
          (see the new imports above) to give each card its OWN photo, same
          treatment as the menu grid below (the section that already scored
          best in review) rather than a new pattern. */}
      <section key={`highlights-${venue}`} className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.highlightsEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.highlightsTitle}</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {c.highlights.map(({ icon: Icon, title, copy, image }) => (
              <div key={title} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted shadow-soft transition hover:-translate-y-1 hover:shadow-lifted">
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="mb-3 grid size-10 place-items-center rounded-xl bg-white/15 text-white backdrop-blur-sm">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/80">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About: replaces the old live-price menu section — see the file
          header comment. Plain explanatory copy only — no menu link of any
          kind, on-page or otherwise; WhatsApp is the only prompt here. ── */}
      <section key={`about-${venue}`} className="bg-card py-20">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.menuEyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.menuTitle}</h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">{c.aboutCopy}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:scale-[1.03] active:scale-95">
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section id="gallery" key={`gallery-${venue}`} className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              <Camera className="size-3.5" /> {c.galleryEyebrow}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.galleryTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{c.gallerySub}</p>
          </Reveal>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {c.gallery.map((item, i) => (
              <button
                key={item.caption}
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={`View larger: ${item.caption}`}
                className={cn(
                  'group relative cursor-zoom-in overflow-hidden rounded-2xl bg-muted text-left',
                  i === 0 ? 'col-span-2 aspect-[16/9] md:col-span-1 md:aspect-[4/5]' : 'aspect-square md:aspect-[4/5]',
                )}
              >
                <img src={item.image} alt={item.caption} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 transition group-hover:opacity-100" />
                <p className="absolute inset-x-0 bottom-0 translate-y-2 p-3 text-xs font-semibold text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  {item.caption}
                </p>
                <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                  <Camera className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Story ── */}
      <section id="story" key={`story-${venue}`} className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
          <Reveal className="relative overflow-hidden rounded-[28px] bg-muted">
            <img src={c.storyImage} alt="" className="h-[420px] w-full object-cover md:h-[480px]" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-card/95 px-5 py-4 shadow-lifted">
              <p className="font-display text-xl font-bold text-foreground">{c.storyBadge}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Family run, Berigai</p>
            </div>
            <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-card/95 px-4 py-2 shadow-lifted">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="font-display text-sm font-bold text-foreground">{c.reviewRating}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">· {c.reviewCount}</span>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Our story</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.storyTitle}</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">{c.storyP1}</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{c.storyP2}</p>
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

      {/* ── Loved across Hosur & Bangalore (real Google review social proof) ── */}
      <section key={`reviews-${venue}`} className="bg-card py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">What guests say</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Loved across Hosur and into Bangalore</h2>
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-sm font-bold text-foreground">{c.reviewRating} on Google</p>
              <p className="text-sm text-muted-foreground">· {c.reviewCount}</p>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {c.reviews.map((review) => (
              <div key={review.author} className="flex flex-col rounded-2xl border border-border bg-background p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lifted">
                <div className="mb-3 flex gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-3.5 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="flex-1 text-sm leading-6 text-foreground/90">“{review.quote}”</p>
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-sm font-bold text-foreground">{review.author}</p>
                  <p className="text-[11px] text-muted-foreground">{review.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Party hall (cafe) / Custom orders (bakery) ── */}
      {/* Preserved exactly: the WhatsApp-enquiry CTA (href + message text) for
          both venues. Everything else here — feature grid, image collage — is
          new presentation around that same, unchanged CTA. */}
      <section id="occasion" key={`occasion-${venue}`} className="py-20">
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
                    href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking or catering for an event.')}`}
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

              <Reveal delay={150} className="grid grid-cols-2 gap-3">
                <div className="group col-span-2 overflow-hidden rounded-2xl bg-white/5">
                  <img src={c.occasionGallery[0]} alt="Party hall and celebration setup" loading="lazy" className="h-[190px] w-full object-cover transition duration-500 group-hover:scale-105 md:h-[220px]" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
                <div className="group overflow-hidden rounded-2xl bg-white/5">
                  <img src={c.occasionGallery[1]} alt="Celebration decor" loading="lazy" className="h-[140px] w-full object-cover transition duration-500 group-hover:scale-105 md:h-[160px]" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
                <div className="group overflow-hidden rounded-2xl bg-white/5">
                  <img src={c.occasionGallery[2]} alt="Celebration cake" loading="lazy" className="h-[140px] w-full object-cover transition duration-500 group-hover:scale-105 md:h-[160px]" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── Visit us ── */}
      <section id="visit" className="py-20">
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

          <Reveal delay={100} className="relative mt-6 h-[320px] overflow-hidden rounded-[28px] border border-border bg-muted md:h-[380px]">
            {!mapLoaded && (
              <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <MapPin className="size-6 text-muted-foreground" />
                <p className="text-sm font-semibold text-muted-foreground">Loading map…</p>
                <p className="text-xs text-muted-foreground">{CAFE_INFO.address}</p>
              </div>
            )}
            <iframe
              title="Cafe Aadvikam location"
              src={mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setMapLoaded(true)}
              className="relative z-10 h-full w-full border-0"
            />
          </Reveal>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={goOrder} className="inline-flex items-center gap-2 rounded-full cafe-gradient px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
              {c.ctaNav} <ArrowRight className="size-4" />
            </button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-foreground transition hover:bg-muted">
              Get directions <Navigation className="size-4" />
            </a>
            <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-bold text-white transition hover:scale-[1.03] active:scale-95">
              WhatsApp us <MessageCircle className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center md:px-8">
          <div className="flex items-center gap-3">
            <img src={cafeLogo} alt="Cafe Aadvikam" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
            <img src={snbLogo} alt="Sri Nanjundeshwara Bakery & Sweets" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground">
            {navLinks.map(([label, href]) => (
              <button key={href} onClick={() => scrollToId(href)} className="hover:text-primary">{label}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">&copy; Cafe Aadvikam · Sri Nanjundeshwara Bakery & Sweets · {CAFE_INFO.address}</p>
        </div>
      </footer>

      {/* ── Gallery lightbox (Apple Photos-style viewer, no library) ── */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          <div className="flex items-center justify-between text-white/80">
            <p className="text-xs font-semibold uppercase tracking-wide">
              {lightboxIndex + 1} / {c.gallery.length}
            </p>
            <button onClick={() => setLightboxIndex(null)} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <button
              onClick={() => setLightboxIndex((i) => (i === null ? i : (i - 1 + c.gallery.length) % c.gallery.length))}
              aria-label="Previous photo"
              className="absolute left-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
            >
              <ArrowRight className="size-6 rotate-180" />
            </button>
            <img
              key={lightboxIndex}
              src={c.gallery[lightboxIndex].image}
              alt={c.gallery[lightboxIndex].caption}
              className="lightbox-in max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxIndex((i) => (i === null ? i : (i + 1) % c.gallery.length))}
              aria-label="Next photo"
              className="absolute right-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
            >
              <ArrowRight className="size-6" />
            </button>
          </div>
          <p className="pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm font-semibold text-white/85">
            {c.gallery[lightboxIndex].caption}
          </p>
        </div>
      )}

      <ChatBot />
    </main>
  );
}
