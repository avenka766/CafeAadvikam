import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import OfflineBanner from './OfflineBanner';
import {reportConnection} from '@/lib/connectionStatus';
const queue=vi.hoisted(()=>({pending:[] as any[],flushing:false,flush:vi.fn(async()=>{}),discard:vi.fn()}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:Object.assign((select:any)=>select(queue),{getState:()=>queue})}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(select:any)=>select({currentUser:{id:'test-staff'}})}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);reportConnection(true);window.cafeAadvikamDesktop={isElectron:true};queue.pending=[];queue.flush.mockClear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete window.cafeAadvikamDesktop;vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
it('automatically shows offline, then Back online, and hides the notice after four seconds',async()=>{
 await act(async()=>root.render(<OfflineBanner/>));expect(host.textContent).toBe('');
 await act(async()=>window.dispatchEvent(new Event('offline')));expect(host.textContent).toContain('Working offline');expect(host.textContent).toContain('bills are being saved on this computer');
 await act(async()=>window.dispatchEvent(new Event('online')));expect(host.textContent).toBe('Back online');expect(queue.flush).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});expect(host.textContent).toBe('');
});
it('detects a lost API connection while Wi-Fi remains connected and recovers automatically',async()=>{
 const fetch=vi.fn(async()=>new Response('{}',{status:200}));vi.stubGlobal('fetch',fetch);
 await act(async()=>root.render(<OfflineBanner/>));await act(async()=>reportConnection(false));expect(host.textContent).toContain('Working offline');
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(fetch).toHaveBeenCalledTimes(1);expect(host.textContent).toBe('Back online');
 await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});expect(host.textContent).toBe('');
});
it('keeps showing offline if the network drops again before the reconnect notice clears',async()=>{
 await act(async()=>root.render(<OfflineBanner/>));await act(async()=>reportConnection(false));await act(async()=>reportConnection(true));await act(async()=>reportConnection(false));
 await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});expect(host.textContent).toContain('Working offline');
});
it('does not mark a failing service as back online merely because it responds',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));
 await act(async()=>root.render(<OfflineBanner/>));await act(async()=>reportConnection(false));
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(host.textContent).toContain('Working offline');
});
