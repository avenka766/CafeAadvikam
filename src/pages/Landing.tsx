// src/pages/Landing.tsx
// STRUCTURAL REBUILD (2026-09-30, later same day): "you are still using all
// the old design only please follow my prompt" — everything up to this point
// (new sections, DB-backed content, coffee-brown palette) was added onto a
// page that still used a venue TOGGLE — Cafe OR Bakery shown at a time, the
// same core mechanic as every earlier pass of this file. The brief describes
// one continuous scrolling page with Cafe & Events, then Bakery & Foods,
// stacked in sequence — that's a different information architecture, not a
// styling difference, so no amount of new sections fixed it. This pass
// removes the toggle: both venues' full experience (highlights, about,
// gallery, story, reviews, and each venue's own extras) now render in
// sequence on one page. The six blocks that are structurally identical
// between venues (trust strip, highlights, about, gallery, story, reviews)
// are pulled into small prop-driven components below and called once per
// venue, instead of writing near-identical JSX out twice.
//
// PREMIUM REDESIGN, PASS 2 (kept from the original header, still true):
// animations run on CSS keyframe utilities + GSAP/ScrollTrigger (not Framer
// Motion, which broke in the field once already) — .animate-fade-up,
// .animate-float, .hero-zoom, delay-*, plus the Reveal component below.
// No backdrop-blur (perf note carried over from the billing terminal work).
// Every image container has a bg-muted fallback so a failed image shows a
// soft placeholder instead of invisible blank space.
//
// FEATURE (2026-09-30): no on-page live-price menu — this page is
// marketing/explanation only; every "order" CTA either links to /order or
// /menu (existing dedicated pages) or opens WhatsApp.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
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
  Instagram,
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
import { cn } from '@/lib/utils';
import cafeLogo from '@/assets/cafe-logo.png';
import snbLogo from '@/assets/snb-logo.png';
// REDESIGN (2026-09-30): every photo on this page is real photography pulled
// directly from the business's own Google Maps listings, not stock, vetted
// one by one — the raw "all photos" pool for a Maps listing is genuinely
// mixed with unrelated content (three candidates turned out to be billboards
// for other bakeries, two were private individuals' personal photos swept in
// by tag association). Every file below was opened at full resolution and
// visually confirmed to actually be this business before being kept.
// PHOTO QUALITY PASS (2026-10-01): "rate this image more than 9 then only
// use it or else remove" — every real photo was rated honestly. Five didn't
// clear the bar even after a retouch pass (crop/color-correct) and had no
// viable fix: cafe-exterior.jpg (also had an identifiable child's face in
// frame — a privacy issue independent of the rating), cafe-sizzling-
// brownie.jpg (an intruding hand/ring no crop could fully remove),
// bakery-storefront.jpg and bakery-signboard-night.jpg (real neon-pink LED
// signage that a color-grade pass can soften but not make match this page's
// palette), bakery-fruit-cake-crop.jpg (doesn't actually depict a cake —
// was mislabeled). All five are deleted, not just unreferenced. The ones
// kept were re-cropped/color-corrected in place (same filenames) where that
// pushed them over the line — see git history for before/after if needed.
import cafeDessertPlate from '@/assets/real/cafe-dessert-plate.jpg';
import cafeInterior from '@/assets/real/cafe-interior.jpg';
import cafeInteriorMural from '@/assets/real/cafe-interior-mural.jpg';
import bakeryReceptionFlowers from '@/assets/real/bakery-reception-flowers.jpg';
// Re-sourced 2026-10-01 from the same SNB Google Maps listing at full
// resolution and re-cropped to exclude the customer's handwritten message
// (a different, cleaner crop than the original — no coin/charm objects in
// frame this time either).
import bakeryHeartCakeRoses from '@/assets/real/bakery-heart-cake-roses.jpg';
import bakeryCakeCounter from '@/assets/real/bakery-cake-counter.jpg';
// Found already sitting unused in public/party-hall.jpg (not newly sourced —
// a real photo of the actual building, decorated for an event, showing both
// the Cafe Aadvikam and SNB signage together). Now the single brand hero,
// since this page has one unified hero instead of a per-venue one.
import cafePartyHallExterior from '@/assets/real/cafe-party-hall-exterior.jpg';
// User-supplied product/building photos (2026-10-01 instruction batch).
// party-hall-render.jpg: flagged to the user before use — the signage in
// this render reads "Café Aavikam" (misspelled) with a tagline that matches
// nothing established on this page, strongly suggesting it's an AI-generated
// or stock architectural render rather than a photo of the real building.
// Used anyway because the user supplied it directly and explicitly directed
// its placement after being told this.
import partyHallRender from '@/assets/real/party-hall-render.jpg';
import snbGiftBoxBlue from '@/assets/real/snb-gift-box-blue.jpg';
import snbGiftBoxGreen from '@/assets/real/snb-gift-box-green.jpg';
// Stock photography (2026-10-01), explicitly authorized by the user for
// these specific occasion/highlight cards only — every other photo on this
// page stays real business photography. Each sourced from Unsplash and
// verified "Free Photo on Unsplash" (not the paid Unsplash+ tier) before
// downloading.
import occasionWedding from '@/assets/real/occasion-wedding.jpg';
import occasionBirthday from '@/assets/real/occasion-birthday.jpg';
import occasionFamilyFunction from '@/assets/real/occasion-family-function.jpg';
import occasionCorporateEvents from '@/assets/real/occasion-corporate-events.jpg';
import occasionAnniversary from '@/assets/real/occasion-anniversary.jpg';
import occasionEngagement from '@/assets/real/occasion-engagement.jpg';
import occasionFestival from '@/assets/real/occasion-festival.jpg';
import occasionSpecial from '@/assets/real/occasion-special.jpg';
import cafeDosaThaliFresh from '@/assets/real/cafe-dosa-thali-fresh.jpg';
import ChatBot from '@/components/features/ChatBot';
import { CAFE_INFO, mapsUrl, mapsEmbedUrl } from '@/constants/cafeInfo';
import { supabase } from '@/lib/supabase';

type Venue = 'cafe' | 'bakery';

type GalleryItem = { image: string; caption: string };
type OccasionFeature = { icon: typeof Users; label: string };
// `rating` is optional — the hardcoded fallback reviews below don't carry an
// individual rating (they're all genuinely 5-star quotes), so ReviewsSection
// defaults to 5 when it's absent. DB-backed testimonials (admin CMS) do set
// it per-review.
type Review = { quote: string; author: string; meta: string; rating?: number };

type VenueContent = {
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
  reviews: Review[];
  occasionEyebrow: string;
  occasionTitle: string;
  occasionCopy: string;
  occasionFeatures: OccasionFeature[];
  occasionCtaLabel: string;
  occasionGallery: string[];
  waMessage: string;
  // Section-intro headline, shown once at the top of this venue's block
  // (brief section 5's "Celebrate Every Occasion..." / section 10's
  // "A Bakery Legacy Since 1988") — distinct from the single shared hero.
  sectionTitle: string;
  sectionLede: string;
};

const CONTENT: Record<Venue, VenueContent> = {
  cafe: {
    sectionTitle: 'Celebrate Every Occasion With Cafe Aadvikam',
    sectionLede: 'From intimate family gatherings to grand celebrations, Cafe Aadvikam brings together delicious food, thoughtful service and memorable spaces for every occasion.',
    highlightsEyebrow: 'Why guests keep coming back',
    highlightsTitle: 'Made fresh. Served warm. Always on time.',
    highlights: [
      { icon: Leaf, title: 'Fresh daily', copy: 'Batter ground and chutneys made each morning, not the night before.', image: cafeDosaThaliFresh },
      { icon: UtensilsCrossed, title: 'Dine-in and takeaway', copy: 'Sit down for a full breakfast, or call ahead and grab it on the way.', image: cafeInteriorMural },
      { icon: CalendarCheck, title: 'Party hall on-site', copy: 'A big hall with ample parking, ready for birthdays, get-togethers, and family functions.', image: partyHallRender },
      { icon: Clock, title: 'Consistent quality', copy: 'Same recipe, same standard, on your first visit or your hundredth.', image: cafeDessertPlate },
    ],
    menuEyebrow: 'The lineup',
    menuTitle: 'Signature dishes guests order on repeat',
    aboutCopy: 'Ghee-roast dosas, idlis, vadas, and a full South Indian breakfast spread, followed through the day by rice meals, chats, and a working bakery counter right next door. Everything is cooked fresh in a pure-vegetarian kitchen — dine-in, takeaway, or a party hall for when the whole family is celebrating. We also cater daily meals for corporate clients and offices across Hosur, trusted by a growing number of businesses for consistent, on-time service.',
    galleryEyebrow: 'Around the cafe',
    galleryTitle: 'A look inside Cafe Aadvikam',
    gallerySub: 'The food, the room, and the moments in between.',
    gallery: [],
    storyImage: '',
    storyBadge: 'Since 1988',
    storyTitle: 'Two kitchens, one standard: nothing leaves half-effort',
    storyP1: 'It started in 1988 as a single breakfast counter on the Hosur Main Road — a ghee-roast dosa, a tumbler of filter coffee, and a family that decided early on never to cut a corner. Almost four decades later that same standard now runs a full-service cafe, a working bakery under the Sri Nanjundeshwara Bakery & Sweets name, and a big party hall with ample parking — still the same family, still the same kitchen discipline.',
    storyP2: 'Word travelled the way it always does out here — one satisfied table at a time. Today families from across Hosur, and plenty who make the drive from Bangalore, come specifically for it. Guests call it “an absolute gem in the midst of nowhere,” and the room backs it up: 4.6 stars from the people who actually eat here.',
    storyList: [
      'Stone-ground batter, made fresh every morning',
      'Traditional filter coffee, brewed the slow way',
      'A big party hall with ample parking, run by the same team',
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
    occasionCopy: 'A big hall with ample parking, right in-house — and for weddings, corporate events, or a celebration held elsewhere, we also undertake outside catering. We handle the decor and every kind of service too, so you can just enjoy your day. Same kitchen, same recipes, the same standard we’ve run since 1988, now catering events across Hosur and into Bangalore.',
    occasionFeatures: [
      { icon: Users, label: 'A big hall with ample parking' },
      { icon: Utensils, label: 'Outside catering for weddings & events' },
      { icon: PartyPopper, label: 'Full decor and event service support' },
      { icon: ShieldCheck, label: 'One family-run kitchen since 1988' },
    ],
    occasionCtaLabel: 'Check availability',
    occasionGallery: [partyHallRender],
    waMessage: 'Hi Cafe Aadvikam, I would like to place an order.',
  },
  bakery: {
    sectionTitle: 'A Bakery Legacy Since 1988',
    sectionLede: 'Decades of baking, sweetness and trust — from birthday cakes to festival sweets, Sri Nanjundeshwara Bakery & Sweets bakes everything in-house. Nothing frozen, nothing rushed.',
    highlightsEyebrow: 'Why Berigai bakes with us',
    highlightsTitle: 'Baked fresh. Decorated with care. Ready on time.',
    highlights: [
      { icon: Cake, title: 'Custom cakes', copy: 'Any flavour, size, or message — designed around your occasion.', image: '' },
      { icon: Sparkles, title: 'Fresh bakes daily', copy: 'Breads, buns, and pastries baked in small batches through the day.', image: '' },
      { icon: Coffee, title: 'Festival sweets', copy: 'Traditional Indian sweets made the same way our family always has.', image: '' },
      { icon: Truck, title: 'Pickup and delivery', copy: 'Order ahead and collect in-store, or have it delivered locally.', image: '' },
    ],
    menuEyebrow: 'The counter',
    menuTitle: 'Bakery favourites, made in-house every day',
    aboutCopy: 'Birthday cakes decorated to order, fresh breads and buns baked in small batches through the day, and traditional Indian sweets made the way they always have been — nothing frozen, nothing rushed. We’re well known for our ghee sweets, and alongside the bakery counter we also stock traditional pickles and cold-pressed oils. Walk in for what’s fresh on the counter today, or call ahead for a custom cake.',
    galleryEyebrow: 'Around the bakery',
    galleryTitle: 'A look inside the bakery counter',
    gallerySub: 'What comes out of the oven, every single day.',
    gallery: [],
    storyImage: '',
    storyBadge: 'Since 1988',
    storyTitle: 'Baked in-house, the same recipes since day one',
    storyP1: 'Sri Nanjundeshwara Bakery & Sweets grew out of the same 1988 kitchen as the cafe next door — started by the same family, on the same promise: nothing frozen, nothing rushed. Every cake is still decorated to order, every loaf still baked in small daily batches, and every festival sweet still made the traditional way, by hand.',
    storyP2: 'That promise is why the counter has become a Hosur habit — locals stop in on the way to work, and word has carried the name into Bangalore and Attibele too, almost entirely by word of mouth. We hold ourselves to one standard and never cut corners on quality, and anyone is welcome to visit our manufacturing unit and see the cleanliness and care for themselves. It shows in the numbers: 686 Google reviews and counting, holding a 4.5-star average, with guests calling out the Jalebi by name and organisations like the Lions Club of Hosur Everest trusting the counter for their own celebrations.',
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
    occasionCopy: 'Any design you can imagine, we can make — tell us the flavour, size, and design, and we’ll have it ready with delivery all over Hosur and the surrounding area. Baking in Berigai since 1988 and specialists in ghee sweets, with regular clients ordering all the way from Bangalore for the taste. We also stock traditional pickles and cold-pressed oils, and we now deliver pan-India, so everyone can order the same taste, wherever they are.',
    occasionFeatures: [
      { icon: Cake, label: 'Best in cake decor — any design you imagine' },
      { icon: Sparkles, label: 'Specialists in ghee sweets' },
      { icon: Truck, label: 'Delivered across Hosur & surrounding area' },
      { icon: ShieldCheck, label: 'Trusted since 1988, never frozen' },
    ],
    occasionCtaLabel: 'Place your order',
    occasionGallery: [bakeryHeartCakeRoses, bakeryReceptionFlowers, bakeryCakeCounter],
    waMessage: 'Hi, I would like to order from Sri Nanjundeshwara Bakery & Sweets.',
  },
};

// The whole business — cafe and bakery alike — traces back to 1988.
const TRUST_STRIP: Record<Venue, { icon: typeof CalendarCheck; value: string; label: string }[]> = {
  cafe: [
    { icon: CalendarCheck, value: 'Est. 1988', label: 'Family run, Berigai' },
    { icon: Users, value: 'Big hall', label: 'Party hall, ample parking' },
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

// Cafe & Events occasion cards (brief section 5) — reuses the small set of
// real cafe/party-hall photos already on hand (round-robin), rather than
// fabricating 8 distinct stock photos for occasions this business doesn't
// have individual photography for yet.
const OCCASION_CARDS = [
  { icon: Users, title: 'Weddings', copy: 'Food and catering for your big day — same kitchen, same standard since 1988.', image: occasionWedding },
  { icon: PartyPopper, title: 'Birthdays', copy: "From kids' parties to milestone birthdays, with a custom cake to match.", image: occasionBirthday },
  { icon: UtensilsCrossed, title: 'Family Functions', copy: 'A space for get-togethers and family celebrations, run by the same family.', image: occasionFamilyFunction },
  { icon: Utensils, title: 'Corporate Events', copy: 'Catering for offices and corporate gatherings, pure vegetarian throughout.', image: occasionCorporateEvents },
  { icon: Star, title: 'Anniversaries', copy: 'Celebrate another year together with a table, a cake, or the whole hall.', image: occasionAnniversary },
  { icon: Sparkles, title: 'Engagements', copy: 'Decor and setup support for engagement celebrations, big or small.', image: occasionEngagement },
  { icon: CalendarCheck, title: 'Festivals', copy: 'Traditional sweets and a full spread for festival gatherings.', image: occasionFestival },
  { icon: ShieldCheck, title: 'Special Occasions', copy: "Whatever you're celebrating, we'll help you celebrate it well.", image: occasionSpecial },
];

// Catering types (brief section 7) — real, already-established services
// (the occasion section above already covers these facts in prose; this is
// just the exhaustive list the brief wants as its own prominent block).
const CATERING_TYPES = ['Wedding Catering', 'Party Catering', 'Corporate Catering', 'Family Functions', 'Religious Functions', 'Birthday Events', 'Engagements', 'Anniversaries', 'Large Gatherings', 'Bulk Food Orders'];

// Cake section messaging (brief section 12) — the exhaustive design-type
// list; not a claim that a photo of each exists yet (the gallery below is
// honest about what's actually been photographed).
const CAKE_MESSAGING = ['Best-in-Class Cake Decoration', 'Custom Cake Designs', 'Birthday Cakes', 'Wedding Cakes', 'Anniversary Cakes', 'Kids Theme Cakes', 'Photo Cakes', 'Fondant Cakes', 'Floral Cakes', 'Character Cakes', 'Corporate Cakes', 'Custom Event Cakes'];

// Bakery product categories (brief section 11) — icon/text cards, not
// fabricated photos: only Cakes and Ghee Sweets have real product photos on
// this page (their own sections below); Breads/Puffs/Cookies/Savouries/
// Sweets/Traditional Specialities genuinely have none yet. Display-only, not
// clickable (2026-10-01 instruction) — a plain category list, not nav links.
const BAKERY_CATEGORIES: string[] = ['Cakes', 'Breads', 'Puffs', 'Bakery Snacks', 'Cookies', 'Savouries', 'Sweets', 'Ghee Sweets', 'Pickles & Oils', 'Traditional Specialities'];

// FAQs (brief section 27) — identical content to index.html's FAQPage JSON-LD,
// kept in sync by hand since they're in different files; every answer is a
// fact already stated elsewhere on this page.
const FAQS = [
  { q: "Is Cafe Aadvikam pure vegetarian?", a: 'Yes, Cafe Aadvikam is a pure vegetarian restaurant serving South Indian, North Indian and Chinese dishes.' },
  { q: "What are Cafe Aadvikam's opening hours?", a: 'Cafe Aadvikam is open 7 AM to 10 PM, every day of the week.' },
  { q: 'Does Cafe Aadvikam have a party hall for events?', a: 'Yes, the in-house party hall is a big hall with ample parking, and outside catering is also available for weddings, corporate events and family functions across Hosur and into Bangalore.' },
  { q: 'Can I order a custom cake from Sri Nanjundeshwara Bakery & Sweets?', a: "Yes, every cake is decorated to order — tell us the flavour, size and design and it's delivered across Hosur and the surrounding area." },
  { q: 'Does Sri Nanjundeshwara Bakery & Sweets deliver pan-India?', a: 'Yes — Sri Nanjundeshwara Bakery & Sweets now delivers bakery and traditional food products pan-India, so you can order the same taste wherever you are.' },
];

// Shared trust pillars for the "Why Aadvikam" section — every fact here is
// already established elsewhere on this page (Since 1988, ghee sweets,
// custom cake decor, catering, party hall) — nothing new is claimed here.
const WHY_AADVIKAM = [
  { icon: CalendarCheck, title: 'Since 1988', copy: 'Family-run in Berigai for almost four decades.' },
  { icon: Star, title: 'Heritage of taste', copy: 'The same recipes and kitchen discipline since day one.' },
  { icon: Cake, title: 'Custom cake design', copy: 'Any flavour, size, or design, made to order.' },
  { icon: PartyPopper, title: 'Catering for occasions', copy: 'Weddings, birthdays, corporate events, and more.' },
  { icon: Leaf, title: 'Quality ingredients', copy: '100% in-house — nothing frozen, nothing rushed.' },
  { icon: ShieldCheck, title: 'Personalized service', copy: 'One family, still running both kitchens.' },
];

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

// Confirmed live 2026-10-01 — "snb bakery (@cafe_aadvikam)", bio matches this
// exact business (Cafe Aadvikam, Veg Restaurant & Party Hall, Berikai near
// Hosur). Handle given directly by the business owner.
const INSTAGRAM_URL = 'https://www.instagram.com/cafe_aadvikam/';

function scrollToId(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

gsap.registerPlugin(ScrollTrigger);

// Scroll-triggered storytelling reveal, driven by real GSAP + ScrollTrigger
// timelines. The element is NOT hidden until this effect has confirmed it
// can actually attach a ScrollTrigger — and even then, a hard setTimeout
// safety net forces the element visible after 2.5s no matter what, so a
// broken/untestable animation path can never leave a whole section
// permanently invisible (that happened once already, with Framer Motion).
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
// app (billing terminals, dashboards) never sees it. Synced to GSAP's
// ticker, the documented integration pattern between Lenis and ScrollTrigger.
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

// Lightweight, dependency-free parallax: reads scroll position on a passive
// scroll listener + rAF, returns a translateY in px. Capped to a small range
// so it reads as "cinematic depth" rather than motion-sickness scroll-
// jacking, and is fully inert if reduced-motion is requested.
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
// unavailable or anything in setup throws, this silently renders nothing.
//
// PERF (2026-10-01): `three` (~600KB) is dynamically imported here instead of
// statically at module top-level. This is the ONLY place it's used on the
// whole page, and this effect already tolerates "never runs" (reduced-motion,
// no WebGL) — deferring the import to after mount, off the critical render
// path, costs nothing functionally and keeps it out of every other route's
// shared bundle. Deliberately NOT touching vite.config.ts's manualChunks —
// that function has a documented history of a real production outage
// (10 days of silently-failing WhatsApp sends) from a cross-chunk CJS
// interop break, so this page scopes its own win instead of risking that.
function HeroParticlesThree() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return;

    let cancelled = false;
    let frameId = 0;
    let renderer: import('three').WebGLRenderer | null = null;
    let geometry: import('three').BufferGeometry | null = null;
    let material: import('three').PointsMaterial | null = null;
    let onResize: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import('three');
        if (cancelled) return;

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
          const pos = geometry!.attributes.position as import('three').BufferAttribute;
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

        onResize = () => {
          if (!renderer || !container) return;
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);
      } catch {
        // WebGL init (or the dynamic import itself) failed — no-op. CSS
        // particles already cover this visually, nothing to fall back to.
      }
    })();

    return () => {
      cancelled = true;
      if (onResize) window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameId);
      geometry?.dispose();
      material?.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
      }
    };
  }, []);
  return <div ref={containerRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}

// ── The blocks that are structurally identical between Cafe & Events
// and Bakery & Foods — extracted once, rendered twice (see the main
// component below), instead of writing near-identical JSX out twice. ──

function VenueIntro({ id, title, lede, badges }: { id: string; title: string; lede: string; badges?: string[] }) {
  return (
    <section id={id} className="bg-card py-16 text-center">
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <Reveal>
          <h2 className="font-display text-3xl font-bold md:text-4xl">{title}</h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">{lede}</p>
          {badges && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {badges.map((b) => (
                <span key={b} className="rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">{b}</span>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function TrustStripSection({ items }: { items: typeof TRUST_STRIP.cafe }) {
  return (
    <section className="border-b border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {items.map(({ icon: Icon, value, label }, i) => (
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
  );
}

function HighlightsSection({ c }: { c: VenueContent }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="mx-auto mb-12 max-w-xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.highlightsEyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.highlightsTitle}</h2>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.highlights.map(({ icon: Icon, title, copy, image }) => (
            <div key={title} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted shadow-soft transition hover:-translate-y-1 hover:shadow-lifted">
              {image ? (
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
              ) : (
                <div className="h-full w-full" style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }} />
              )}
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
  );
}

function AboutSection({ c, tags }: { c: VenueContent; tags?: string[] }) {
  return (
    <section className="bg-card py-20">
      <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{c.menuEyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">{c.menuTitle}</h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">{c.aboutCopy}</p>
          {tags && tags.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-bold text-primary">{t}</span>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function GallerySection({ id, c, onOpen }: { id: string; c: VenueContent; onOpen: (i: number) => void }) {
  if (c.gallery.length === 0) return null;
  return (
    <section id={id} className="bg-card py-20">
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
              onClick={() => onOpen(i)}
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
  );
}

function StorySection({ id, c }: { id: string; c: VenueContent }) {
  return (
    <section id={id} className="py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:items-center">
        <Reveal className="relative overflow-hidden rounded-[28px] bg-muted">
          {c.storyImage ? (
            <>
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
            </>
          ) : (
            <div
              className="flex h-[420px] w-full flex-col items-center justify-center gap-4 px-8 text-center md:h-[480px]"
              style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}
            >
              <p className="font-display text-3xl font-bold text-white">{c.storyBadge}</p>
              <p className="text-xs uppercase tracking-wide text-white/60">Family run, Berigai</p>
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <span className="font-display text-sm font-bold text-white">{c.reviewRating}</span>
                <span className="text-[10px] font-semibold text-white/70">· {c.reviewCount}</span>
              </div>
            </div>
          )}
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
  );
}

function ReviewsSection({ c, reviews }: { c: VenueContent; reviews: Review[] }) {
  return (
    <section className="py-20">
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
          {reviews.map((review) => (
            <div key={review.author} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lifted">
              <div className="mb-3 flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={cn('size-3.5', i < Math.round(review.rating ?? 5) ? 'fill-amber-400 text-amber-400' : 'text-border')} />)}
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
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<{ v: Venue; index: number } | null>(null);
  const heroParallax = useParallax(0.12);
  useLenisSmoothScroll();

  useEffect(() => {
    if (currentUser) navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!lightbox) return;
    const len = CONTENT[lightbox.v].gallery.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') setLightbox((l) => (l ? { ...l, index: (l.index + 1) % len } : l));
      else if (e.key === 'ArrowLeft') setLightbox((l) => (l ? { ...l, index: (l.index - 1 + len) % len } : l));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // Testimonials, the cake gallery, and any live promo banner come from the
  // DB (admin-manageable). Testimonials fall back to each venue's own
  // hardcoded `reviews` array if the table is empty or the fetch fails — the
  // real, already-verified Google reviews stay the floor, never blank.
  const [dbTestimonials, setDbTestimonials] = useState<Record<Venue, Review[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.from('testimonials').select('venue, author, quote, rating, meta, display_order').eq('active', true).order('display_order')
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return;
        const toReview = (r: (typeof data)[number]): Review => ({ quote: r.quote as string, author: r.author as string, meta: (r.meta as string) ?? '', rating: r.rating != null ? Number(r.rating) : undefined });
        setDbTestimonials({
          cafe: data.filter((r) => r.venue === 'cafe').map(toReview),
          bakery: data.filter((r) => r.venue === 'bakery').map(toReview),
        });
      });
    return () => { cancelled = true; };
  }, []);

  const [cakeGallery, setCakeGallery] = useState<{ id: string; image_url: string; category: string | null; caption: string | null }[]>([]);
  const [cakeCategory, setCakeCategory] = useState('All');
  const [cakeLightbox, setCakeLightbox] = useState<number | null>(null);
  useEffect(() => { setCakeLightbox(null); }, [cakeCategory]);
  useEffect(() => {
    let cancelled = false;
    void supabase.from('cake_gallery').select('id, image_url, category, caption').eq('active', true).order('display_order')
      .then(({ data }) => { if (!cancelled && data) setCakeGallery(data); });
    return () => { cancelled = true; };
  }, []);

  const [promoBanner, setPromoBanner] = useState<{ title: string; message: string | null; cta_label: string | null; cta_link: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // RLS already restricts rows to active + within start/end date.
    void supabase.from('promo_banners').select('title, message, cta_label, cta_link, venue, display_order').order('display_order')
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return;
        setPromoBanner(data.find((r) => r.venue === 'both') ?? data[0]);
      });
    return () => { cancelled = true; };
  }, []);

  // Party Hall enquiry form — persists to party_hall_enquiries so the
  // business has a real record, in addition to (not instead of) WhatsApp.
  const [hallForm, setHallForm] = useState({ name: '', phone: '', eventType: '', eventDate: '', guestCount: '', preferredTime: '', requirements: '' });
  const [hallSubmitting, setHallSubmitting] = useState(false);
  const [hallSubmitted, setHallSubmitted] = useState(false);
  const [hallError, setHallError] = useState<string | null>(null);
  async function submitHallEnquiry(e: FormEvent) {
    e.preventDefault();
    if (!hallForm.name.trim() || !hallForm.phone.trim()) { setHallError('Name and phone are required.'); return; }
    setHallSubmitting(true);
    setHallError(null);
    const { error } = await supabase.from('party_hall_enquiries').insert({
      name: hallForm.name.trim(),
      phone: hallForm.phone.trim(),
      event_type: hallForm.eventType || null,
      event_date: hallForm.eventDate || null,
      guest_count: hallForm.guestCount ? Number(hallForm.guestCount) : null,
      preferred_time: hallForm.preferredTime || null,
      requirements: hallForm.requirements || null,
    });
    setHallSubmitting(false);
    if (error) { setHallError('Could not submit right now — please use WhatsApp instead.'); return; }
    setHallSubmitted(true);
  }

  if (currentUser) return null;

  const cafeReviews = dbTestimonials?.cafe?.length ? dbTestimonials.cafe : CONTENT.cafe.reviews;
  const bakeryReviews = dbTestimonials?.bakery?.length ? dbTestimonials.bakery : CONTENT.bakery.reviews;

  // Cake gallery falls back to the existing real bakery photos when the
  // admin hasn't added any cake_gallery rows yet — never an empty section.
  const cakeImages = cakeGallery.length > 0
    ? cakeGallery
    : CONTENT.bakery.gallery.map((g, i) => ({ id: `fallback-${i}`, image_url: g.image, category: null as string | null, caption: g.caption as string | null }));
  const cakeCategories = ['All', ...Array.from(new Set(cakeGallery.map((i) => i.category).filter((v): v is string => !!v)))];
  const displayedCakeImages = cakeCategory === 'All' ? cakeImages : cakeImages.filter((i) => i.category === cakeCategory);

  const goOrder = () => navigate('/order');
  const waQuickUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I have a question.')}`;
  const cafeReserveWaUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to reserve a table.')}`;
  const bakeryOrderWaUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi, I would like to order a custom cake from Sri Nanjundeshwara Bakery & Sweets.')}`;
  const cateringWaUrl = `https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like to enquire about party hall booking or catering for an event.')}`;

  // Nav structure follows the brief exactly (Home / Cafe & Events /
  // Bakery & Foods / Cakes / Catering / Party Hall / About / Contact) — this
  // is a single continuous page now, so every item is just a scroll target,
  // not a venue switch.
  const NAV_ITEMS: [string, string][] = [
    ['Home', '#top'],
    ['Cafe & Events', '#cafe-section'],
    ['Bakery & Foods', '#bakery-section'],
    ['Cakes', '#cakes'],
    ['Catering', '#occasion'],
    ['Party Hall', '#occasion'],
    ['About', '#heritage'],
    ['Contact', '#visit'],
  ];

  return (
    <main className="landing-heritage min-h-screen bg-background pb-[4.5rem] font-body antialiased md:pb-0">
      {/* ── Nav (2026-10-01 redesign): the old header put "Login" and "Order
          Now" front and center — this one leads with heritage instead, and
          every scroll destination (plus staff Login) now lives behind the
          hamburger, open at every width since the desktop link row is gone. ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 md:px-8">
          <button onClick={() => scrollToId('#top')} className="flex items-center gap-3 text-left">
            <img src={cafeLogo} alt="Cafe Aadvikam" className="size-11 rounded-full border border-border bg-white object-contain p-1" />
            <div>
              <p className="font-display text-lg font-bold leading-none text-foreground">Cafe Aadvikam</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Since 1988 · Family-Run in Berigai</p>
            </div>
          </button>

          <button onClick={() => scrollToId('#heritage')} className="group hidden items-center gap-1.5 text-sm font-bold text-foreground transition hover:text-primary sm:inline-flex">
            Explore our story <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </button>

          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="hidden text-[11px] font-semibold text-muted-foreground underline-offset-2 transition hover:text-primary hover:underline sm:inline-block">
              Staff Login
            </button>
            <button onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-full bg-muted" aria-label="Open menu">
              <MenuIcon className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Promo banner: only rendered if an active promo_banners row
          exists (RLS already filters to active+in-range). ── */}
      {promoBanner && (
        <div className="cafe-gradient flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-center text-xs font-bold text-primary-foreground sm:text-sm">
          <span>{promoBanner.title}</span>
          {promoBanner.message && <span className="font-normal opacity-90">{promoBanner.message}</span>}
          {promoBanner.cta_label && promoBanner.cta_link && (
            <a href={promoBanner.cta_link} target="_blank" rel="noreferrer" className="underline underline-offset-2">{promoBanner.cta_label}</a>
          )}
        </div>
      )}

      {/* ── Nav drawer (all widths now — the header's desktop link row was
          removed, so this is the only way to reach every section) ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] flex">
          <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/60" />
          <aside className="relative ml-auto flex h-full w-[min(86vw,360px)] flex-col bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <img src={cafeLogo} alt="" className="size-10 rounded-full border border-border bg-white object-contain p-1" />
                <p className="font-display text-lg font-bold">Cafe Aadvikam</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="grid size-9 place-items-center rounded-full bg-muted" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <nav className="mt-5 flex flex-col gap-1">
              {NAV_ITEMS.map(([label, href]) => (
                <button key={label} onClick={() => { setMobileOpen(false); setTimeout(() => scrollToId(href), 100); }} className="rounded-xl px-4 py-3 text-left text-base font-bold text-foreground active:bg-muted">
                  {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button onClick={() => { setMobileOpen(false); goOrder(); }} className="w-full rounded-2xl cafe-gradient px-4 py-3.5 text-sm font-bold text-primary-foreground">Order Now</button>
              <a href={waQuickUrl} target="_blank" rel="noreferrer" onClick={() => setMobileOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-white">
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
              <button onClick={() => { setMobileOpen(false); navigate('/login'); }} className="w-full rounded-2xl border border-border px-4 py-3.5 text-sm font-bold text-foreground">Login</button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Hero: one unified brand hero (brief section 3), not per-venue.
          Uses the real party-hall/building photo — the only shot that shows
          both the Cafe Aadvikam and SNB branding together. ── */}
      <section id="top" className="relative flex min-h-[92vh] items-end overflow-hidden">
        <div className="absolute inset-0 overflow-hidden bg-muted">
          <div className="h-[calc(100%+140px)] w-full" style={{ transform: `translateY(${-heroParallax}px)` }}>
            <img src={cafePartyHallExterior} alt="" className="hero-zoom h-full w-full object-cover" />
          </div>
        </div>
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
          <div className="mx-auto max-w-7xl text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="size-3.5 animate-float" /> Fresh, from scratch, every single day
            </div>
            <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.98] tracking-tight md:text-7xl lg:text-8xl">Good Food. Great Celebrations. A Legacy of Taste.</h1>
            <p className="mt-6 max-w-xl text-lg text-white/80 md:text-xl">From memorable celebrations and catering to handcrafted cakes, traditional sweets and beloved bakery favourites — Cafe Aadvikam brings food, family and tradition together.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button onClick={() => scrollToId('#cafe-section')} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-stone-950 shadow-2xl shadow-black/30 transition hover:scale-[1.03] active:scale-95">
                Explore Cafe & Events
              </button>
              <button onClick={() => scrollToId('#bakery-section')} className="rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:scale-[1.03] active:scale-95">
                Shop Bakery & Foods
              </button>
            </div>
            {/* Quick CTAs (brief section 3) */}
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
              <button onClick={goOrder} className="rounded-full border border-white/30 px-5 py-2.5 text-white/85 transition hover:border-white/60 hover:text-white">Order Now</button>
              <button onClick={() => scrollToId('#occasion')} className="rounded-full border border-white/30 px-5 py-2.5 text-white/85 transition hover:border-white/60 hover:text-white">Book Party Hall</button>
              <button onClick={() => scrollToId('#cakes')} className="rounded-full border border-white/30 px-5 py-2.5 text-white/85 transition hover:border-white/60 hover:text-white">Order Cakes</button>
              <a href={cateringWaUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/30 px-5 py-2.5 text-white/85 transition hover:border-white/60 hover:text-white">Catering Enquiry</a>
            </div>
            <div className="mt-12 flex flex-wrap gap-10">
              <div><p className="font-display text-3xl font-bold">35+</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Years serving Berigai</p></div>
              <div><p className="font-display text-3xl font-bold">Est. 1988</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Family-run legacy</p></div>
              <div><p className="font-display text-3xl font-bold">7am–10pm</p><p className="mt-1 text-xs uppercase tracking-wide text-white/60">Open every day</p></div>
            </div>
          </div>
        </div>
        <button
          onClick={() => scrollToId('#heritage')}
          aria-label="Scroll to explore"
          className="scroll-hint absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/70 md:flex"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Scroll</span>
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/35 p-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
          </span>
        </button>
      </section>

      {/* ── Split choice (brief section 1): "elegant split experience" ── */}
      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-10 max-w-xl text-center">
            <h2 className="font-display text-2xl font-bold md:text-3xl">Two divisions, one family kitchen</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2">
            <Reveal className="group relative overflow-hidden rounded-[28px]">
              <img src={cafeInterior} alt="Cafe & Events" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <h3 className="font-display text-2xl font-bold text-white">Cafe & Events</h3>
                <p className="mt-2 text-sm text-white/80">Restaurant dining, party hall, wedding & birthday catering, corporate events, bulk orders.</p>
                <button onClick={() => scrollToId('#cafe-section')} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-stone-950">
                  Explore Cafe & Events <ArrowRight className="size-3.5" />
                </button>
              </div>
            </Reveal>
            <Reveal delay={100} className="group relative overflow-hidden rounded-[28px]">
              <img src={bakeryCakeCounter} alt="Bakery & Foods" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <h3 className="font-display text-2xl font-bold text-white">Bakery & Foods</h3>
                <p className="mt-2 text-sm text-white/80">Custom cakes, ghee sweets, pickles, cold-pressed oils, traditional food products.</p>
                <button onClick={() => scrollToId('#bakery-section')} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-stone-950">
                  Shop Bakery & Foods <ArrowRight className="size-3.5" />
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Heritage / About (brief sections 8 & 21) — a richer multi-part
          treatment (hero image + 4 facets) instead of one short paragraph.
          Every fact here is already established elsewhere on this page
          (1988 founding, pure-veg kitchen, party hall, pan-India delivery)
          — nothing new is claimed, just organised by topic. ── */}
      <section id="heritage" className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Since 1988</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Years of Taste. Generations of Trust.</h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">Cafe Aadvikam is built around a simple belief: great food becomes part of people's memories. It started in 1988 as a single breakfast counter on the Hosur Main Road, and the same family, same kitchen discipline now runs a full-service cafe, a working bakery under the Sri Nanjundeshwara Bakery & Sweets name, and a big party hall with ample parking.</p>
          </Reveal>
        </div>
        <Reveal delay={100} className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[32px] px-4 md:px-8">
          <img src={cafeInteriorMural} alt="" className="aspect-[16/7] w-full rounded-[28px] object-cover" />
        </Reveal>
        <div className="mx-auto mt-10 grid max-w-5xl gap-5 px-4 sm:grid-cols-2 md:px-8">
          <Reveal className="rounded-2xl border border-border bg-card p-6">
            <Leaf className="mb-3 size-6 text-primary" />
            <h3 className="font-display text-lg font-bold">Food philosophy</h3>
            <p className="mt-2 text-sm text-muted-foreground">Cooked fresh in a pure-vegetarian kitchen, every single day — nothing frozen, nothing rushed.</p>
          </Reveal>
          <Reveal delay={100} className="rounded-2xl border border-border bg-card p-6">
            <Cake className="mb-3 size-6 text-primary" />
            <h3 className="font-display text-lg font-bold">Bakery story</h3>
            <p className="mt-2 text-sm text-muted-foreground">Sri Nanjundeshwara Bakery & Sweets grew out of the same 1988 kitchen — every cake decorated to order, every loaf baked in small daily batches.</p>
          </Reveal>
          <Reveal delay={150} className="rounded-2xl border border-border bg-card p-6">
            <PartyPopper className="mb-3 size-6 text-primary" />
            <h3 className="font-display text-lg font-bold">Catering story</h3>
            <p className="mt-2 text-sm text-muted-foreground">From a big in-house party hall to outside catering across Hosur and into Bangalore, for weddings, corporate events, and family celebrations — decor and full event service included.</p>
          </Reveal>
          <Reveal delay={200} className="rounded-2xl border border-border bg-card p-6">
            <Truck className="mb-3 size-6 text-primary" />
            <h3 className="font-display text-lg font-bold">Now delivering pan-India</h3>
            <p className="mt-2 text-sm text-muted-foreground">Our bakery and traditional food products now deliver pan-India, so families anywhere in the country can order the same taste.</p>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════ CAFE & EVENTS ══════════════════════ */}
      <div id="cafe-section">
        <VenueIntro id="cafe-intro" title={CONTENT.cafe.sectionTitle} lede={CONTENT.cafe.sectionLede} />

        {/* Occasion cards (brief section 5) — image + short description +
            its own enquiry CTA per card, not just an image and a title. */}
        <section className="bg-card py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {OCCASION_CARDS.map(({ icon: Icon, title, copy, image }) => (
                <div key={title} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
                      <Icon className="size-4 shrink-0 text-amber-300" />
                      <h3 className="text-sm font-bold text-white">{title}</h3>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{copy}</p>
                    <a
                      href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent(`Hi Cafe Aadvikam, I would like to enquire about catering/booking for ${title.toLowerCase()}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      Enquire for {title.toLowerCase()} <ArrowRight className="size-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <TrustStripSection items={TRUST_STRIP.cafe} />
        <HighlightsSection c={CONTENT.cafe} />
        <AboutSection c={CONTENT.cafe} tags={['South Indian Meal', 'North Indian Meal', 'South Breakfast']} />
        <GallerySection id="cafe-gallery" c={CONTENT.cafe} onOpen={(i) => setLightbox({ v: 'cafe', index: i })} />
        <StorySection id="cafe-story" c={CONTENT.cafe} />
        <ReviewsSection c={CONTENT.cafe} reviews={cafeReviews} />

        {/* ── Party hall & catering, with real booking form ── */}
        <section id="occasion" className="py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <div
              className="overflow-hidden rounded-[32px] p-8 text-white md:p-14"
              style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}
            >
              <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <Reveal>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{CONTENT.cafe.occasionEyebrow}</p>
                  <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Your Celebration. Our Space. Your Memories.</h2>
                  <p className="mt-2 font-display text-lg font-semibold text-amber-100/90">{CONTENT.cafe.occasionTitle}</p>
                  <p className="mt-4 max-w-md text-white/70">{CONTENT.cafe.occasionCopy}</p>

                  <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                    {CONTENT.cafe.occasionFeatures.map(({ icon: Icon, label }) => (
                      <li key={label} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-semibold text-white/85">
                        <Icon className="size-4 shrink-0 text-amber-300" /> {label}
                      </li>
                    ))}
                  </ul>
                </Reveal>

                <Reveal delay={150} className="group overflow-hidden rounded-2xl bg-white/5">
                  <img src={CONTENT.cafe.occasionGallery[0]} alt="Our party hall" loading="lazy" className="h-[320px] w-full object-cover transition duration-500 group-hover:scale-105 md:h-[420px]" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </Reveal>
              </div>

              {/* Real booking form — persists to party_hall_enquiries,
                  alongside (not instead of) the WhatsApp CTA above. */}
              <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
                {hallSubmitted ? (
                  <div className="flex items-center gap-3 text-white">
                    <Check className="size-6 shrink-0 text-emerald-400" />
                    <p className="text-sm">Thanks — we've received your enquiry and will get back to you shortly. Want a faster reply? <a href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I just submitted a party hall enquiry form — following up here.')}`} target="_blank" rel="noreferrer" className="font-bold text-amber-300 underline">WhatsApp us</a>.</p>
                  </div>
                ) : (
                  <form onSubmit={submitHallEnquiry} className="grid gap-4 sm:grid-cols-2">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300 sm:col-span-2">Check availability</p>
                    <input required value={hallForm.name} onChange={(e) => setHallForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none" />
                    <input required value={hallForm.phone} onChange={(e) => setHallForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" type="tel" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none" />
                    <input value={hallForm.eventType} onChange={(e) => setHallForm((f) => ({ ...f, eventType: e.target.value }))} placeholder="Event type (wedding, birthday…)" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none" />
                    <input value={hallForm.eventDate} onChange={(e) => setHallForm((f) => ({ ...f, eventDate: e.target.value }))} type="date" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none [color-scheme:dark]" />
                    <input value={hallForm.guestCount} onChange={(e) => setHallForm((f) => ({ ...f, guestCount: e.target.value }))} placeholder="Expected guests" type="number" min="1" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none" />
                    <input value={hallForm.preferredTime} onChange={(e) => setHallForm((f) => ({ ...f, preferredTime: e.target.value }))} placeholder="Preferred time" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none" />
                    <textarea value={hallForm.requirements} onChange={(e) => setHallForm((f) => ({ ...f, requirements: e.target.value }))} placeholder="Additional requirements" rows={2} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-300 focus:outline-none sm:col-span-2" />
                    {hallError && <p className="text-sm text-red-300 sm:col-span-2">{hallError}</p>}
                    <button type="submit" disabled={hallSubmitting} className="inline-flex w-fit items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold transition hover:scale-[1.03] active:scale-95 disabled:opacity-60 sm:col-span-2">
                      {hallSubmitting ? 'Submitting…' : 'Check availability'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Catering, as its own prominent section (brief section 7) — the
            occasion section above already covers this in prose; this block
            is the exhaustive type list + dedicated CTAs the brief wants
            separately from party hall booking. */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Catering</p>
              <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">We undertake catering orders</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">From weddings and birthday celebrations to family functions, corporate events and special occasions, Cafe Aadvikam undertakes catering orders with a focus on taste, consistency and generous hospitality.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {CATERING_TYPES.map((label) => (
                  <span key={label} className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground">{label}</span>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a href={cateringWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full cafe-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
                  Request Catering
                </a>
                <a href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi Cafe Aadvikam, I would like a catering quote for an event.')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted">
                  Get a Catering Quote
                </a>
                <a href={cateringWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:scale-[1.03] active:scale-95">
                  <MessageCircle className="size-4" /> WhatsApp Catering Team
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Reserve-a-table quick strip, closing out the Cafe & Events block */}
        <div className="bg-card py-10 text-center">
          <a href={cafeReserveWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-bold text-white shadow-2xl transition hover:scale-[1.03] active:scale-95">
            <MessageCircle className="size-4" /> Reserve a Table
          </a>
        </div>
      </div>

      {/* ══════════════════════ BAKERY & FOODS ══════════════════════ */}
      <div id="bakery-section">
        <VenueIntro id="bakery-intro" title={CONTENT.bakery.sectionTitle} lede={CONTENT.bakery.sectionLede} badges={['Baked With Experience', 'Made With Care', 'Loved For The Taste']} />

        {/* Product categories (brief section 11) — icon/text cards; only
            Cakes and Ghee Sweets have real product photography on this page
            (their own sections below), so this stays text-forward rather
            than inventing photos for Breads/Puffs/Cookies/Savouries. */}
        <section className="bg-card py-16">
          <div className="mx-auto max-w-5xl px-4 md:px-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BAKERY_CATEGORIES.map((label) => (
                <div key={label} className="rounded-2xl border border-border bg-background px-4 py-6 text-center text-sm font-bold text-foreground">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <TrustStripSection items={TRUST_STRIP.bakery} />
        <HighlightsSection c={CONTENT.bakery} />
        <AboutSection c={CONTENT.bakery} />
        <GallerySection id="bakery-gallery" c={CONTENT.bakery} onOpen={(i) => setLightbox({ v: 'bakery', index: i })} />
        <StorySection id="bakery-story" c={CONTENT.bakery} />
        <ReviewsSection c={CONTENT.bakery} reviews={bakeryReviews} />

        {/* ── Cake gallery ── */}
        <section id="cakes" className="bg-card py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <Reveal className="mx-auto mb-10 max-w-xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Cake gallery</p>
              <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Your dream cake, made your way</h2>
              <p className="mt-4 text-muted-foreground">Custom designs created to match your vision — tell us the flavour, size, and design, and we'll create it for your celebration.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {CAKE_MESSAGING.map((m) => (
                  <span key={m} className="rounded-full bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground">{m}</span>
                ))}
              </div>
            </Reveal>
            {cakeCategories.length > 2 && (
              <div className="mb-8 flex flex-wrap justify-center gap-2">
                {cakeCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCakeCategory(cat)}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition',
                      cakeCategory === cat ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            {/* Horizontal swipe on mobile (brief: "Cake gallery should swipe
                horizontally"), a normal grid from sm up. */}
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
              {displayedCakeImages.map((item, i) => (
                <button
                  key={item.id ?? i}
                  type="button"
                  onClick={() => setCakeLightbox(i)}
                  aria-label={`View larger: ${item.caption ?? 'cake design'}`}
                  className="group w-[72%] shrink-0 snap-center cursor-zoom-in overflow-hidden rounded-2xl bg-muted text-left sm:w-auto sm:shrink"
                >
                  <img
                    src={item.image_url}
                    alt={item.caption ?? 'Custom cake design'}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a href={bakeryOrderWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full cafe-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
                <Cake className="size-4" /> Order a similar cake
              </a>
              <a
                href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi, I would like to request a custom cake design.')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
              >
                Request a custom design <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </section>

        {/* ── Ghee sweets ── */}
        {/* Hosur cake delivery banner (brief section 14) — real facts only:
            no invented lead-time number or delivery radius beyond what's
            already established elsewhere on this page. */}
        <section className="overflow-hidden" style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}>
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 text-white md:grid-cols-2 md:items-center md:px-8">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Cake delivery</p>
              <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Beautiful Cakes. Delivered Across Hosur.</h2>
              <p className="mt-4 text-white/70">Order your celebration cake from Sri Nanjundeshwara Bakery &amp; Sweets and get it delivered across Hosur and surrounding areas, subject to delivery availability.</p>
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-amber-300">Delivery area</dt>
                  <dd className="mt-1 text-white/80">Hosur &amp; surrounding areas</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-amber-300">Available hours</dt>
                  <dd className="mt-1 text-white/80">7 AM – 10 PM, every day</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-amber-300">Pre-ordering</dt>
                  <dd className="mt-1 text-white/80">Recommended for custom designs</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-amber-300">Custom lead time</dt>
                  <dd className="mt-1 text-white/80">WhatsApp us your date to confirm</dd>
                </div>
              </dl>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={bakeryOrderWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold transition hover:scale-[1.03] active:scale-95">
                  <Cake className="size-4" /> Order a Cake
                </a>
                <a href={`https://wa.me/${CAFE_INFO.whatsapp}?text=${encodeURIComponent('Hi, I would like to order a cake for delivery.')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:border-white/60">
                  <MessageCircle className="size-4" /> WhatsApp Cake Order
                </a>
              </div>
            </Reveal>
            <Reveal delay={100} className="overflow-hidden rounded-3xl">
              <img src={snbGiftBoxGreen} alt="Celebration gift box, ready for delivery" className="aspect-[4/3] w-full object-cover" />
            </Reveal>
          </div>
        </section>

        <section id="ghee-sweets" className="py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2 md:items-center md:px-8">
            <Reveal className="overflow-hidden rounded-3xl bg-muted">
              <img src={snbGiftBoxBlue} alt="Traditional ghee sweets, gift-boxed" loading="lazy" className="aspect-[4/3] w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
            </Reveal>
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Traditional ghee sweets</p>
              <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">The rich taste of traditional ghee sweets</h2>
              <p className="mt-4 text-muted-foreground">Our ghee sweets are prepared for celebrations, gifting, and those moments when only something truly special will do — made the traditional way, by hand.</p>
              <button
                onClick={goOrder}
                className="mt-6 inline-flex items-center gap-2 rounded-full cafe-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95"
              >
                <ArrowRight className="size-4" /> Shop ghee sweets
              </button>
            </Reveal>
          </div>
        </section>

        {/* ── Pickles & cold-pressed oils ── */}
        <section id="pickles-oils" className="bg-card py-20">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Traditional flavours for every home</p>
              <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Pickles & cold-pressed oils</h2>
              <p className="mt-4 text-muted-foreground">Bring the taste of traditional food products from Cafe Aadvikam to your home.</p>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {['Pickles', 'Cold-Pressed Oils', 'Ghee Sweets', 'Traditional Specialities'].map((label) => (
                  <div key={label} className="rounded-2xl border border-border bg-background px-4 py-6 text-sm font-bold text-foreground">
                    {label}
                  </div>
                ))}
              </div>
              <button
                onClick={goOrder}
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
              >
                Explore products <ArrowRight className="size-4" />
              </button>
            </Reveal>
          </div>
        </section>

      </div>

      {/* ── Why Aadvikam (brief section 18, shared pillars) ── */}
      {/* ── Follow us (brief section 20) — honestly framed: these are the
          real business photos already used elsewhere on this page, not a
          live-pulled Instagram embed (no API access was available, only the
          handle, confirmed live and matching this business). ── */}
      <section className="bg-card py-16">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">@cafe_aadvikam</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Celebrations made sweeter</h2>
            <p className="mt-3 text-sm text-muted-foreground">Birthday cakes, weddings, family celebrations and bakery favourites — follow along on Instagram.</p>
          </Reveal>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-full cafe-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-teal transition hover:scale-[1.03] active:scale-95">
            <Instagram className="size-4" /> Follow Us
          </a>
        </div>
      </section>

      <section id="why-us" className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal className="mx-auto mb-12 max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Why Aadvikam</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">Why customers choose us</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_AADVIKAM.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-3 grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="size-5" /></div>
                <h3 className="text-base font-bold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA (brief section 32) ── */}
      <section className="py-20" style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}>
        <div className="mx-auto max-w-3xl px-4 text-center text-white md:px-8">
          <Reveal>
            <h2 className="font-display text-3xl font-bold md:text-4xl">Whatever The Occasion, Let Us Take Care Of The Taste.</h2>
            <p className="mt-4 text-white/70">Planning a celebration, ordering a cake, looking for bakery favourites, or arranging catering for a special occasion? Cafe Aadvikam is ready.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={goOrder} className="rounded-full gold-gradient px-6 py-3 text-sm font-bold text-stone-950 shadow-gold transition hover:scale-[1.03] active:scale-95">Order Now</button>
              <button onClick={() => scrollToId('#occasion')} className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:border-white/60">Book Party Hall</button>
              <a href={cateringWaUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:border-white/60">Catering Enquiry</a>
              <button onClick={() => scrollToId('#cakes')} className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:border-white/60">Order Custom Cake</button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQs (brief section 27) — same content as index.html's FAQPage
          JSON-LD, shown visibly here too, not just to crawlers. ── */}
      <section id="faqs" className="bg-card py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-8">
          <Reveal className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl">Frequently asked questions</h2>
          </Reveal>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <Reveal key={q} className="rounded-2xl border border-border bg-background p-6">
                <h3 className="font-display text-lg font-bold text-foreground">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Visit us ── */}
      <section id="visit" className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal
            className="grid gap-8 rounded-[32px] p-8 text-white md:grid-cols-3 md:p-14"
            style={{ background: 'linear-gradient(160deg, #1a0d05 0%, #2d1a08 50%, #1a0d05 100%)' }}
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
              Order Now <ArrowRight className="size-4" />
            </button>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-foreground transition hover:bg-muted">
              Get directions <Navigation className="size-4" />
            </a>
            <a href={waQuickUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-bold text-white transition hover:scale-[1.03] active:scale-95">
              WhatsApp us <MessageCircle className="size-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer (brief section 23: 4-column structure) ── */}
      <footer className="border-t border-border py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="flex items-center justify-center gap-3">
            <img src={cafeLogo} alt="Cafe Aadvikam" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
            <img src={snbLogo} alt="Sri Nanjundeshwara Bakery & Sweets" className="size-9 rounded-full border border-border bg-white object-contain p-1" />
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Follow us on Instagram" className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary/50 hover:text-primary">
              <Instagram className="size-4" />
            </a>
          </div>
          <div className="mt-10 grid gap-8 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Cafe & Events</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollToId('#cafe-section')} className="hover:text-primary">Restaurant</button></li>
                <li><button onClick={() => scrollToId('#occasion')} className="hover:text-primary">Party Hall</button></li>
                <li><button onClick={() => scrollToId('#occasion')} className="hover:text-primary">Catering</button></li>
                <li><button onClick={() => scrollToId('#occasion')} className="hover:text-primary">Functions</button></li>
                <li><a href={cateringWaUrl} target="_blank" rel="noreferrer" className="hover:text-primary">Bulk Orders</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Bakery & Foods</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollToId('#bakery-section')} className="hover:text-primary">Bakery</button></li>
                <li><button onClick={() => scrollToId('#cakes')} className="hover:text-primary">Cakes</button></li>
                <li><button onClick={() => scrollToId('#ghee-sweets')} className="hover:text-primary">Ghee Sweets</button></li>
                <li><button onClick={() => scrollToId('#pickles-oils')} className="hover:text-primary">Pickles & Oils</button></li>
                <li><button onClick={goOrder} className="hover:text-primary">Order Online</button></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Company</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollToId('#heritage')} className="hover:text-primary">About</button></li>
                <li><button onClick={() => scrollToId('#heritage')} className="hover:text-primary">Our Heritage</button></li>
                <li><button onClick={() => scrollToId('#visit')} className="hover:text-primary">Contact</button></li>
                <li><button onClick={() => scrollToId('#faqs')} className="hover:text-primary">FAQs</button></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Support</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => scrollToId('#bakery-section')} className="hover:text-primary">Delivery</button></li>
                <li><button onClick={goOrder} className="hover:text-primary">Order Help</button></li>
                <li><a href={cateringWaUrl} target="_blank" rel="noreferrer" className="hover:text-primary">Catering Enquiry</a></li>
                <li><button onClick={() => scrollToId('#cakes')} className="hover:text-primary">Cake Enquiry</button></li>
              </ul>
            </div>
          </div>
          <p className="mt-12 text-center font-display text-lg font-bold text-foreground">Cafe Aadvikam — Bringing Taste, Tradition & Celebrations Together.</p>
          <p className="mt-2 text-center text-xs text-muted-foreground">&copy; Cafe Aadvikam · Sri Nanjundeshwara Bakery & Sweets · {CAFE_INFO.address}</p>
        </div>
      </footer>

      {/* ── Gallery lightbox (Apple Photos-style viewer, no library) ── */}
      {lightbox && (() => {
        const gallery = CONTENT[lightbox.v].gallery;
        const item = gallery[lightbox.index];
        return (
          <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Photo viewer">
            <div className="flex items-center justify-between text-white/80">
              <p className="text-xs font-semibold uppercase tracking-wide">{lightbox.index + 1} / {gallery.length}</p>
              <button onClick={() => setLightbox(null)} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
              <button
                onClick={() => setLightbox((l) => (l ? { ...l, index: (l.index - 1 + gallery.length) % gallery.length } : l))}
                aria-label="Previous photo"
                className="absolute left-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
              >
                <ArrowRight className="size-6 rotate-180" />
              </button>
              <img key={lightbox.index} src={item.image} alt={item.caption} className="lightbox-in max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl" />
              <button
                onClick={() => setLightbox((l) => (l ? { ...l, index: (l.index + 1) % gallery.length } : l))}
                aria-label="Next photo"
                className="absolute right-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
              >
                <ArrowRight className="size-6" />
              </button>
            </div>
            <p className="pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm font-semibold text-white/85">{item.caption}</p>
          </div>
        );
      })()}

      {/* ── Cake gallery lightbox — same large-preview pattern as the photo
          gallery above, wired to cakeLightbox/displayedCakeImages. ── */}
      {cakeLightbox !== null && displayedCakeImages[cakeLightbox] && (() => {
        const item = displayedCakeImages[cakeLightbox];
        const len = displayedCakeImages.length;
        return (
          <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Cake design viewer">
            <div className="flex items-center justify-between text-white/80">
              <p className="text-xs font-semibold uppercase tracking-wide">{cakeLightbox + 1} / {len}</p>
              <button onClick={() => setCakeLightbox(null)} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
              <button
                onClick={() => setCakeLightbox((i) => (i === null ? i : (i - 1 + len) % len))}
                aria-label="Previous cake"
                className="absolute left-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
              >
                <ArrowRight className="size-6 rotate-180" />
              </button>
              <img key={cakeLightbox} src={item.image_url} alt={item.caption ?? 'Custom cake design'} className="lightbox-in max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl" />
              <button
                onClick={() => setCakeLightbox((i) => (i === null ? i : (i + 1) % len))}
                aria-label="Next cake"
                className="absolute right-0 z-10 grid h-full w-14 place-items-center text-white/60 transition hover:text-white md:w-20"
              >
                <ArrowRight className="size-6" />
              </button>
            </div>
            {item.caption && <p className="pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm font-semibold text-white/85">{item.caption}</p>}
            <div className="flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
              <a href={bakeryOrderWaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-xs font-bold text-white">
                <MessageCircle className="size-3.5" /> Order a similar cake
              </a>
            </div>
          </div>
        );
      })()}

      {/* ── Mobile sticky bottom action bar (brief section 4/26): the exact
          5 items the brief specifies — ORDER / CAKES / CATERING / CALL /
          WHATSAPP. ChatBot's own floating button/panel offsets clear this
          height on mobile via the --chat-extra var (see ChatBot.tsx). ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Quick actions">
        <button onClick={goOrder} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-foreground">
          <ShieldCheck className="size-5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Order</span>
        </button>
        <button onClick={() => scrollToId('#cakes')} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-foreground">
          <Cake className="size-5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Cakes</span>
        </button>
        <button onClick={() => scrollToId('#occasion')} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-foreground">
          <PartyPopper className="size-5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Catering</span>
        </button>
        <a href={`tel:${CAFE_INFO.phone}`} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-foreground">
          <Phone className="size-5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Call</span>
        </a>
        <a href={waQuickUrl} target="_blank" rel="noreferrer" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-foreground">
          <MessageCircle className="size-5 text-[#25D366]" />
          <span className="text-[9px] font-bold uppercase tracking-wide">WhatsApp</span>
        </a>
      </nav>

      <ChatBot />
    </main>
  );
}
