// src/pages/AdminInvoicesPage.tsx
// Standalone page for Admin Invoices – linked directly from BottomNav.
// Replaces the tab inside BakeryView.

import AdminInvoicesTab from '@/bakery/AdminInvoicesTab';

export default function AdminInvoicesPage() {
  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">
              Admin Portal
            </p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Invoices</h1>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="px-4 pt-4 space-y-4">
        <AdminInvoicesTab />
      </div>
    </div>
  );
}
