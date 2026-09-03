// src/components/layout/NativeNav.tsx
// FEATURE (2026-09-03): "the SNB order and VRSNB order app is not at all
// good and there is no hamburger symbol at all." Root cause: App.tsx
// deliberately skips Header/WorkspaceChrome/BottomNav entirely for EVERY
// native build (isNativeApp()), not just Owner's dedicated app — so any
// dashboard whose navigation depends on WorkspaceChrome's sidebar (as
// OrderReceiverDashboard.tsx's own comment said: "Mobile navigation is
// provided only by the WorkspaceChrome Menu drawer") renders with no way to
// switch tabs at all on a native build. This is a small, reusable
// hamburger + slide-out drawer for exactly that gap — reuses
// WorkspaceChrome's own per-role nav list (navForRole) so the drawer always
// matches what the web sidebar already offers, instead of a second,
// separately-maintained tab list. Only rendered when isNativeApp() is true;
// the web dashboard (WorkspaceChrome's own sidebar) is completely
// unaffected. Visual language matches the Owner app's native shell
// (.owner-native-* classes in index.css — generic enough to reuse here).
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, UserCircle2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { navForRole } from './WorkspaceChrome';

export default function NativeNav({ title, subtitle }: { title: string; subtitle: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const items = navForRole(currentUser?.role);
  const currentHref = `${location.pathname}${location.search}`;

  return (
    <>
      <header className="owner-native-topbar">
        <div className="owner-native-brand">
          <button type="button" className="owner-native-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <span className="owner-native-mark">{title.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        </div>
        <div className="owner-native-profile-wrap">
          <button type="button" className="owner-native-avatar" onClick={() => setProfileOpen((v) => !v)} aria-label="Account">
            <UserCircle2 className="size-6" />
          </button>
          {profileOpen && (
            <>
              <button type="button" className="owner-native-profile-scrim" aria-label="Close" onClick={() => setProfileOpen(false)} />
              <div className="owner-native-profile-card">
                <p className="name">{currentUser?.displayName || currentUser?.username || 'Staff'}</p>
                <p className="role">{title}</p>
                <button type="button" className="owner-native-logout" onClick={() => { setProfileOpen(false); logout(); }}>
                  <LogOut className="size-4" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {drawerOpen && (
        <>
          <button type="button" className="owner-native-drawer-scrim" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
          <nav className="owner-native-drawer" aria-label="Sections">
            <div className="owner-native-drawer-head">
              <span>Sections</span>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            </div>
            {items.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => { navigate(item.path); setDrawerOpen(false); }}
                className={cn('owner-native-drawer-item', currentHref === item.path && 'is-active')}
              >
                {item.icon}
                <span><strong>{item.label}</strong></span>
              </button>
            ))}
          </nav>
        </>
      )}
    </>
  );
}
