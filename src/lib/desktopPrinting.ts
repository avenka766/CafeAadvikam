import { desktopSilentPrint, isElectronApp } from './platform';

// Legacy print screens use window.open/document.write or hidden iframes.
// Keep those documents offscreen and send a snapshot to the desktop printer.
export function installDesktopPrinting() {
  if (!isElectronApp()) return;
  const install = (target: Window) => {
    try {
      target.print = () => {
        const printing = desktopSilentPrint(target.document.documentElement.outerHTML);
        void printing?.finally(() => target.dispatchEvent(new Event('afterprint')));
      };
    } catch { /* Cross-origin documents are not application print documents. */ }
  };
  install(window);
  const browserOpen = window.open.bind(window);
  window.open = ((url?: string | URL) => {
    if (url && String(url) !== 'about:blank') return browserOpen(url, '_blank');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
    const target = frame.contentWindow!;
    install(target);
    target.close = () => frame.remove();
    frame.addEventListener('load', () => install(target));
    // document.open() can reset Window properties; reinstall before load handlers.
    const open = target.document.open.bind(target.document);
    target.document.open = ((...args: unknown[]) => { const result = open(...args as []); install(target); return result; }) as typeof target.document.open;
    return target;
  }) as typeof window.open;
  const watch = () => {
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLIFrameElement && node.contentWindow) {
          install(node.contentWindow);
          node.addEventListener('load', () => node.contentWindow && install(node.contentWindow));
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch, { once: true });
}
