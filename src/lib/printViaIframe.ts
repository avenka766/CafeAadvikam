// src/lib/printViaIframe.ts
//
// PIVOT (2026-08-08): this went through two attempts before landing on what's
// actually proven to work on the live hardware (Essae PR-95 thermal printer):
//
// 1st attempt fixed: checklist/invoice print used `window.open('', '_blank')`
//   with NO size arguments — the "open the print window" step itself could
//   silently fail (blocked/mishandled) with zero feedback.
// 2nd attempt (hidden 0x0 iframe, to dodge popup blockers entirely) traded
//   that bug for a new one: printed on the real thermal printer with a huge
//   blank trailing gap, and sometimes the job never actually completed —
//   a 0x0 iframe gives the print engine no real layout viewport to compute
//   `@page { size: 80mm auto }`'s height from.
//
// The one print path in this app that is confirmed working on this exact
// printer is `printSnbCounterBill` / `printCounterBill` in
// src/branch/printUtils.ts: a SIZED popup window
// (`window.open('', '_blank', 'width=420,height=680')`), written via
// `document.open()/write()/close()`, printed by an embedded
// `<script>window.onload=()=>window.print()</script>` inside the HTML
// itself (not a direct `win.print()` call from the opener's JS). This
// helper now mirrors that exact mechanism instead of guessing at a new one.
export function printViaIframe(html: string) {
  // Make sure the print trigger is present exactly once — some callers
  // already embed it, some don't; never end up with two (which would pop
  // the print dialog twice).
  const finalHtml = /window\.print\s*\(/i.test(html)
    ? html
    : /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, '<script>window.onload=function(){window.print();};</script></body>')
      : `${html}<script>window.onload=function(){window.print();};</script>`;

  const win = window.open('', '_blank', 'width=420,height=680');
  if (!win) {
    alert('Could not open the print window. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(finalHtml);
  win.document.close();

  // Belt-and-braces (2026-08-08): the embedded onload script above is the
  // exact mechanism printSnbCounterBill/printCounterBill already rely on
  // successfully elsewhere in this app, but on live testing this specific
  // print (dispatch invoice reprint) opened the window with the right
  // content and title yet never actually raised the print dialog — the
  // 'load' event either didn't fire or something about this window
  // suppressed the auto-print. Also fire print() directly from here as a
  // second, independent trigger. If the onload script already opened the
  // dialog this is harmless (browsers just no-op or refocus it); if onload
  // never fired, this is what actually gets the print out.
  try { win.focus(); } catch { /* ignore */ }
  setTimeout(() => {
    try { win.print(); } catch { /* window may already be closed */ }
  }, 300);
}
