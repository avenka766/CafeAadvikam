// src/lib/printViaIframe.ts
//
// ROOT CAUSE (2026-08-09 investigation, "Planner printing completely
// broken"): this file has been rewritten multiple times chasing the wrong
// target. Its own previous header comment claimed the one print path
// confirmed working on live hardware — printCounterBill / printSnbCounterBill
// in src/branch/printUtils.ts — used "a SIZED popup window
// (window.open('', '_blank', 'width=420,height=680'))". That description is
// WRONG. Reading printUtils.ts directly:
//
//   export async function printCounterBill(bill, duplicate = false) {
//     ...
//     const frame = document.createElement('iframe');   // <-- hidden IFRAME
//     frame.style.position = 'fixed'; frame.style.left = '-10000px'; ...
//     document.body.appendChild(frame);
//     const target = frame.contentWindow;
//     ...
//     printSnbCounterBill(bill, isDuplicate, target);    // <-- target passed in
//   }
//
// `printSnbCounterBill`/`printVrsnbReceiptBill` only fall back to
// `window.open(...)` when NO target is passed — which never happens on the
// real "Finish Bill" path, only if one of those two functions were ever
// called directly. So the mechanism actually proven to reliably auto-print
// on real thermal hardware, on every branch, every day, is a HIDDEN IFRAME
// (never a popup) — not what this file's previous version implemented
// despite being named "printViaIframe".
//
// Why that divergence explains "Branch prints, Planner doesn't":
// `window.open()` popups depend on the browser's popup-blocker treating the
// call as sufficiently "user-initiated" — which varies by browser/OS/kiosk
// policy and can silently produce a Window object that never actually shows
// a print dialog (not just a hard null, which this file already checked
// for). A hidden iframe appended to the existing page's DOM is never subject
// to popup-blocker logic at all, because no new window/tab is ever
// requested. This rewrite makes Planner's print helper use the exact same
// hidden-iframe mechanism as the Branch bill printer, instead of a
// popup — removing the one concrete way these two paths differed.
export function printViaIframe(html: string) {
  // Make sure the print trigger is present exactly once — some callers
  // already embed it, some don't; never end up with two (which would pop
  // the print dialog twice).
  const finalHtml = /window\.print\s*\(/i.test(html)
    ? html
    : /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, '<script>window.onload=function(){window.print();};</script></body>')
      : `${html}<script>window.onload=function(){window.print();};</script>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
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
    alert('Could not prepare the print document. Please try again.');
    return;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frame.remove();
  };
  target.onafterprint = cleanup;
  // Safety net: if `onafterprint` never fires (some browsers don't fire it
  // reliably for iframe-hosted documents, or the user closes the print
  // dialog without printing), don't leave the hidden iframe in the DOM
  // forever.
  window.setTimeout(cleanup, 60_000);

  target.document.open();
  target.document.write(finalHtml);
  target.document.close();

  // Belt-and-braces: the embedded onload script above is the same mechanism
  // printCounterBill/printThermalHtml already rely on successfully — but
  // fire print() directly from here too as a second, independent trigger in
  // case `onload` doesn't fire promptly inside this particular iframe (seen
  // previously with the popup path). If onload already opened the dialog
  // this is harmless (browsers just no-op or refocus it).
  window.setTimeout(() => {
    try { target.focus(); target.print(); } catch { /* iframe may already be gone */ }
  }, 300);
}
