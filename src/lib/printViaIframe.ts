// src/lib/printViaIframe.ts
//
// Single hardened print pipeline used by every non-Branch print in the app
// (Planner dashboard, dispatch invoices, walk-in bills, closure reports,
// registers, checklists).
//
// ── WHY THIS WAS REWRITTEN (2026-08-13) ──────────────────────────────────
// "Planner printing does nothing" survived ~20 attempted fixes over 10 days.
// Re-auditing from scratch showed the previous version of this file was
// already functionally IDENTICAL to the Branch printer that works every day
// (printCounterBill in src/branch/printUtils.ts): same hidden iframe, same
// styles, same document.write/close, same injected onload trigger. So the
// repeated "switch popup -> iframe" fixes were never going to change
// anything, because the mechanism was never the difference.
//
// What the old version DID have were several ways to silently do nothing,
// which is exactly the reported symptom:
//
//   1. It printed on a blind `setTimeout(..., 300)` instead of waiting for
//      the iframe to actually finish loading. On a slow POS PC, 300ms can
//      elapse before the document is ready — print() then fires against a
//      not-yet-laid-out document and the browser drops it. Nothing prints,
//      no error.
//   2. It fired TWO independent print triggers (the injected
//      `window.onload` script AND the parent-side timeout). Two print()
//      calls racing on the same document can leave the dialog suppressed.
//   3. Every failure path was a silent `return` or a swallowed `catch {}`.
//      If anything went wrong the user saw literally nothing.
//   4. It skipped injecting the auto-print trigger whenever the incoming
//      HTML merely CONTAINED the text "window.print(" — which was true for
//      documents that only had a manual <button onclick="window.print()">.
//      Those documents then relied entirely on failure mode #1.
//
// This version: waits for the real load event, guarantees EXACTLY ONE print
// trigger, and degrades loudly (popup fallback, then a visible message)
// instead of failing silently.

// Remove any auto-print trigger baked into the source HTML. Printing is now
// driven from the parent with a single guarded call, so an inline
// `window.onload = ... print()` would only re-introduce the double-trigger
// race described above. Manual "Print" buttons inside the document are left
// alone — they're harmless and useful in the popup fallback.
function stripAutoPrintScripts(html: string): string {
  return html.replace(
    /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\s*\.\s*print\s*\((?:(?!<\/script>)[\s\S])*?<\/script>/gi,
    (block) => (/onclick/i.test(block) ? block : ''),
  );
}

// Last-resort path: a real window the user can print from manually. Only
// reached if the hidden iframe could not be created or driven at all.
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
    window.setTimeout(() => { try { win?.print(); } catch { /* user can still Ctrl+P */ } }, 400);
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

    // EXACTLY ONE print trigger, whichever fires first.
    let printed = false;
    const doPrint = () => {
      if (printed || cleaned) return;
      printed = true;
      try {
        target.focus();
        target.print();
      } catch (err) {
        // A genuine failure to invoke print — surface it and fall back
        // rather than leaving the user staring at a dead button.
        console.error('[printViaIframe] target.print() threw:', err);
        cleanup();
        fallbackToWindow(html);
      }
    };

    target.onafterprint = cleanup;
    // Don't leave the hidden iframe in the DOM forever if onafterprint never
    // fires (some browsers don't fire it for iframe documents).
    window.setTimeout(cleanup, 120_000);

    // Primary trigger: the iframe's real load event, so we never print a
    // document that hasn't finished parsing/laying out.
    frame.addEventListener('load', doPrint, { once: true });

    target.document.open();
    target.document.write(stripAutoPrintScripts(html));
    target.document.close();

    // Safety net, generously timed: if the load event somehow never fires
    // for this document, still print rather than doing nothing. The
    // `printed` guard means this can never double-fire with the line above.
    window.setTimeout(doPrint, 2000);
  } catch (err) {
    console.error('[printViaIframe] failed to set up the print frame:', err);
    try { frame?.remove(); } catch { /* noop */ }
    fallbackToWindow(html);
  }
}
