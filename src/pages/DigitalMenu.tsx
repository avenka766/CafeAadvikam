import { useState, useMemo, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { MENU_CATEGORIES, CAFE_CONFIG, TABLE_NUMBERS } from '@/constants/config';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { BellRing, X, ChevronDown, Send, MessageCircle, Clock, Leaf } from 'lucide-react';

const WAITER_WHATSAPP = '917667117803';

// ── Hero food photo (high-quality South Indian spread) ─────────────────────
// Using a reliable Unsplash South Indian food image as the hero background
const HERO_IMAGE = 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=800&q=80';

function CallWaiterSheet({ onClose }: { onClose: () => void }) {
  const [table, setTable] = useState<number | ''>('');
  const [request, setRequest] = useState('');
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = table !== '' && request.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const msg = `🔔 *Waiter Request*\n📍 Table: *${table}*\n💬 Request: ${request.trim()}`;
    const url = `https://wa.me/${WAITER_WHATSAPP}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setSent(true);
  };

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative w-full bg-background rounded-t-3xl p-8 flex flex-col items-center gap-4 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <MessageCircle className="size-8 text-emerald-600" />
          </div>
          <div>
            <p className="font-display text-xl font-bold text-foreground">Waiter Notified!</p>
            <p className="text-sm font-body text-muted-foreground mt-1">Your request has been sent via WhatsApp. Someone will be at your table shortly.</p>
          </div>
          <button onClick={onClose} className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BellRing className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-foreground">Call a Waiter</p>
              <p className="text-xs font-body text-muted-foreground">We'll be at your table shortly</p>
            </div>
          </div>
          <button onClick={onClose} className="size-8 rounded-full bg-muted flex items-center justify-center" aria-label="Close">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 pb-8 space-y-4 pt-2">
          <div>
            <label className="text-xs font-body font-semibold text-foreground mb-1.5 block uppercase tracking-wide">Select Your Table *</label>
            <button
              onClick={() => setShowTablePicker(!showTablePicker)}
              className={cn('w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-body transition-all',
                table !== '' ? 'border-primary bg-primary/5 text-foreground font-semibold' : 'border-border bg-card text-muted-foreground')}
            >
              {table !== '' ? `Table ${table}` : 'Choose table number'}
              <ChevronDown className={cn('size-4 transition-transform', showTablePicker && 'rotate-180')} />
            </button>
            {showTablePicker && (
              <div className="mt-2 grid grid-cols-5 gap-2">
                {TABLE_NUMBERS.map((n) => (
                  <button key={n} onClick={() => { setTable(n); setShowTablePicker(false); }}
                    className={cn('py-2.5 rounded-xl text-sm font-body font-bold border transition-all active:scale-95',
                      table === n ? 'cafe-gradient text-primary-foreground border-transparent shadow-sm' : 'bg-card border-border text-foreground')}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-body font-semibold text-foreground mb-1.5 block uppercase tracking-wide">What do you need? *</label>
            <textarea value={request} onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. Extra napkins, water refill, ready to order, bill please..."
              rows={3} className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            <div className="flex flex-wrap gap-2 mt-2">
              {['Ready to order', 'Bill please', 'Water refill', 'Extra napkins', 'Takeaway pack'].map((chip) => (
                <button key={chip} onClick={() => setRequest(chip)}
                  className={cn('px-3 py-1 rounded-full text-xs font-body font-semibold border transition-all active:scale-95',
                    request === chip ? 'cafe-gradient text-primary-foreground border-transparent' : 'bg-card border-border text-muted-foreground')}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSend} disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-40 shadow-lg">
            <Send className="size-4" />
            Send to Waiter via WhatsApp
          </button>
          <p className="text-center text-[10px] font-body text-muted-foreground">Opens WhatsApp — your request goes directly to our staff</p>
        </div>
      </div>
    </div>
  );
}

export default function DigitalMenu() {
  const { items, loadMenu, loading } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showWaiter, setShowWaiter] = useState(false);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter((i) => i.enabled), [items]);
  const activeCategories = useMemo(() =>
    MENU_CATEGORIES.filter((cat) => enabledItems.some((i) => i.category === cat.id)), [enabledItems]);
  const displayCategories = useMemo(() =>
    selectedCategory === 'all' ? activeCategories : activeCategories.filter((c) => c.id === selectedCategory),
    [selectedCategory, activeCategories]);

  return (
    <div className="dashboard-screen min-h-[100dvh] bg-transparent pt-0 pb-6">

      {/* ── HERO — full bleed food photo with overlay ── */}
      <div className="relative w-full overflow-hidden" style={{ height: '340px' }}>
        {/* Background food photo */}
        <img
          src={HERO_IMAGE}
          alt="Cafe Aadvikam food"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Dark gradient overlay — stronger at bottom for text legibility */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.82) 100%)'
        }} />

        {/* Content over image */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-7 px-4 text-center">

          {/* Circular logo badge */}
          <div className="mb-3 size-16 rounded-full border-2 border-white/60 bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <Leaf className="size-7 text-white" />
          </div>

          {/* Cafe name — large serif style */}
          <h1 className="font-display text-4xl font-bold text-white tracking-tight leading-tight drop-shadow-lg">
            {CAFE_CONFIG.name}
          </h1>

          {/* Subtitle — spaced caps like the image */}
          <p className="mt-1 text-white/85 font-body text-[11px] tracking-[0.18em] uppercase font-semibold drop-shadow">
            {CAFE_CONFIG.subtitle}
          </p>

          {/* Info pills row */}
          <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-body font-medium">
              <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
              {CAFE_CONFIG.type}
            </span>
            <span className="text-white/40 text-xs">•</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-body font-medium">
              <Clock className="size-3 shrink-0" />
              {CAFE_CONFIG.hours}
            </span>
          </div>
        </div>
      </div>

      {/* ── CATEGORY FILTER ── */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
          <button onClick={() => setSelectedCategory('all')}
            className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
              selectedCategory === 'all' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
            All Items
          </button>
          {activeCategories.map((cat) => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
                selectedCategory === cat.id ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── MENU ITEMS ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-body text-muted-foreground text-sm">Loading menu...</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-6">
          {displayCategories.map((cat) => {
            const catItems = enabledItems.filter((i) => i.category === cat.id);
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <span className="text-xl">{cat.icon}</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">{cat.name}</h2>
                    <p className="text-[10px] font-body text-muted-foreground">{cat.timing}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {catItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt="" className="size-12 rounded-xl object-cover shrink-0 border border-border" />
                          : <div className="size-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-lg">{cat.icon}</div>
                        }
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
          {enabledItems.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="font-body text-muted-foreground text-sm">Menu is being updated</p>
            </div>
          )}
        </div>
      )}

      <div className="text-center py-6 border-t border-border mt-4">
        <p className="text-xs font-body text-muted-foreground">{CAFE_CONFIG.address}</p>
        <p className="text-xs font-body text-muted-foreground mt-0.5">VRSNB Foods LLP • {CAFE_CONFIG.type}</p>
      </div>

      {/* ── FLOATING CALL WAITER ── */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-6">
        <button onClick={() => setShowWaiter(true)}
          className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl cafe-gradient text-primary-foreground font-body font-bold text-sm shadow-xl active:scale-95 transition-transform">
          <BellRing className="size-5" />
          Call a Waiter
        </button>
      </div>

      {showWaiter && <CallWaiterSheet onClose={() => setShowWaiter(false)} />}
    </div>
  );
}
