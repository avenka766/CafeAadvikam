// src/lib/printViaIframe.ts
//
// Single print pipeline used by every non-Branch print in the app (Planner
// dashboard, dispatch invoices, walk-in bills, closure reports, registers,
// checklists).
//
// ── SECOND REWRITE (2026-08-13, later same day) ──────────────────────────
// The first rewrite earlier today fixed a real bug (a blind 300ms timeout
// that could fire before the iframe's document was actually ready) but
// introduced a WORSE one while doing it, and it went undetected because it
// fails exactly as silently as what it replaced: zero console errors,
// nothing prints.
//
// That version stripped any print-trigger script out of the incoming HTML
// and instead had the PARENT page listen for the iframe's own `load` event
// to call print(). That's an iframe anti-pattern: a `src`-less iframe
// fires an initial `load` for its empty starting document almost
// immediately after being appended to the page — BEFORE document.write()
// ever runs. The one-shot listener very plausibly consumed that premature,
// empty-document load, called print() on blank content (no dialog, no
// error), and was gone by the time the real invoice HTML got written a
// moment later. Identical failure on thermal and A4, since both share this
// one function.
//
// The proven-working Branch bill printer (printCounterBill in
// src/branch/printUtils.ts, confirmed printing correctly every day) never
// does this. It embeds the print trigger INSIDE the HTML itself:
//   <script>window.onload=()=>window.print()</script>
// That's reliable because it's the DOCUMENT's own load event firing for
// the DOCUMENT that actually contains it — no ambiguity about which load
// event is being observed. This version goes back to that exact pattern
// instead of re-inventing a parent-side listener.

// Last-resort path: a real window the user can print from manually. Only
// reached if the hidden iframe could not be created at all.
function fallbackToWindow(html: string) {
  let win: Window | null = null;
  try {
    win = window.open('', '_blank');
  } catch {
    win = null;
  }
  if (!win) {
    window.alert(
      'The print document could not be opened.\n\n' +
      'Your browser appears to be blocking pop-ups for this site. ' +
      'Please allow pop-ups for this address and try again, or use your ' +
      'browser menu > Print.',
    );
    return;
  }
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  } catch (err) {
    console.error('[printViaIframe] popup fallback failed:', err);
  }
}

export function printViaIframe(html: string) {
  let frame: HTMLIFrameElement | null = null;
  try {
    frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // Deliberately NOT display:none — a display:none iframe is not laid out
    // and several browsers refuse to print it. Off-screen + 1px is the same
    // recipe the working Branch bill printer uses.
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    document.body.appendChild(frame);

    const target = frame.contentWindow;
    if (!target) {
      frame.remove();
      console.error('[printViaIframe] iframe.contentWindow was null — falling back to a window.');
      fallbackToWindow(html);
      return;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { frame?.remove(); } catch { /* already detached */ }
    };
    // Fires once the print dialog is dismissed. If the browser never fires
    // it (some don't, for iframe-hosted documents), don't leave the hidden
    // iframe sitting in the DOM forever.
    target.onafterprint = cleanup;
    window.setTimeout(cleanup, 120_000);

    // The print trigger lives INSIDE the document being written, not in a
    // parent-side listener — see the file header for why that distinction
    // is the actual fix here. It sets a flag on the iframe's own window so
    // the parent-side safety net below can tell it already ran, from a
    // completely different JS context, without any race.
    const printTrigger = '<script>window.onload=function(){window.__printed=true;try{window.print();}catch(e){console.error("[printViaIframe] print() failed inside frame:",e);}};</script>';
    const withTrigger = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${printTrigger}</body>`)
      : `${html}${printTrigger}`;

    target.document.open();
    target.document.write(withTrigger);
    target.document.close();

    // Safety net: if for any reason the injected script never ran (a
    // future stricter CSP blocking inline scripts, for example) still
    // print rather than doing nothing. Checks the flag the injected script
    // itself sets, so this can never double-fire alongside it.
    window.setTimeout(() => {
      if (cleaned || (target as unknown as { __printed?: boolean }).__printed) return;
      try {
        target.focus();
        target.print();
      } catch (err) {
        console.error('[printViaIframe] safety-net print() failed:', err);
      }
    }, 1500);
  } catch (err) {
    console.error('[printViaIframe] failed to set up the print frame:', err);
    try { frame?.remove(); } catch { /* noop */ }
    fallbackToWindow(html);
  }
}
