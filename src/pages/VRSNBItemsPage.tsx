// src/pages/VRSNBItemsPage.tsx
// VRSNB Admin → Items: Cafe items + VRSNB Bakery items (editable)
import { useState } from 'react';
import { cn } from '@/lib/utils';
import VrsnbItemsTab from '@/components/admin/VrsnbItemsTab';
import MenuManagement from '@/pages/MenuManagement';

export default function VRSNBItemsPage() {
  const [mode, setMode] = useState<'cafe' | 'bakery'>('cafe');
  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">VRSNB Admin</p>
        <h1 className="font-display text-3xl font-bold text-foreground leading-none">Items</h1>
      </div>
      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button onClick={() => setMode('cafe')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          ☕ Cafe Items
        </button>
        <button onClick={() => setMode('bakery')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'bakery' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          🥐 VRSNB Items
        </button>
      </div>
      <div>
        {mode === 'cafe' && <MenuManagement embedded />}
        {mode === 'bakery' && <div className="px-4"><VrsnbItemsTab /></div>}
      </div>
    </div>
  );
}
