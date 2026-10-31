import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {AuditScroll} from './AuditScroll';
import {auditChartGroups} from './AuditVisuals';
it('offers horizontal controls above a wide table and synchronizes them with native scrolling',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const width=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(400);const full=vi.spyOn(HTMLElement.prototype,'scrollWidth','get').mockReturnValue(1200);const host=document.createElement('div');const root=createRoot(host);
 try{await act(async()=>root.render(<AuditScroll><table><tbody><tr><td>Full table</td></tr></tbody></table></AuditScroll>));const slider=host.querySelector<HTMLInputElement>('input[type=range]')!;expect(slider).not.toBeNull();expect(slider.max).toBe('800');await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Scroll table right"]')!.click());expect(slider.value).toBe('280');const scroller=host.querySelector('table')!.parentElement!;await act(async()=>{scroller.scrollLeft=500;scroller.dispatchEvent(new Event('scroll'));});expect(slider.value).toBe('500');await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Scroll table left"]')!.click());expect(slider.value).toBe('220');}
 finally{await act(async()=>root.unmount());width.mockRestore();full.mockRestore();vi.unstubAllGlobals();}
});
it('keeps all records represented when chart groups are combined and preserves signed amounts',()=>{
 const rows=Array.from({length:12},(_,i)=>({branch:'Group '+i,amount:i-2}));const result=auditChartGroups(rows,'branch','amount');expect(result).toHaveLength(9);expect(result.reduce((s,r)=>s+r.value,0)).toBe(rows.reduce((s,r)=>s+r.amount,0));expect(auditChartGroups(rows,'branch').reduce((s,r)=>s+r.value,0)).toBe(12);
});
