// src/components/layout/ElectronRefreshButton.tsx
// FEATURE (2026-09-08): "please check if all the dashboards have refresh
// button and add an overall refresh button" for the Windows desktop app.
// Every dashboard already has its own per-tab scoped refresh buttons (kept
// deliberately scoped, not a page-wide reload, per the 2026-09-01 egress
// audit — a full reload of every tab's data on every click would undo that
// work). What was genuinely missing is a always-visible, no-thinking-required
// recovery button for the packaged app specifically: the window has no
// visible browser chrome at all (autoHideMenuBar hides even Electron's
// default Reload menu item), so there was no way to recover from a stuck or
// stale screen short of quitting and relaunching. A full page reload here is
// the exact same operation a browser's own refresh button performs — safe,
// and guaranteed to clear any stuck state.
//
// Only ever renders inside the Electron app (window.cafeAadvikamDesktop set
// by electron/preload.cjs) — a complete no-op, not even in the bundle's
// visible DOM, on the web deployment or either mobile app.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    cafeAadvikamDesktop?: { isElectron: boolean };
  }
}

export default function ElectronRefreshButton() {
  const [isElectron, setIsElectron] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    setIsElectron(Boolean(window.cafeAadvikamDesktop?.isElectron));
  }, []);

  if (!isElectron) return null;

  return (
    <button
      type="button"
      title="Refresh the app"
      aria-label="Refresh the app"
      onClick={() => { setSpinning(true); window.location.reload(); }}
      className="fixed bottom-5 right-5 z-[9998] flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
    >
      <RefreshCw className={spinning ? 'size-5 animate-spin' : 'size-5'} />
    </button>
  );
}
