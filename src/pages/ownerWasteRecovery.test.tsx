import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@/lib/supabase',()=>{const q:any=new Proxy({}, {get:(_,key)=>key==='then'?(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve):()=>q});return {fetchAllRows:m.fetch,supabase:{from:()=>q,rpc:()=>q,channel:()=>q,removeChannel:vi.fn()}};});
import {WasteLogsTab} from './OwnerDashboard';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});
let root:Root,host:HTMLDivElement;afterEach(()=>{act(()=>root?.unmount());host?.remove();vi.clearAllMocks();});
it('blocks partial branch losses and retries only that source',async()=>{
 let branchCalls=0;
 m.fetch.mockImplementation(async(table:string)=>table==='branch_waste_logs'&&++branchCalls===1?{data:[{id:'partial',branch:'SNB',item_name:'Partial item',quantity:999}],error:'Statement timeout'}:{data:[],error:null});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<WasteLogsTab/>));
 expect(host.textContent).toContain('Branch waste data is incomplete');expect(host.textContent).not.toContain('Partial item');expect(host.textContent).not.toContain('No branch waste logs for this period');
 const kitchenBefore=m.fetch.mock.calls.filter(c=>c[0]==='kitchen_waste_log').length;
 const retry=[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry branch waste only')!;expect(retry).toBeTruthy();
 await act(async()=>retry.click());expect(host.textContent).not.toContain('Branch waste data is incomplete');expect(m.fetch.mock.calls.filter(c=>c[0]==='kitchen_waste_log')).toHaveLength(kitchenBefore);
 const q:any={select:vi.fn(()=>q),gte:vi.fn(()=>q),lt:vi.fn(()=>q),order:vi.fn(()=>q)};
 m.fetch.mock.calls.find(c=>c[0]==='branch_waste_logs')![1](q);expect(q.lt).toHaveBeenCalledWith('created_at',expect.stringContaining('T00:00:00+05:30'));
});
