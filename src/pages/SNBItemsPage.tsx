// src/pages/SNBItemsPage.tsx
// SNB Admin → Items: SNB Bakery items only (editable)
import SnbItemsTab from '@/components/admin/SnbItemsTab';

export default function SNBItemsPage() {
  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <p className="text-xs font-body font-semibold text-amber-600 uppercase tracking-widest mb-1">SNB Admin</p>
        <h1 className="font-display text-3xl font-bold text-foreground leading-none">SNB Items</h1>
      </div>
      <div className="px-4 mt-4">
        <SnbItemsTab />
      </div>
    </div>
  );
}
