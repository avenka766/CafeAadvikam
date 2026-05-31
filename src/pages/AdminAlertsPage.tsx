// src/pages/AdminAlertsPage.tsx
// Standalone page for Admin Alerts / Notifications – linked directly from BottomNav.
// Replaces the tab inside BakeryView.

import AdminNotificationsTab from '@/bakery/AdminNotificationsTab';

export default function AdminAlertsPage() {
  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">
              Admin Portal
            </p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Alerts</h1>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>
      <div className="px-4 pt-4 space-y-4">
        <AdminNotificationsTab />
      </div>
    </div>
  );
}
