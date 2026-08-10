// src/bakery/KgPackAdder.tsx
// Shared by both Hosur ordering screens (Planner's HosurShopOrderPanel and
// HosurDashboard's own New Order tab) — kept in its own file rather than
// exported from either dashboard file to avoid a circular import between
// them (HosurShopOrderPanel already imports notifyAdmin from
// pages/HosurDashboard).
//
// FEATURE (2026-08-10): suppliers like Grain Bro quote ONE per-kg rate but
// ship in fixed pack sizes (200g, 250g, 1kg...) — the shop price list already
// stores that per-kg rate correctly (an item.itemUnit === 'kg' row), and the
// math already works out (0.2kg x rate = the 200g pack price, 0.25kg x rate
// = the 250g pack price — this matches supplier price sheets exactly, e.g.
// Grain Bro's own sheet: New price (per kg) x 0.2 = their "Per 200g" column,
// x 0.25 = their "Per 250g" column, for every single item on it). The
// friction was purely that placing an order meant typing a decimal kg
// amount by hand. This lets someone instead pick "200g pack" / "250g pack" /
// "1kg" and a pack count, and it adds the correct kg quantity (and price)
// for them — no mental math, and it can be used more than once per item to
// mix pack sizes in the same order (e.g. 3 x 200g + 2 x 250g of one item).
import { useState } from 'react';

const HOSUR_PACK_SIZES_G = [100, 200, 250, 500, 1000];

export default function KgPackAdder({ onAdd }: { onAdd: (kg: number) => void }) {
  const [sizeG, setSizeG] = useState(200);
  const [packs, setPacks] = useState('');
  const packsNum = Number(packs) || 0;
  const kg = Math.round((sizeG / 1000) * packsNum * 1000) / 1000;
  return (
    <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-background/80 p-1">
      <select value={sizeG} onChange={e => setSizeG(Number(e.target.value))} className="h-7 rounded-md border border-border bg-background px-1 text-[10px] font-bold">
        {HOSUR_PACK_SIZES_G.map(g => <option key={g} value={g}>{g >= 1000 ? `${g / 1000}kg pack` : `${g}g pack`}</option>)}
      </select>
      <input
        type="number"
        value={packs}
        onChange={e => setPacks(e.target.value)}
        placeholder="packs"
        className="h-7 w-14 rounded-md border border-border bg-background px-1.5 text-[10px] font-bold text-center"
      />
      <button
        type="button"
        disabled={packsNum <= 0}
        onClick={() => { onAdd(kg); setPacks(''); }}
        title={kg > 0 ? `Add ${kg}kg to this item's quantity` : 'Enter a pack count'}
        className="h-7 shrink-0 rounded-md bg-primary px-2 text-[10px] font-black text-primary-foreground disabled:opacity-40"
      >
        + Add{kg > 0 ? ` ${kg}kg` : ''}
      </button>
    </div>
  );
}
