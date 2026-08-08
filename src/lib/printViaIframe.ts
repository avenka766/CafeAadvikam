// src/lib/printViaIframe.ts
//
// BUG FIX (2026-08-08): "if we dispatch the selected item and print the
// checklist its not getting printed... Same for invoice also we are unable
// to print... even for the Dispatched tab reprint bill is not working."
//
// All of the Planner Dispatch tab's print buttons previously used
// `window.open('', '_blank')` and wrote the printable HTML into that new
// tab/window. That pattern silently does nothing whenever the browser (or
// an embedded webview / installed PWA / in-app browser) blocks the popup —
// `window.open()` just returns null and the old code did `if (!win) return;`
// with zero feedback, so clicking Print looked like it did nothing.
//
// This helper prints via a hidden same-page <iframe> instead: no new
// window/tab is ever opened, so it is immune to popup blockers. If the
// iframe route is ever unavailable for some reason, it falls back to the
// old window.open approach and, if that also fails, alerts the user instead
// of failing silently.
export function printViaIframe(html: string) {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      throw new Error('no iframe document');
    }

    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // fall through to cleanup regardless
      }
      cleanup();
    };

    // Most browsers fire iframe onload once the written document is ready;
    // as a safety net (some mobile webviews don't fire it reliably for
    // document.write content) also fire on a short timer.
    let fired = false;
    const fireOnce = () => {
      if (fired) return;
      fired = true;
      triggerPrint();
    };
    iframe.onload = fireOnce;
    setTimeout(fireOnce, 400);
  } catch {
    // Fallback: old popup-window approach, with actual user feedback this
    // time if it's blocked instead of silently doing nothing.
    const win = window.open('', '_blank');
    if (!win) {
      alert('Could not open the print window. Please allow pop-ups for this site and try again.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }
}
