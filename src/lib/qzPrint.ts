// QZ Tray bridge — lets the web app silently print a specific document to a
// SPECIFIC named Windows printer (e.g. "Kitchen KOT" vs "Bill Printer"),
// something a plain browser window.print() call can never do: a webpage has
// no API to choose which installed printer receives a given print job, it
// can only trigger the browser's native print dialog (manual picker) or,
// with a "silent printing" browser flag, always go to whatever the OS
// default printer happens to be — which is why the Kitchen KOT and the
// customer bill were both landing on the same printer.
//
// QZ Tray (https://qz.io) is a small, free, open-source background app that
// the cafe installs once on the billing PC. Once it's running, this module
// connects to it over a local WebSocket and can send a print job straight to
// a printer by name — no OS print dialog, no "default printer" ambiguity.
//
// Everything here fails soft: if QZ Tray isn't installed/running, or no
// printer has been configured for a given role yet, every function below
// resolves to `false`/`null` so callers can fall back to the existing
// hidden-iframe window.print() pipeline instead of breaking printing.

// qz-tray ships as a plain UMD bundle with no TypeScript types, so we type
// only the surface this file actually touches.
type QzModule = {
  websocket: {
    isActive: () => boolean;
    connect: (options?: Record<string, unknown>) => Promise<void>;
    disconnect: () => Promise<void>;
  };
  printers: {
    find: (query?: string) => Promise<string | string[]>;
  };
  configs: {
    create: (printer: string, options?: Record<string, unknown>) => unknown;
  };
  print: (config: unknown, data: unknown[]) => Promise<void>;
  security: {
    setCertificatePromise: (fn: (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
    setSignaturePromise: (fn: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void) => void;
  };
};

declare global {
  interface Window {
    qz?: QzModule;
  }
}

// qz-tray is a legacy UMD script that attaches itself to `window.qz` — it's
// designed to be loaded via a plain <script> tag, not bundled as an ESM/CJS
// module. An `import('qz-tray')` here builds fine locally but Rollup's
// production build (what Vercel actually runs) can't resolve the package at
// all and hard-fails the whole deploy. So instead the exact same script
// (vendored at public/vendor/qz-tray.js, served as a static file — no
// external CDN dependency for a POS machine that needs to work reliably) is
// injected as a real <script> tag at runtime, on demand, only when a print
// is actually attempted. This never touches the bundler, so it can't break
// the build, and it costs nothing for anyone who never sets up QZ Tray.
let qzScriptPromise: Promise<QzModule> | null = null;
async function loadQz(): Promise<QzModule> {
  if (!qzScriptPromise) {
    qzScriptPromise = new Promise<QzModule>((resolve, reject) => {
      if (window.qz) { resolve(window.qz); return; }
      const existing = document.querySelector<HTMLScriptElement>('script[data-qz-tray]');
      const onReady = () => {
        if (window.qz) resolve(window.qz);
        else reject(new Error('qz-tray script loaded but window.qz was not set'));
      };
      if (existing) {
        existing.addEventListener('load', onReady, { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load qz-tray script')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = '/vendor/qz-tray.js';
      script.async = true;
      script.dataset.qzTray = 'true';
      script.addEventListener('load', onReady, { once: true });
      script.addEventListener('error', () => reject(new Error('Failed to load qz-tray script')), { once: true });
      document.head.appendChild(script);
    }).then((qz) => {
      // Unsigned/untrusted mode: QZ Tray will show a one-time "Action
      // Required" prompt in its tray app the first time this site connects,
      // where the cashier can tick "Remember this decision" so it never
      // asks again. No certificate purchase or signing server needed for an
      // internal LAN POS like this one.
      qz.security.setCertificatePromise((resolve) => resolve(''));
      qz.security.setSignaturePromise(() => (resolve) => resolve(''));
      return qz;
    });
    // Don't cache a permanent failure (e.g. static file briefly unavailable)
    // — let the next print attempt retry loading the script from scratch.
    qzScriptPromise.catch(() => { qzScriptPromise = null; });
  }
  return qzScriptPromise;
}

// Local storage keys for the two printer roles this app currently needs.
// Kept generic (role: string) so future dashboards/roles can reuse this
// same module without changes.
const PRINTER_PREF_PREFIX = 'cafe.printerPref.';

export function getPrinterPref(role: string): string {
  try {
    return localStorage.getItem(PRINTER_PREF_PREFIX + role) || '';
  } catch {
    return '';
  }
}

export function setPrinterPref(role: string, printerName: string): void {
  try {
    if (printerName) localStorage.setItem(PRINTER_PREF_PREFIX + role, printerName);
    else localStorage.removeItem(PRINTER_PREF_PREFIX + role);
  } catch {
    // localStorage unavailable — silently no-op, printing just falls back
    // to the manual/default-printer pipeline.
  }
}

let connectAttempt: Promise<boolean> | null = null;

// Ensures a live QZ Tray connection, attempting to connect only once at a
// time (concurrent print calls share the same in-flight attempt). Returns
// false (never throws) if QZ Tray isn't running on this machine.
export async function ensureQzConnected(): Promise<boolean> {
  if (!connectAttempt) {
    connectAttempt = (async () => {
      try {
        const qz = await loadQz();
        if (qz.websocket.isActive()) return true;
        await qz.websocket.connect({ retries: 1, delay: 0 });
        return true;
      } catch {
        return false;
      } finally {
        // Allow a fresh attempt next time (e.g. QZ Tray gets started after
        // the page already loaded) instead of caching a permanent failure.
        setTimeout(() => { connectAttempt = null; }, 3000);
      }
    })();
  }
  return connectAttempt;
}

export async function isQzAvailable(): Promise<boolean> {
  return ensureQzConnected();
}

// Lists every printer name Windows/QZ Tray knows about, for the printer
// setup dropdowns. Returns [] if QZ Tray isn't reachable.
export async function listQzPrinters(): Promise<string[]> {
  const connected = await ensureQzConnected();
  if (!connected) return [];
  try {
    const qz = await loadQz();
    const found = await qz.printers.find();
    return Array.isArray(found) ? found : [found];
  } catch {
    return [];
  }
}

// Prints a fully self-contained HTML document to a specific named printer,
// silently (no OS dialog). QZ Tray rasterizes the HTML the same way it would
// render in a lightweight browser engine, so the exact same markup already
// used for window.print() works unchanged here.
export async function printHtmlToPrinter(printerName: string, html: string): Promise<boolean> {
  if (!printerName) return false;
  const connected = await ensureQzConnected();
  if (!connected) return false;
  try {
    const qz = await loadQz();
    const config = qz.configs.create(printerName, { rasterize: true });
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
    return true;
  } catch {
    return false;
  }
}

// Convenience used by the print call sites: resolves the printer configured
// for `role` (e.g. 'kot' or 'bill') and attempts a silent QZ print. Returns
// true only if it actually printed via QZ — false means "nothing happened,
// caller should fall back to the manual print-dialog pipeline."
export async function printViaQz(role: string, html: string): Promise<boolean> {
  const printerName = getPrinterPref(role);
  if (!printerName) return false;
  return printHtmlToPrinter(printerName, html);
}
