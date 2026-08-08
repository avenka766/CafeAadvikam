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
// This helper prints via a same-page <iframe> instead: no new window/tab is
// ever opened, so it is immune to popup blockers.
//
// FOLLOW-UP BUG FIX (2026-08-08): the first version of this helper used a
// 0x0-sized iframe (`width:0; height:0`). On the live thermal printer
// (Essae PR-95) this produced a print dialog that opened correctly, but
// clicking Print in it either never actually printed or printed a huge
// blank trailing gap after the real content. Root cause: a 0x0 iframe gives
// Chrome's print engine a 0x0 layout viewport to compute the page from, so
// `@page { size: 80mm auto }`'s "auto" height can't be derived from the
// real content flow and falls back to a default (near-A4-length) page —
// exactly "lot of extra space in the last only print until the details are
// there." Giving the iframe real, generous dimensions (just parked
// off-screen instead of zero-sized) lets the browser lay out the content
// and compute the true auto page height correctly.
export function printViaIframe(html: string) {
  try {
    // Clean up any iframe left over from a previous print call (belt and
    // braces — normally cleanup() below already removes it, but never
    // leave more than one stacked up).
    document.querySelectorAll('iframe[data-print-frame="1"]').forEach((el) => el.remove());

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-print-frame', '1');
    iframe.setAttribute('aria-hidden', 'true');
    // Parked off-screen (not 0x0) so the print engine has a real layout
    // viewport to compute @page's "auto" height from — see note above.
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-10000px';
    iframe.style.width = '400px';
    iframe.style.height = '1200px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const cleanup = () => {
      // Generous delay: a real thermal printer (serial/USB, slow spooler)
      // can still be pulling the job from this iframe's document well
      // after window.print() returns control to JS. Removing it too early
      // risks cutting a slow print job off mid-way.
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 60_000);
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
    const win = window.open('', '_blank', 'width=420,height=680');
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
