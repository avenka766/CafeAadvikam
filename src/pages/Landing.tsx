import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { CAFE_CONFIG, MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { X, UtensilsCrossed, MapPin, Clock, Sparkles, ShieldCheck, Leaf, Phone, ChevronRight, PartyPopper, Car, Coffee, SmilePlus } from 'lucide-react';
import cafeLogo from '@/assets/cafe-logo.png';

// ─── Time-sensitive active category ────────────────────────────────────────
function getActiveTimePeriod() {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return { label: '🌅 Breakfast Menu', sub: 'Serving now until 11 AM', id: 'south-indian-breakfast' };
  if (h >= 11 && h < 15) return { label: '☀️ Lunch Menu', sub: 'Serving now until 3 PM', id: 'lunch' };
  if (h >= 15 && h < 19) return { label: '🧆 Evening Snacks', sub: 'Serving now until 7 PM', id: 'evening-snacks' };
  return { label: '🌙 Dinner Menu', sub: 'Serving now until 10 PM', id: 'biriyani' };
}

// ─── Menu Popup ─────────────────────────────────────────────────────────────
function MenuPopup({ onClose }: { onClose: () => void }) {
  const { items } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const enabledItems = useMemo(() => items.filter((i) => i.enabled), [items]);
  const activeCategories = useMemo(() =>
    MENU_CATEGORIES.filter((cat) => enabledItems.some((i) => i.category === cat.id)), [enabledItems]);
  const displayCategories = useMemo(() =>
    selectedCategory === 'all' ? activeCategories : activeCategories.filter((c) => c.id === selectedCategory),
    [selectedCategory, activeCategories]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl flex flex-col" style={{ height: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Our Menu</h2>
            <p className="text-xs font-body text-muted-foreground mt-0.5">Pure vegetarian delights</p>
          </div>
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"><X className="size-5 text-muted-foreground" /></button>
        </div>
        <div className="shrink-0 border-b border-border">
          <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
            <button onClick={() => setSelectedCategory('all')} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', selectedCategory === 'all' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>All Items</button>
            {activeCategories.map((cat) => (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all', selectedCategory === cat.id ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>{cat.icon} {cat.name}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {enabledItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3"><p className="text-4xl">🍽️</p><p className="font-body text-muted-foreground text-sm">Menu is being updated</p></div>
          ) : displayCategories.map((cat) => {
            const catItems = enabledItems.filter((i) => i.category === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <span className="text-xl">{cat.icon}</span>
                  <div><h3 className="font-display text-lg font-bold text-foreground">{cat.name}</h3><p className="text-[10px] font-body text-muted-foreground">{cat.timing}</p></div>
                </div>
                <div className="space-y-1">
                  {catItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" /> : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-lg">{cat.icon}</div>}
                        <span className="text-sm font-body text-foreground">{item.name}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-3 gap-1">
                        <span className="text-sm font-body font-bold text-primary tabular-nums">{formatCurrency(item.price)}</span>
                        <span className="text-[9px] font-body px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">VEG</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

// ─── 3D Tilt Card ────────────────────────────────────────────────────────────
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    let x: number, y: number;
    if ('touches' in e) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
    else { x = (e as React.MouseEvent).clientX; y = (e as React.MouseEvent).clientY; }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rx = ((y - cy) / (rect.height / 2)) * -12;
    const ry = ((x - cx) / (rect.width / 2)) * 12;
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.04,1.04,1.04)`;
  };
  const handleLeave = () => { if (ref.current) ref.current.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'; };
  return (
    <div ref={ref} className={cn('transition-transform duration-200 ease-out cursor-pointer', className)}
      onMouseMove={handleMove} onMouseLeave={handleLeave} onTouchMove={handleMove} onTouchEnd={handleLeave}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
      {children}
    </div>
  );
}

// ─── 3D Hero Canvas (Three.js) ───────────────────────────────────────────────
function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    // Load Three.js from CDN dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = () => {
      const THREE = (window as any).THREE;
      const W = el.clientWidth, H = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.set(0, 0, 6);

      // Floating food-like geometric objects
      const objects: any[] = [];
      const materialColors = [0xE07A3A, 0xC8955C, 0x5D8A3C, 0xD4A843, 0x8B4513, 0xF4C430];

      // Dosa - large flat torus
      const dosaGeo = new THREE.TorusGeometry(1.1, 0.18, 16, 60);
      const dosaMat = new THREE.MeshPhongMaterial({ color: 0xC8955C, shininess: 80 });
      const dosa = new THREE.Mesh(dosaGeo, dosaMat);
      dosa.position.set(-1.8, 0.4, 0); dosa.rotation.x = 0.4;
      scene.add(dosa); objects.push({ mesh: dosa, speed: 0.008, amp: 0.3, phase: 0 });

      // Biryani handi - rounded cylinder
      const handiGeo = new THREE.CylinderGeometry(0.6, 0.45, 0.9, 20);
      const handiMat = new THREE.MeshPhongMaterial({ color: 0xD4A843, shininess: 60 });
      const handi = new THREE.Mesh(handiGeo, handiMat);
      handi.position.set(1.8, -0.2, -0.5);
      scene.add(handi); objects.push({ mesh: handi, speed: 0.006, amp: 0.25, phase: 1 });

      // Floating ingredient spheres
      const positions = [[-0.5, 1.4, -1], [0.6, -1.2, -0.5], [-2.5, -0.8, -1], [2.4, 1.0, -1.5], [0, 0.8, -2]];
      positions.forEach(([x, y, z], i) => {
        const r = 0.12 + Math.random() * 0.18;
        const geo = i % 2 === 0 ? new THREE.SphereGeometry(r, 12, 12) : new THREE.OctahedronGeometry(r);
        const mat = new THREE.MeshPhongMaterial({ color: materialColors[i % materialColors.length], shininess: 100 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x as number, y as number, z as number);
        scene.add(mesh);
        objects.push({ mesh, speed: 0.005 + Math.random() * 0.008, amp: 0.15 + Math.random() * 0.2, phase: i * 1.2 });
      });

      // Mint leaf - flat disc
      const leafGeo = new THREE.CircleGeometry(0.35, 6);
      const leafMat = new THREE.MeshPhongMaterial({ color: 0x4CAF50, side: THREE.DoubleSide, shininess: 40 });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(-0.2, -1.1, 0.5); leaf.rotation.x = -0.3;
      scene.add(leaf); objects.push({ mesh: leaf, speed: 0.007, amp: 0.18, phase: 2.5 });

      // Lighting
      const ambient = new THREE.AmbientLight(0xffeedd, 0.6); scene.add(ambient);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(3, 5, 5); scene.add(dirLight);
      const pointLight = new THREE.PointLight(0xE07A3A, 0.8, 12);
      pointLight.position.set(-3, 2, 3); scene.add(pointLight);

      // Mouse parallax
      let mouseX = 0, mouseY = 0;
      const onMouse = (e: MouseEvent) => { mouseX = (e.clientX / W - 0.5) * 2; mouseY = (e.clientY / H - 0.5) * 2; };
      window.addEventListener('mousemove', onMouse);

      let animId: number;
      const clock = new THREE.Clock();
      const animate = () => {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        objects.forEach(({ mesh, speed, amp, phase }) => {
          mesh.rotation.y += speed;
          mesh.rotation.x += speed * 0.4;
          mesh.position.y += Math.sin(t * 0.8 + phase) * 0.003;
        });
        // Parallax tilt
        camera.position.x += (mouseX * 0.4 - camera.position.x) * 0.05;
        camera.position.y += (-mouseY * 0.25 - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('mousemove', onMouse);
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      };
    };
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);
  return <div ref={mountRef} className="absolute inset-0 w-full h-full" />;
}

// ─── Party Hall Portal ────────────────────────────────────────────────────────
function PartyPortal({ zoomed, onZoom }: { zoomed: boolean; onZoom: () => void }) {
  const style = {
    transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
    transformOrigin: 'center',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border cursor-pointer select-none" style={{ ...style, height: zoomed ? 320 : 180 }} onClick={onZoom}>
      {/* Isometric room */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #3d1c00 40%, #2d0e00 100%)' }}>
        {/* Floor */}
        <div className="absolute bottom-0 left-0 right-0" style={{ height: '45%', background: 'linear-gradient(to top, #5c2d00 0%, #3d1c00 100%)', clipPath: 'polygon(0 40%, 100% 0%, 100% 100%, 0 100%)' }} />
        {/* Tables - isometric */}
        {[{ l: '15%', b: '28%' }, { l: '38%', b: '35%' }, { l: '60%', b: '28%' }, { l: '27%', b: '18%' }, { l: '50%', b: '15%' }].map((pos, i) => (
          <div key={i} className="absolute" style={{ left: pos.l, bottom: pos.b }}>
            <div style={{ width: 40, height: 6, background: '#c8955c', borderRadius: 3, transform: 'perspective(200px) rotateX(55deg)', boxShadow: '0 8px 12px rgba(0,0,0,0.5)' }} />
          </div>
        ))}
        {/* Chairs */}
        {[{ l: '12%', b: '36%' }, { l: '22%', b: '38%' }, { l: '35%', b: '44%' }, { l: '45%', b: '44%' }, { l: '57%', b: '36%' }, { l: '67%', b: '36%' }].map((pos, i) => (
          <div key={i} className="absolute rounded-sm" style={{ left: pos.l, bottom: pos.b, width: 12, height: 12, background: '#8b4513', transform: 'perspective(100px) rotateX(55deg)', opacity: 0.9 }} />
        ))}
        {/* Hanging lights */}
        {['20%', '40%', '60%', '80%'].map((l, i) => (
          <div key={i} className="absolute" style={{ left: l, top: zoomed ? '12%' : '8%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1, height: zoomed ? 30 : 20, background: '#888' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFD700', boxShadow: '0 0 8px 3px rgba(255,215,0,0.4)', opacity: 0.9 }} />
          </div>
        ))}
        {/* Banner */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded font-body text-[9px] font-bold text-amber-900" style={{ background: '#FFD700', letterSpacing: '0.1em' }}>🎉 PARTY HALL</div>
        {/* Zoom hint */}
        {!zoomed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs font-body font-semibold">Tap to explore →</div>
          </div>
        )}
        {zoomed && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/50 text-white text-[10px] font-body">Tap to close</div>
        )}
      </div>
    </div>
  );
}

// ─── Specialty Cards ──────────────────────────────────────────────────────────
const SPECIALTY_CARDS = [
  { cat: 'Breakfast', emoji: '🍳', items: [{ name: 'Idly 2pc', price: 39 }, { name: 'Masala Dosa', price: 65 }, { name: 'Ghee Pongal', price: 55 }], timing: '7 AM – 11 AM', gradient: 'from-amber-50 to-orange-50', border: 'border-amber-200' },
  { cat: 'Tandoori', emoji: '🔥', items: [{ name: 'Paneer Tikka', price: 170 }, { name: 'Malai Paneer', price: 180 }, { name: 'Tandoori Roti', price: 20 }], timing: '12 PM – 10 PM', gradient: 'from-red-50 to-orange-50', border: 'border-red-200' },
  { cat: 'Biryani', emoji: '🍚', items: [{ name: 'Handi Biryani', price: 150 }, { name: 'Paneer Biryani', price: 160 }, { name: 'Veg Biryani', price: 130 }], timing: '12–3 PM & 7–10 PM', gradient: 'from-yellow-50 to-amber-50', border: 'border-yellow-200' },
  { cat: 'Mini Meals', emoji: '🥘', items: [{ name: 'Mini Meals', price: 110 }, { name: 'Full Meals', price: 140 }, { name: 'Kids Meals', price: 80 }], timing: '12 PM – 3 PM', gradient: 'from-green-50 to-emerald-50', border: 'border-green-200' },
];

// ─── Highlights ───────────────────────────────────────────────────────────────
const HIGHLIGHTS = [
  { icon: <Leaf className="size-5" />, label: 'Pure Vegetarian' },
  { icon: <Sparkles className="size-5" />, label: 'Fresh Ingredients' },
  { icon: <ShieldCheck className="size-5" />, label: 'Hygienic Kitchen' },
  { icon: <SmilePlus className="size-5" />, label: 'Friendly Service' },
];

// ─── Main Landing ──────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { loadMenu } = useMenuStore();
  const [showMenu, setShowMenu] = useState(false);
  const [partyZoomed, setPartyZoomed] = useState(false);
  const timePeriod = getActiveTimePeriod();
  const isMobile = window.innerWidth < 768;

  useEffect(() => { loadMenu(); }, [loadMenu]);

  if (currentUser) {
    const path = currentUser.role === 'order_taker' ? '/order-pad' : currentUser.role === 'admin' ? '/admin-dashboard' : '/billing';
    navigate(path, { replace: true }); return null;
  }

  return (
    <div className="min-h-screen bg-background pt-14 overflow-x-hidden">

      {/* ── HERO with 3D Canvas ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ height: '85vh', minHeight: 480 }}>
        {/* Background gradient always visible */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #3d1800 35%, #2d0e00 70%, #1a0500 100%)' }} />
        {/* Three.js 3D scene — desktop only for perf */}
        {!isMobile && <HeroCanvas />}
        {/* Mobile pseudo-3D CSS scene */}
        {isMobile && (
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute rounded-full opacity-20"
                style={{
                  width: 40 + i * 30, height: 40 + i * 30,
                  background: ['#E07A3A', '#C8955C', '#5D8A3C', '#D4A843', '#8B4513', '#F4C430'][i],
                  left: `${[10, 70, 20, 60, 80, 40][i]}%`,
                  top: `${[15, 10, 55, 60, 30, 40][i]}%`,
                  animation: `float${i} ${3 + i}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
        {/* Dark overlay for text legibility */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.2) 100%)' }} />

        {/* Hero content */}
        <div className="relative h-full flex flex-col justify-end px-5 pb-10">
          {/* Time-sensitive badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-full text-[11px] font-body font-bold tracking-wide animate-pulse"
              style={{ background: 'rgba(255,215,0,0.2)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
              {timePeriod.label} — {timePeriod.sub}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <img src={cafeLogo} alt="logo" className="size-12 rounded-xl border-2 border-white/30 object-cover" />
            <span className="text-white/60 font-body text-xs uppercase tracking-widest">VRSNB Foods LLP</span>
          </div>
          <h1 className="font-display text-5xl font-bold text-white leading-[1.05] mb-1">Cafe<br />Aadvikam</h1>
          <p className="font-display text-base italic mb-1" style={{ color: '#FFD700' }}>Authentic Flavours, Timeless Taste</p>
          <p className="font-body text-sm text-white/60 mb-6">Pure Vegetarian · Restaurant & Party Hall</p>

          {/* CTA Buttons */}
          <div className="flex gap-3">
            {/* Order Now - pulsing glow */}
            <button onClick={() => setShowMenu(true)}
              className="flex-1 py-3.5 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #E07A3A, #C84B0A)', color: 'white', boxShadow: '0 0 20px rgba(224,122,58,0.5)' }}>
              <span className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: '#E07A3A' }} />
              <UtensilsCrossed className="size-4 relative z-10" />
              <span className="relative z-10">View Menu</span>
            </button>
            {/* Directions */}
            <a href={CAFE_CONFIG.googleMapsUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 py-3.5 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border"
              style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.25)', color: 'white', backdropFilter: 'blur(8px)' }}>
              <MapPin className="size-4" />Get Directions
            </a>
          </div>
        </div>

        <style>{`
          @keyframes float0{to{transform:translateY(-12px) rotate(15deg)}}
          @keyframes float1{to{transform:translateY(-18px) rotate(-10deg)}}
          @keyframes float2{to{transform:translateY(-10px) rotate(8deg)}}
          @keyframes float3{to{transform:translateY(-15px) rotate(-12deg)}}
          @keyframes float4{to{transform:translateY(-8px) rotate(20deg)}}
          @keyframes float5{to{transform:translateY(-14px) rotate(-5deg)}}
        `}</style>
      </section>

      {/* ── INFO STRIP ──────────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground px-5 py-4">
        <div className="flex flex-col gap-2 text-sm font-body">
          <div className="flex items-center gap-2"><Clock className="size-4 shrink-0 opacity-80" /><span className="font-semibold">Open {CAFE_CONFIG.hours}</span></div>
          <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 opacity-80" /><span>{CAFE_CONFIG.address}</span></div>
        </div>
      </section>

      {/* ── INTERACTIVE MENU CARDS ───────────────────────────────────────── */}
      <section className="px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Specialty Menu</h2>
            <p className="text-xs font-body text-muted-foreground mt-0.5">Hover cards to explore</p>
          </div>
          <button onClick={() => setShowMenu(true)} className="px-4 py-2 rounded-xl border-2 border-primary text-primary font-body font-bold text-xs active:scale-95 transition-transform flex items-center gap-1">
            <UtensilsCrossed className="size-3" />Full Menu
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SPECIALTY_CARDS.map((card) => (
            <TiltCard key={card.cat}>
              <div className={cn('rounded-2xl border p-3.5 h-full', `bg-gradient-to-br ${card.gradient}`, card.border)}
                style={{ transformStyle: 'preserve-3d' }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-2xl" style={{ transform: 'translateZ(8px)', display: 'block' }}>{card.emoji}</span>
                  <div>
                    <p className="font-body text-xs font-bold text-foreground">{card.cat}</p>
                    <p className="text-[9px] font-body text-muted-foreground">{card.timing}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {card.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="text-[10px] font-body text-foreground/80 truncate pr-1">{item.name}</span>
                      <span className="text-[10px] font-body font-bold text-primary shrink-0">₹{item.price}</span>
                    </div>
                  ))}
                </div>
                {/* Glassmorphic highlight on hover */}
                <div className="mt-2.5 pt-2 border-t border-current border-opacity-10">
                  <span className="text-[9px] font-body text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">🌿 Pure Veg</span>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* ── PARTY HALL PORTAL ────────────────────────────────────────────── */}
      <section className="px-4 pb-8">
        <div className="flex items-center gap-2 mb-3">
          <PartyPopper className="size-5 text-primary" />
          <h2 className="font-display text-2xl font-bold text-foreground">Party Hall</h2>
        </div>
        <p className="text-sm font-body text-muted-foreground mb-4">Perfect for birthdays, events & corporate gatherings. Click to explore the space.</p>
        <PartyPortal zoomed={partyZoomed} onZoom={() => setPartyZoomed(!partyZoomed)} />
        {/* Book CTA — teal to gold hover */}
        <a href={CAFE_CONFIG.googleMapsUrl} target="_blank" rel="noopener noreferrer"
          className="group mt-4 w-full py-3.5 rounded-2xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg, #0F6E56, #1D9E75)', color: 'white', boxShadow: '0 4px 15px rgba(15,110,86,0.3)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #B8860B, #FFD700)'; e.currentTarget.style.color = '#1a0a00'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #0F6E56, #1D9E75)'; e.currentTarget.style.color = 'white'; }}>
          <PartyPopper className="size-4" />Book Party Hall
          <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
        </a>
      </section>

      {/* ── HIGHLIGHTS ───────────────────────────────────────────────────── */}
      <section className="px-4 py-8 bg-card border-y border-border">
        <div className="flex items-center gap-3 mb-4">
          <img src={cafeLogo} alt="logo" className="size-12 rounded-xl object-cover" />
          <h2 className="font-display text-xl font-bold text-foreground">Why Cafe Aadvikam?</h2>
        </div>
        <p className="text-sm font-body text-muted-foreground leading-relaxed mb-4">{CAFE_CONFIG.description}</p>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHTS.map((h) => (
            <span key={h.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-body font-semibold">{h.icon}{h.label}</span>
          ))}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="bg-foreground text-primary-foreground px-5 py-8 text-center">
        <button onClick={() => navigate('/login')} className="text-sm font-body font-semibold text-primary-foreground/80 underline underline-offset-4 mb-3 active:opacity-70">Staff Login</button>
        <p className="text-xs font-body text-primary-foreground/60 mb-1">VRSNB Foods LLP</p>
        <p className="text-xs font-body text-primary-foreground/50">© 2025 {CAFE_CONFIG.name}. All rights reserved.</p>
      </footer>

      {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
    </div>
  );
}
