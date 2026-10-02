import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Cake,
  Camera,
  Clock,
  Heart,
  Instagram,
  Leaf,
  MapPin,
  Menu,
  Phone,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getRoleDefaultPath } from "@/lib/routing";
import { CAFE_INFO, mapsUrl, mapsEmbedUrl } from "@/constants/cafeInfo";
import { LeadEnquiry as Enquire } from "@/components/features/LeadEnquiry";
import cafeLogo from "@/assets/cafe-logo.png";
import corporateImage from "@/assets/real/occasion-corporate-events.jpg";
import {
  useLandingContent,
  PromoBanners,
  CakeGallery,
} from "@/components/features/LandingContent";
import ChatBot from "@/components/features/ChatBot";
import "@/styles/heritage.css";

const PHOTO = "/images/heritage/";
const hero = `${PHOTO}cafe-hero-clean.png`;
const instagram = "https://www.instagram.com/cafe_aadvikam/";
const NAV = [
  ["Our story", "#heritage"],
  ["Cafe & Events", "#cafe-section"],
  ["Bakery & Foods", "#bakery-section"],
  ["Custom cakes", "#cakes"],
  ["Catering", "#catering"],
  ["Party hall", "#occasion"],
  ["Visit us", "#visit"],
];
const SWEETS = [
  {
    name: "Special sweets",
    image: "special-sweets.jpeg",
    description: "A little something extraordinary.",
  },
  {
    name: "Cashew sweets",
    image: "cashew-sweets.jpeg",
    description: "Rich, delicate, and made to share.",
  },
  {
    name: "Regular sweets",
    image: "regular-sweets.jpeg",
    description: "The classics that feel like home.",
  },
];
const OCCASIONS = [
  {
    title: "Weddings",
    image: `${PHOTO}wedding.jpg`,
    alt: "A traditional wedding mandap decorated with flowers",
    copy: "A beautiful beginning, a generous feast, and every detail cared for.",
    message:
      "Hi Cafe Aadvikam, I would like to plan a wedding. Please share details about the party hall, wedding catering, decor and event services.",
  },
  {
    title: "Birthdays",
    image: `${PHOTO}birthday.jpg`,
    alt: "A birthday celebration with balloons and a decorated cake table",
    copy: "From the very first candle to the biggest milestones. Make a wish.",
    message:
      "Hi Cafe Aadvikam, I would like to plan a birthday party with food, decor and a custom cake. Please help me with the arrangements.",
  },
  {
    title: "Family functions",
    image: `${PHOTO}family.jpg`,
    alt: "Family and friends sharing a meal together outdoors",
    copy: "Bring everyone together. We will take care of the food and the details.",
    message:
      "Hi Cafe Aadvikam, I am planning a family function. Please share options for the hall, catering, decorations and service.",
  },
  {
    title: "Corporate events",
    image: corporateImage,
    alt: "Tables arranged for a corporate gathering",
    copy: "Good food and thoughtful service for the people you work with.",
    message:
      "Hi Cafe Aadvikam, I would like to arrange catering and event services for a corporate gathering. Please share the available options.",
  },
];
const FAQS = [
  [
    "Is Cafe Aadvikam pure vegetarian?",
    "Yes, Cafe Aadvikam is a pure vegetarian restaurant serving South Indian, North Indian and Chinese dishes.",
  ],
  [
    "What are Cafe Aadvikam's opening hours?",
    "Cafe Aadvikam is open 7 AM to 10 PM, every day of the week.",
  ],
  [
    "Does Cafe Aadvikam have a party hall for events?",
    "Yes. Our big party hall can welcome large gatherings, with plenty of parking, catering, decor and complete event service. We also undertake outside catering for weddings, corporate events and family functions across Hosur and into Bangalore.",
  ],
  [
    "Can I order a custom cake from Sri Nanjundeshwara Bakery & Sweets?",
    "Yes. Tell us your flavour, size, design and celebration date. We make your cake to order and offer delivery across Hosur and surrounding areas, subject to availability.",
  ],
  [
    "Does Sri Nanjundeshwara Bakery & Sweets deliver pan-India?",
    "Yes. Our vision of Pan-India delivery is now a reality. We officially deliver our products across India. Browse the Order Now page for sweets, savouries, pickles, oils and more.",
  ],
];
export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { reviews, cakes, promos } = useLandingContent();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    if (currentUser)
      navigate(getRoleDefaultPath(currentUser.role), { replace: true });
  }, [currentUser, navigate]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key !== "Tab") return;
      const elements =
        menuRef.current?.querySelectorAll<HTMLElement>("a,button");
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);
  if (currentUser) return null;
  return (
    <main className="heritage" id="top">
      <header className="h-nav">
        <div className="h-wrap h-nav-inner">
          <a href="#top" className="h-brand" aria-label="Cafe Aadvikam home">
            <img src={cafeLogo} alt="" />
            <span>
              <strong>Cafe Aadvikam</strong>
              <small>A family tradition · Since 1988</small>
            </span>
          </a>
          <nav className="h-desktop-nav" aria-label="Main navigation">
            <a href="#heritage">Our story</a>
            <a href="#cafe-section">Cafe & Events</a>
            <a href="#bakery-section">Bakery & Foods</a>
            <a href="#visit">Visit us</a>
          </nav>
          <button
            ref={menuButtonRef}
            className="h-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="heritage-menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      {menuOpen && (
        <div className="h-drawer" onClick={() => setMenuOpen(false)}>
          <div
            id="heritage-menu"
            ref={menuRef}
            className="h-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-drawer-top">
              <h3>Come, explore.</h3>
              <button
                className="h-menu-button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <nav>
              {NAV.map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                  {label}
                </a>
              ))}
              <Link to="/order">Order now</Link>
              <Link to="/order/track">Track your order</Link>
              <Link to="/login">Staff login</Link>
            </nav>
          </div>
        </div>
      )}
      <section className="h-hero" aria-labelledby="hero-title">
        <div className="h-hero-copy">
          <p className="h-eyebrow">Berigai · Hosur · Since 1988</p>
          <h1 id="hero-title">
            Some stories
            <br />
            are told
            <br />
            <em>through taste.</em>
          </h1>
          <p className="h-copy">
            Ours began with a family, a love for good food, and a promise to
            make every bite with care. Today, that tradition lives on at Cafe
            Aadvikam and Sri Nanjundeshwara Bakery & Sweets.
          </p>
          <p className="h-copy">
            From everyday favourites to your most treasured celebrations, there
            is a little of our story in everything we serve.
          </p>
          <a href="#heritage" className="h-scroll">
            <ArrowDown aria-hidden="true" /> Scroll to discover our story
          </a>
        </div>
        <figure className="h-hero-picture">
          <img
            src={hero}
            alt="Cafe Aadvikam and SNB Bakery with the upstairs party hall and outdoor seating"
            fetchPriority="high"
          />
          <figcaption>Good food. Warm welcomes. Lasting memories.</figcaption>
        </figure>
      </section>
      <div className="h-ribbon">
        <span>A legacy since 1988</span>
        <b>✦</b>
        <span>Now delivering Pan-India</span>
        <b>✦</b>
        <span>Made with care, shared with love</span>
      </div>
      <PromoBanners promos={promos} venue="both" />

      <section id="heritage" className="h-section">
        <div className="h-wrap h-story">
          <div>
            <p className="h-eyebrow">01 / Where it all began</p>
            <h2>
              Good taste.
              <br />
              <em>Even better memories.</em>
            </h2>
            <div className="h-story-year">1988</div>
            <p className="h-eyebrow">The beginning of our family legacy</p>
          </div>
          <div className="h-story-right">
            <p>
              Every familiar flavour carries a memory. A box of sweets taken
              home. A birthday cake everyone remembers. A meal that brings the
              family back to the same table.
            </p>
            <p>
              Since 1988, Sri Nanjundeshwara Bakery & Sweets has grown with
              those moments. Our name travelled from one happy customer to
              another, carried by positive word of mouth and the taste people
              wanted to share.
            </p>
            <p>
              Today, we are grateful to serve many regular customers across{" "}
              <strong>Bangalore, Hosur and Attibele</strong>. Their trust is the
              reason we are here. And it is the reason we continue to choose
              quality ingredients and care in everything we make.
            </p>
            <div className="h-locations">
              <span>Rooted in Berigai</span>
              <span>Loved across Hosur</span>
              <span>Shared beyond</span>
            </div>
          </div>
        </div>
      </section>

      <section id="sweet-collection" className="h-section h-sweets">
        <div className="h-wrap">
          <div className="h-section-top">
            <div>
              <p className="h-eyebrow">A taste of our tradition</p>
              <h2>
                Happiness comes
                <br />
                <em>beautifully boxed.</em>
              </h2>
            </div>
            <p className="h-copy">
              For a familiar craving, a thoughtful gift, or a reason to bring
              everyone together. Discover the sweets that keep our story going.
            </p>
          </div>
          <div className="h-grid-three">
            {SWEETS.map((sweet, index) => (
              <article key={sweet.name}>
                <img
                  className="h-sweet-image"
                  src={`${PHOTO}${sweet.image}`}
                  alt={`An assortment of SNB ${sweet.name.toLowerCase()}`}
                  loading="lazy"
                />
                <div className="h-product-caption">
                  <div>
                    <h3>{sweet.name}</h3>
                    <p>{sweet.description}</p>
                  </div>
                  <span>0{index + 1}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="h-collection-bottom">
            <p>
              From our kitchen to your doorstep. Now delivering across India.
            </p>
            <Link className="h-button" to="/order">
              Order your favourites <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <PromoBanners promos={promos} venue="cafe" />
      <section id="cafe-section" className="h-section">
        <div className="h-wrap">
          <div className="h-cafe-intro">
            <div>
              <p className="h-eyebrow">02 / A table for every day</p>
              <h2>
                Come for the food.
                <br />
                <em>Stay for the feeling.</em>
              </h2>
              <p className="h-copy">
                A leisurely breakfast. A meal with friends. That little break in
                a busy day. Cafe Aadvikam brings fresh vegetarian food and warm
                hospitality to the table.
              </p>
              <p className="h-copy">
                With plenty of parking, a welcoming ambience and lovely spots
                for photographs, there is room to slow down, settle in and make
                a memory.
              </p>
              <div className="h-facts">
                <div>
                  <Leaf />
                  <strong>Fresh daily</strong>
                  <p>Good mornings begin in our kitchen.</p>
                </div>
                <div>
                  <MapPin />
                  <strong>Ample parking</strong>
                  <p>Arrive comfortably. Stay a little longer.</p>
                </div>
                <div>
                  <Camera />
                  <strong>Picture-worthy</strong>
                  <p>A beautiful setting for your memories.</p>
                </div>
              </div>
              <div className="h-actions">
                <Link className="h-link" to="/menu">
                  Explore the cafe menu <ArrowRight />
                </Link>
                <Enquire
                  text
                  topic="Table reservation"
                  message="Hi Cafe Aadvikam, I would like to reserve a table. Please help me with availability for my visit."
                >
                  Reserve a table
                </Enquire>
              </div>
            </div>
            <figure>
              <img
                src={`${PHOTO}fresh-breakfast.jpg`}
                alt="Fresh South Indian dosa with chutneys and filter coffee"
                loading="lazy"
              />
            </figure>
          </div>
          <div className="h-meals">
            <div className="h-section-top">
              <div>
                <p className="h-eyebrow">Signature dishes</p>
                <h2>
                  Familiar flavours.
                  <br />
                  <em>Made with care.</em>
                </h2>
              </div>
            </div>
            <div className="h-grid-three">
              {[
                [
                  "01 / Wholesome & comforting",
                  "South Indian Meal",
                  "A satisfying spread of rice, curries and traditional accompaniments, bringing the comfort of a familiar meal to your table.",
                ],
                [
                  "02 / Rich & full of flavour",
                  "North Indian Meal",
                  "A generous meal of comforting North Indian favourites, thoughtfully prepared for a relaxed lunch or dinner.",
                ],
                [
                  "03 / A delicious beginning",
                  "South Breakfast",
                  "Dosas, soft idlis, crisp vadas and all the accompaniments that make a South Indian morning special.",
                ],
              ].map(([label, title, copy]) => (
                <article className="h-meal" key={title}>
                  <span>{label}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
            <div className="h-daily">
              <strong>A daily favourite for families and workplaces.</strong>
              <p>
                Many customers in and around Hosur order from us every day. We
                also provide daily meals to corporate companies, bringing the
                same care, taste and consistency to busy workplaces.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="occasion" className="h-section h-hall">
        <div className="h-wrap h-hall-grid">
          <figure>
            <img
              className="h-hall-photo"
              src={hero}
              alt="Cafe Aadvikam building with the party hall on the upper floor"
              loading="lazy"
            />
          </figure>
          <div>
            <p className="h-eyebrow">03 / Party hall on-site</p>
            <h2>
              You bring the people.
              <br />
              <em>We bring it together.</em>
            </h2>
            <p className="h-copy">
              Our big party hall welcomes large gatherings, with ample parking
              and a warm setting for weddings, birthdays and family
              celebrations.
            </p>
            <p className="h-copy">
              From the food and decorations to the setup and service, we take
              care of your celebration. Come with your favourite people and
              simply enjoy your day.
            </p>
            <div className="h-hall-features">
              <span>
                <Users />A big, welcoming hall
              </span>
              <span>
                <MapPin />
                Plenty of parking
              </span>
              <span>
                <Sparkles />
                Decor & complete service
              </span>
              <span>
                <Camera />
                Memories worth capturing
              </span>
            </div>
            <div className="h-actions">
              <Enquire
                light
                topic="Party hall availability"
                message="Hi Cafe Aadvikam, I would like to check party hall availability for an event. Please share details about the hall, catering, decorations and full event services."
              >
                Check availability
              </Enquire>
            </div>
          </div>
        </div>
      </section>

      <section className="h-section h-occasions" id="celebrations">
        <div className="h-wrap">
          <div className="h-section-top">
            <div>
              <p className="h-eyebrow">Celebrations made sweeter</p>
              <h2>
                Every occasion.
                <br />
                <em>All our heart.</em>
              </h2>
            </div>
            <p className="h-copy">
              Catering, decor and thoughtful service for every kind of party.
              Your only job? Be in the moment.
            </p>
          </div>
          <div className="h-occasion-grid">
            {OCCASIONS.map((event) => (
              <article className="h-occasion" key={event.title}>
                <img src={event.image} alt={event.alt} loading="lazy" />
                <h3>{event.title}</h3>
                <p>{event.copy}</p>
                <Enquire topic={event.title} text message={event.message}>
                  Plan {event.title.toLowerCase()}
                </Enquire>
              </article>
            ))}
          </div>
          <div className="h-extra-occasions">
            <span>And all the moments in between:</span>
            {[
              "Anniversaries",
              "Engagements",
              "Festivals",
              "Religious functions",
            ].map((event) => (
              <Enquire key={event} topic={event} text>
                {event}
              </Enquire>
            ))}
          </div>
        </div>
      </section>

      <section id="catering" className="h-section h-catering">
        <div className="h-wrap">
          <div>
            <p className="h-eyebrow">Our kitchen. Your occasion.</p>
            <h2>
              We undertake
              <br />
              catering orders.
            </h2>
          </div>
          <div>
            <p>
              At our hall or at a venue of your choice, bring the taste of
              Aadvikam to your gathering. From weddings and family functions to
              office lunches and large celebrations, we take care of the food so
              you can enjoy the company.
            </p>
            <div className="h-catering-types">
              {[
                "Wedding catering",
                "Birthday parties",
                "Corporate meals",
                "Family functions",
                "Bulk orders",
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="h-actions">
              <Enquire
                light
                topic="Catering"
                message="Hi Cafe Aadvikam, I would like a catering quote. Please help me plan the menu and service for my event."
              >
                Plan your catering
              </Enquire>
            </div>
          </div>
        </div>
      </section>

      <PromoBanners promos={promos} venue="bakery" />
      <section id="bakery-section" className="h-section">
        <div className="h-wrap">
          <div className="h-bakery-intro">
            <div>
              <p className="h-eyebrow">04 / A little sweetness to take home</p>
              <h2>
                A bakery legacy.
                <br />
                <em>A taste of home.</em>
              </h2>
              <p className="h-copy">
                Sri Nanjundeshwara Bakery & Sweets has been part of everyday
                treats and once-in-a-lifetime celebrations since 1988. What
                began as a local favourite is now a name shared with love across
                Bangalore, Hosur and Attibele.
              </p>
              <p className="h-copy">
                The secret has always been simple: good taste, quality
                ingredients, and care in everything we make.
              </p>
              <div className="h-actions">
                <Link className="h-button" to="/order">
                  Explore bakery & foods <ArrowRight />
                </Link>
              </div>
            </div>
            <img
              className="h-bakery-photo"
              src={`${PHOTO}cashew-sweets.jpeg`}
              alt="SNB assortment of cashew sweets, ready to share"
              loading="lazy"
            />
          </div>
          <div className="h-counter">
            <p className="h-eyebrow">The counter</p>
            <h3>Little treats. Long-standing favourites.</h3>
            <p>
              Fresh breads and buns, bakery snacks, cookies, celebration cakes
              and traditional sweets. Pick your favourites, bring a box home,
              and make an ordinary day a little more special.
            </p>
            <div className="h-category-list" aria-label="Our product range">
              {[
                "Cakes",
                "Breads",
                "Puffs",
                "Cookies",
                "Savouries",
                "Ghee sweets",
                "Pickles",
                "Cold-pressed oils",
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="h-feature-row">
              {[
                {
                  icon: Cake,
                  title: "Custom cakes",
                  copy: "Your flavour, your design, your special occasion.",
                },
                {
                  icon: Sparkles,
                  title: "Fresh bakes daily",
                  copy: "Breads, buns and bakery favourites, made with care.",
                },
                {
                  icon: Heart,
                  title: "Festival sweets",
                  copy: "Traditional treats to share with the people you love.",
                },
                {
                  icon: Truck,
                  title: "Pickup & delivery",
                  copy: "Take home your favourites or order for delivery.",
                },
              ].map(({ icon: Icon, title, copy }) => (
                <article key={title}>
                  <Icon size={25} />
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="cakes" className="h-section h-cakes">
        <div className="h-wrap">
          <div className="h-cake-grid">
            <div>
              <p className="h-eyebrow">Made for your moment</p>
              <h2>
                Your dream cake,
                <br />
                <em>made your way.</em>
              </h2>
              <p className="h-copy">
                A favourite character, an elegant wedding centrepiece, or a
                simple message from the heart. Tell us what you imagine, and we
                will help make it part of your celebration.
              </p>
              <div className="h-actions">
                <Enquire
                  topic="Custom cake"
                  message="Hi SNB Bakery, I would like to request a custom cake design. I will share my inspiration, preferred flavour, size and celebration date."
                >
                  Create your dream cake
                </Enquire>
              </div>
            </div>
            <div className="h-cake-steps">
              {[
                [
                  "01",
                  "Share your inspiration",
                  "A theme, a colour, a photograph or an idea. Your cake starts with you.",
                ],
                [
                  "02",
                  "Make it yours",
                  "Choose your flavour, size and personal message with our cake team.",
                ],
                [
                  "03",
                  "Let the celebration begin",
                  "Confirm your date and arrange pickup or local delivery.",
                ],
              ].map(([n, title, copy]) => (
                <div className="h-cake-step" key={n}>
                  <span>{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <CakeGallery photos={cakes} />
          <div className="h-cake-delivery">
            <Truck />
            <div>
              <h3>Beautiful cakes, delivered across Hosur.</h3>
              <p>
                Delivery in Hosur and surrounding areas, subject to
                availability. Share your date and address with us.
              </p>
            </div>
            <Enquire
              text
              topic="Cake delivery"
              message="Hi SNB Bakery, I would like to order a cake for delivery in Hosur or the surrounding area. Please confirm delivery for my address and celebration date."
            >
              Arrange cake delivery
            </Enquire>
          </div>
        </div>
      </section>

      <section className="h-section">
        <div className="h-wrap h-foods">
          <article id="ghee-sweets">
            <p className="h-eyebrow">Traditional ghee sweets</p>
            <h2>
              A rich tradition.
              <br />
              <em>One lovely bite.</em>
            </h2>
            <p className="h-copy">
              For festive gifting, family visits or simply treating yourself,
              our traditional ghee sweets bring familiar flavours and quality
              ingredients together.
            </p>
            <div className="h-actions">
              <Link className="h-button" to="/order">
                Shop ghee sweets <ArrowRight />
              </Link>
            </div>
          </article>
          <article id="pickles-oils">
            <p className="h-eyebrow">From our kitchen to yours</p>
            <h2>
              The everyday
              <br />
              <em>essentials you love.</em>
            </h2>
            <p className="h-copy">
              Discover savouries, traditional pickles and cold-pressed oils
              alongside your favourite sweets. A little more flavour for the
              meals and moments at home.
            </p>
            <div className="h-actions">
              <Link className="h-link" to="/order">
                Explore products <ArrowRight />
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section id="pan-india" className="h-section h-panindia">
        <div className="h-wrap">
          <div className="h-route">
            <span>Berigai</span>
            <i />
            <Truck size={24} />
            <i />
            <span>Across India</span>
          </div>
          <p className="h-eyebrow">05 / Our next chapter is already here</p>
          <h2>
            Once a dream.
            <br />
            <em>Now, at your doorstep.</em>
          </h2>
          <p className="h-copy">
            Our vision was to take the taste of SNB beyond our neighbourhood.
            Today, we have achieved it:{" "}
            <strong>
              we are officially delivering our products Pan-India.
            </strong>
          </p>
          <p className="h-copy">
            From the customers who first shared our name in Hosur to families
            across the country, our story keeps growing. We would love for your
            home to be part of it.
          </p>
          <div className="h-actions">
            <Link className="h-button" to="/order">
              Bring home your favourites <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <section className="h-section" id="our-promise">
        <div className="h-wrap">
          <div className="h-quality">
            <div className="h-quality-seal">
              <ShieldCheck />
              <strong>
                Quality you
                <br />
                can see.
              </strong>
              <small>Our kitchen is open to you</small>
            </div>
            <div>
              <p className="h-eyebrow">The promise behind every bite</p>
              <h2>
                Your trust.
                <br />
                <em>Our most valued ingredient.</em>
              </h2>
              <p className="h-copy">
                Our bakery became known through positive word of mouth.
                Customers across Bangalore, Hosur and Attibele recommend us
                because of the taste we serve and the quality we maintain.
              </p>
              <p className="h-copy">
                We use quality ingredients in our food, sweets and bakery
                products, and take pride in a clean manufacturing space.{" "}
                <strong>
                  Everyone is welcome to visit our manufacturing unit
                </strong>{" "}
                and experience the cleanliness and care that go into what we
                make.
              </p>
              <div className="h-actions">
                <Enquire
                  text
                  topic="Manufacturing unit visit"
                  message="Hi SNB Bakery, I would like to visit your manufacturing unit to see how your products are made. Please help me arrange a visit."
                >
                  Visit our manufacturing unit
                </Enquire>
              </div>
            </div>
          </div>
          {reviews.length > 0 && (
            <div className="h-reviews">
              <div className="h-section-top">
                <div>
                  <p className="h-eyebrow">Words that keep us going</p>
                  <h3>Passed from one happy customer to another.</h3>
                </div>
              </div>
              <div className="h-grid-three">
                {reviews.map((r) => (
                  <figure className="h-review" key={r.id}>
                    {r.rating != null && (
                      <span aria-label={`${r.rating} out of 5 stars`}>
                        {"★".repeat(
                          Math.max(0, Math.min(5, Math.round(r.rating)))
                        )}
                      </span>
                    )}
                    <blockquote>“{r.quote}”</blockquote>
                    <figcaption>
                      <strong>{r.author}</strong>
                      <br />
                      <cite>
                        {r.meta ||
                          (r.venue === "cafe"
                            ? "Cafe Aadvikam guest"
                            : "SNB Bakery customer")}
                      </cite>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="visit" className="h-section h-visit">
        <div className="h-wrap h-visit-grid">
          <div>
            <p className="h-eyebrow">There is always a place for you</p>
            <h2>
              Come make
              <br />a memory with us.
            </h2>
            <p>
              A good meal, a sweet treat, a beautiful celebration.
              <br />
              We would love to welcome you.
            </p>
            <div className="h-contact-list">
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                <MapPin />
                {CAFE_INFO.address}
              </a>
              <span>
                <Clock />
                {CAFE_INFO.hours}
              </span>
              <a href={`tel:${CAFE_INFO.phone.replace(/\s/g, "")}`}>
                <Phone />
                {CAFE_INFO.phone}
              </a>
            </div>
            <div className="h-actions">
              <a
                className="h-button h-button-light"
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Get directions <ArrowRight />
              </a>
              <a
                href={instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Follow Cafe Aadvikam on Instagram"
              >
                <Instagram size={23} />
              </a>
            </div>
          </div>
          <iframe
            title="Find Cafe Aadvikam on the map"
            src={mapsEmbedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
      <section id="faqs" className="h-section">
        <div className="h-wrap">
          <div className="h-faq">
            <p className="h-eyebrow">Before you visit or order</p>
            <h2>A few helpful details.</h2>
            {FAQS.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <footer className="h-footer">
        <div className="h-wrap">
          <div className="h-footer-top">
            <a className="h-brand" href="#top">
              <img src={cafeLogo} alt="" />
              <span>
                <strong>Cafe Aadvikam</strong>
                <small>Taste. Tradition. Togetherness.</small>
              </span>
            </a>
            <nav className="h-footer-links" aria-label="Footer navigation">
              <Link to="/order">Order now</Link>
              <a href="#cakes">Custom cakes</a>
              <a href="#catering">Catering</a>
              <a href="#occasion">Party hall</a>
              <Link to="/order/track">Track order</Link>
            </nav>
          </div>
          <div className="h-footer-bottom">
            <span>
              © {new Date().getFullYear()} Cafe Aadvikam · Sri Nanjundeshwara
              Bakery & Sweets
            </span>
            <span>
              Made with care since 1988. <Link to="/login">Staff login ↗</Link>
            </span>
          </div>
        </div>
      </footer>
      <ChatBot />
    </main>
  );
}
