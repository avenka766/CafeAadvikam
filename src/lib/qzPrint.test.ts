import {afterEach,beforeEach,expect,it,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();delete window.qz;localStorage.clear();document.querySelectorAll('script[data-qz-tray]').forEach(s=>s.remove());});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();delete window.qz;});
const bridge=()=>({websocket:{isActive:vi.fn(()=>true),connect:vi.fn(async()=>{}),disconnect:vi.fn(async()=>{})},printers:{find:vi.fn(async()=>['Receipt'])},configs:{create:vi.fn(()=>({}))},print:vi.fn(async()=>{}),security:{setCertificatePromise:vi.fn(),setSignaturePromise:vi.fn()}});
it('replaces a failed QZ script so the next attempt cannot hang on an old load event',async()=>{
 const {ensureQzConnected}=await import('./qzPrint');
 const first=ensureQzConnected();const old=document.querySelector<HTMLScriptElement>('script[data-qz-tray]')!;old.dispatchEvent(new Event('error'));expect(await first).toBe(false);
 await vi.advanceTimersByTimeAsync(3000);
 const second=ensureQzConnected();const replacement=document.querySelector<HTMLScriptElement>('script[data-qz-tray]')!;
 expect(replacement).not.toBe(old);window.qz=bridge();replacement.dispatchEvent(new Event('load'));expect(await second).toBe(true);
});
it('stops waiting for a script that never loads and permits browser fallback',async()=>{
 const {printViaQz,setPrinterPref}=await import('./qzPrint');setPrinterPref('bill','Receipt');const printing=printViaQz('bill','<html>Bill</html>');
 await vi.advanceTimersByTimeAsync(5000);expect(await printing).toBe(false);expect(document.querySelector('script[data-qz-tray]')).toBeNull();
});
it('bounds an unresponsive connection and does not submit a late print job',async()=>{
 const qz=bridge();qz.websocket.isActive.mockReturnValue(false);let connected!:()=>void;qz.websocket.connect.mockImplementation(()=>new Promise<void>(r=>{connected=r;}));window.qz=qz;
 const {printViaQz,setPrinterPref}=await import('./qzPrint');setPrinterPref('bill','Receipt');const printing=printViaQz('bill','<html>Bill</html>');
 await vi.advanceTimersByTimeAsync(5000);expect(await printing).toBe(false);connected();await Promise.resolve();expect(qz.print).not.toHaveBeenCalled();
});
it('shares concurrent connection attempts',async()=>{
 const qz=bridge();qz.websocket.isActive.mockReturnValue(false);window.qz=qz;const {ensureQzConnected}=await import('./qzPrint');
 expect(await Promise.all([ensureQzConnected(),ensureQzConnected()])).toEqual([true,true]);expect(qz.websocket.connect).toHaveBeenCalledTimes(1);
});
it('keeps an already submitted print pending instead of timing out into a duplicate',async()=>{
 const qz=bridge();let finish!:()=>void;qz.print.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));window.qz=qz;
 const {printViaQz,setPrinterPref}=await import('./qzPrint');setPrinterPref('bill','Receipt');let settled=false;const printing=printViaQz('bill','<html>Bill</html>').then(r=>{settled=true;return r;});
 await vi.advanceTimersByTimeAsync(10000);expect(settled).toBe(false);expect(qz.print).toHaveBeenCalledTimes(1);finish();expect(await printing).toBe(true);
});
it('uses browser fallback immediately when no QZ printer is configured',async()=>{
 const {printViaQz}=await import('./qzPrint');expect(await printViaQz('bill','<html>Bill</html>')).toBe(false);expect(document.querySelector('script[data-qz-tray]')).toBeNull();
});
it('does not leave Printer Setup waiting indefinitely for an unresponsive printer list',async()=>{
 const qz=bridge();qz.printers.find.mockImplementation(()=>new Promise<string[]>(()=>{}));window.qz=qz;
 const {listQzPrinters}=await import('./qzPrint');const listing=listQzPrinters();
 await vi.advanceTimersByTimeAsync(4000);expect(await listing).toEqual([]);expect(qz.print).not.toHaveBeenCalled();
});
