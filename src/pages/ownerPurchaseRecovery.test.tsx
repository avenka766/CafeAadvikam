import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),load:vi.fn(),po:vi.fn()}));
vi.mock('@/bakery/invoiceStore',()=>({useInvoiceStore:()=>({invoices:[],load:m.load})}));
vi.mock('@/bakery/purchaseOrderStore',()=>({usePurchaseOrderStore:()=>({orders:[],load:m.po})}));
vi.mock('@/lib/supabase',()=>{const q:any=new Proxy({}, {get:(_,key)=>key==='then'?(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve):()=>q});return {fetchAllRows:m.fetch,supabase:{from:()=>q,rpc:()=>q,channel:()=>q,removeChannel:vi.fn()}};});
import {OwnerPurchasesTab} from './OwnerDashboard';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});
let root:Root,host:HTMLDivElement;afterEach(()=>{act(()=>root?.unmount());host?.remove();vi.clearAllMocks();});
it('blocks incomplete purchase data and retries only the failed source',async()=>{
 m.fetch.mockResolvedValueOnce({data:[{grand_total:999}],error:'Statement timeout'}).mockResolvedValue({data:[],error:null});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<OwnerPurchasesTab/>));
 const q:any={select:vi.fn(()=>q),or:vi.fn(()=>q),order:vi.fn(()=>q)};m.fetch.mock.calls[0][1](q);expect(q.or.mock.calls[0][0]).toContain('delivery_date.gte.');expect(q.or.mock.calls[0][0]).toContain('delivery_date.is.null');
 expect(host.textContent).toContain('Purchase data is incomplete');expect(host.textContent).toContain('Statement timeout');expect(host.textContent).not.toContain('999');
 const retry=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Retry purchase details only')!;expect(retry).toBeTruthy();
 await act(async()=>retry.click());expect(m.fetch).toHaveBeenCalledTimes(2);expect(m.load).toHaveBeenCalledTimes(1);expect(m.po).toHaveBeenCalledTimes(1);expect(host.textContent).not.toContain('Purchase data is incomplete');
});
