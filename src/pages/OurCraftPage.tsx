import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Leaf, MapPin, ShieldCheck, Sparkles, Phone, Store } from 'lucide-react';
import snbLogo from '@/assets/snb-logo.png';
import { shopCollectionImage, shopCollections } from '@/lib/shopCollections';
import { CAFE_INFO } from '@/constants/cafeInfo';
import '@/styles/heritage.css';
import '@/styles/our-craft.css';

function CollectionCard({ collection }: { collection: typeof shopCollections[number] }) {
  return <article className="craft-collection" key={collection.id}>
        <Link to={'/order?category=' + collection.id} className="craft-card-image" tabIndex={-1} aria-hidden="true"><img src={shopCollectionImage(collection.id)} alt="" loading="lazy" /><span>{collection.family}</span></Link>
        <div className="craft-card-body"><h3>{collection.title}</h3><p className="craft-card-subtitle">{collection.subtitle}</p><p>{collection.description}</p>
          {'note' in collection && <div className="craft-card-note">{collection.note}</div>}
          {'local' in collection && collection.local && <div className="craft-local"><MapPin size={14} /> Hosur · Within 30 km only</div>}
          <Link to={'/order?category=' + collection.id} className="craft-explore" aria-label={'Explore ' + collection.title}>{collection.id === 'bakery' || collection.id === 'cake' ? 'View' : 'Shop'} {collection.title} <ArrowRight size={18} /></Link>
        </div></article>;
}

export default function OurCraftPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return <main className="heritage craft-page">
    <div className="craft-topline"><strong>No added preservatives <span>·</span> No palm oil <span>·</span> Made with care since 1988</strong></div>
    <header className="h-nav"><div className="h-wrap h-nav-inner">
      <Link to="/" className="h-brand"><img src={snbLogo} alt="SNB" /><span><strong>SNB Sweets & Bakes</strong><small>Good ingredients. Unforgettable taste.</small></span></Link>
      <nav aria-label="Collection navigation"><a href="#bulk-orders" className="craft-nav-link">Bulk orders · Hosur</a><a href="#collections" className="craft-nav-link">The collections</a><Link to="/order" className="craft-shop-link">Shop now <ArrowRight size={16} /></Link></nav>
    </div></header>
    <section className="craft-hero">
      <img className="craft-hero-backdrop" src={shopCollectionImage('burfi')} alt="Illustrative photograph of seed-rich burfi" fetchPriority="high" />
      <div className="h-wrap craft-hero-content"><div className="craft-hero-copy">
        <p className="h-eyebrow">Real ingredients. Remarkable flavour.</p><h1>One bite.<br /><em>A whole lot<br />to love.</em></h1>
        <p className="craft-intro">Seed-filled burfi. Pure-ghee favourites. Handcrafted chocolates and signature savouries. Discover the flavours that make every box worth opening.</p>
        <div className="craft-hero-actions"><a href="#collections" className="craft-primary">Find your favourite <ArrowRight size={18} /></a><Link to="/order" className="craft-hero-secondary">Shop online ↗</Link></div>
        <div className="craft-mini-promise"><span><Check size={16} /> No palm oil</span><span><Check size={16} /> No added preservatives</span><span><Check size={16} /> Pure Nandini ghee</span></div>
      </div><Link to="/order?category=burfi" className="craft-hero-stamp"><span>YOUR NEXT FAVOURITE</span><strong>Dry Seeds<br />Burfi</strong><small>Explore online <ArrowRight size={15} /></small></Link></div>
    </section>
    <section className="h-wrap craft-proof" aria-label="Our quality promises">
      <div><span>01 / OUR NON-NEGOTIABLE</span><h2>No palm oil.<br /><em>No shortcuts.</em></h2><p>We use Sundrop oil in our preparations and pure cold-pressed oil for our banana chips.</p></div>
      <div><Leaf /><h3>Pure Nandini ghee</h3><p>That unmistakable aroma. That rich finish. Only pure Nandini ghee in our ghee preparations.</p></div>
      <div><Sparkles /><h3>Real, first-quality ingredients</h3><p>Whole premium cashews, real dry fruits and carefully chosen seeds. Selected by our dedicated quality team.</p></div>
      <div><ShieldCheck /><h3>Care you can trust</h3><p>Trained preparation and packing teams, head caps, sanitising before entry and no bare-hand contact with products.</p></div>
    </section>
    <section className="h-wrap craft-sweetness" aria-labelledby="sweetness-heading"><div><p className="h-eyebrow">Sweetness with more choice</p><h2 id="sweetness-heading">Skip refined sugar.<br /><em>Keep the joy.</em></h2></div><div><p>Discover selected sweets made without refined sugar. Choose natural jaggery, palm jaggery or varieties sweetened with zero-calorie monk fruit extract.</p><div className="craft-sweetness-tags"><span>Natural jaggery</span><span>Palm jaggery</span><span>Monk fruit extract</span></div><small>Options vary by product. The sweetener is zero-calorie; finished sweets still contain calories from other ingredients. Confirm your preferred variety with our team.</small></div></section>
    <section id="collections" className="h-wrap craft-collections"><div className="craft-section-heading"><div><p className="h-eyebrow">Explore & order online</p><h2>Your favourites.<br /><em>Ready to order online.</em></h2></div><p>From the first crunch to the last sweet bite.<br />Find your collection. Make it yours.</p></div>
      <div className="craft-collection-grid">{shopCollections.filter((collection) => !('local' in collection && collection.local)).map((collection) => <CollectionCard key={collection.id} collection={collection} />)}</div>
      <p className="craft-image-note">Collection imagery includes AI-created illustrations. Actual products and presentation may vary.</p>
    </section>
    <section id="hosur-specialities" className="h-wrap craft-local-heading"><p className="h-eyebrow">Made for our neighbourhood</p><h2>Hosur favourites.<br /><em>Within 30 km only.</em></h2><p>Discover our famous Oppat and Dilpasand, fresh bakery favourites and celebration cakes. These local specialities are delivered only in and around Hosur, within a 30 km radius. Bakery and Cake items are for direct branch orders only; online ordering is unavailable for them.</p></section>
    <section className="craft-branch-notice" aria-label="Bakery products are branch only"><div className="h-wrap"><Store size={30} /><div><strong>Puffs. Bread. Rusk. Cakes.</strong><p>Fresh from our ovens. <b>No online orders.</b> Contact our branch to order. Bakery and Cake items are delivered only in and around Hosur, within a 30 km radius.</p></div><Link to="/#visit">Visit our branch <ArrowRight size={18} /></Link></div></section>
    <section id="oppat" className="craft-oppat h-wrap"><div className="craft-oppat-photo"><img src={shopCollectionImage('oppat')} alt="Illustrative coconut Oppat with coconut and jaggery filling" loading="lazy" /><span>OUR SIGNATURE · YOUR NEXT FAVOURITE</span></div><div className="craft-oppat-copy"><p className="h-eyebrow">Some favourites need no introduction</p><h2>Famous for<br />a reason.<br /><em>Our coconut Oppat.</em></h2><p>Warm golden layers. Fragrant coconut. A first bite you will want to come back for.</p><p>Dilpasand and Oppat are two of our bakery’s most famous specialities. We select first-quality coconuts from chosen parts of Karnataka for their beautiful aroma and deeply comforting flavour — a first bite you will want to come back for.</p><div className="craft-local"><MapPin size={18} /><strong>Made for Hosur. Delivered within 30 km.</strong></div><Link to="/order?category=oppat" className="craft-primary">Bring home our Oppat <ArrowRight size={18} /></Link></div></section>
    <section className="craft-oppat craft-dilpasand h-wrap"><div className="craft-oppat-copy"><p className="h-eyebrow">Another much-loved bakery speciality</p><h2>Flaky layers.<br /><em>Fragrant coconut.<br />Famous Dilpasand.</em></h2><p>Our Dilpasand brings together a delicate baked crust and a generous coconut filling. Like our Oppat, its signature aroma begins with first-quality coconuts carefully procured from selected parts of Karnataka.</p><div className="craft-local"><MapPin size={18} /><strong>No online orders · Delivery within 30 km of Hosur only.</strong></div><Link to="/order?category=bakery" className="craft-primary">Explore our bakery <ArrowRight size={18} /></Link></div><div className="craft-oppat-photo"><img src={shopCollectionImage('bakery')} alt="Illustrative coconut Dilpasand and fresh bakery collection" loading="lazy" /><span>DILPASAND & OPPAT · OUR COCONUT SPECIALITIES</span></div></section>
    <section className="h-wrap craft-local-collections" aria-label="Bakery and Cakes for direct branch ordering"><div className="craft-collection-grid">{shopCollections.filter((collection) => collection.id === 'bakery' || collection.id === 'cake').map((collection) => <CollectionCard key={collection.id} collection={collection} />)}</div></section>
    <section className="craft-bulk" id="bulk-orders"><div className="h-wrap craft-bulk-inner"><div><p className="h-eyebrow">More to share. More to celebrate.</p><h2>Big occasion?<br /><em>We take bulk orders.</em></h2><p>Weddings, family functions, office celebrations and thoughtful gifting. Let us make something worth sharing.</p><div className="craft-bulk-radius"><MapPin /><strong>HOSUR + 30 KM RADIUS</strong><span>Bulk orders in and around Hosur</span></div></div><div className="craft-bulk-contact"><span>LET’S PLAN YOUR ORDER</span><h3>Your celebration.<br />Our kitchen.</h3><p>Tell us your occasion, quantity and date. Ask about natural jaggery, palm jaggery and monk fruit options.</p><a href={'tel:' + CAFE_INFO.phone.replace(/\s/g, '')} className="craft-primary"><Phone size={17} /> Call for bulk orders</a><small>{CAFE_INFO.phone}</small></div></div></section>
    <footer className="h-wrap craft-footer"><Link to="/">SNB · Since 1988</Link><span>Good ingredients. Unforgettable taste.</span><Link to="/order/track">Track your order</Link></footer>
  </main>;
}
