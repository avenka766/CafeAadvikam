import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({orders:[] as any[],fetch:vi.fn(),rows:vi.fn(),write:vi.fn()}));
vi.mock('@/branch/branchStore',()=>({useBranchStore:()=>({advanceOrders:{SNB:m.orders},fetchBranchData:m.fetch})}));
vi.mock('@/lib/safeSpreadsheet',()=>({utils:{book_new:()=>({}),json_to_sheet:(rows:any[])=>{m.rows(rows);return {};},book_append_sheet:vi.fn()},writeFile:m.write}));
import AdminAdvanceTab from './AdminAdvanceTab';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;let host:HTMLDivElement,root:Root;
beforeEach(()=>{m.rows.mockReset();m.write.mockReset();m.fetch.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it('exports finalized main-register balances separately without presenting them as collectible',async()=>{
 const base={branch:'SNB',customerName:'Fixture',items:[],subtotal:100,advanceAmount:40,balanceDue:60,advanceMethod:'cash',status:'pending',createdAt:'2026-11-03T10:00:00Z',soldBy:'Fixture'};
 m.orders=[{...base,id:'closed',orderNo:'SNB-ADV-1',finalizedInMain:true,mainFinalBillNo:'SNB-100'},{...base,id:'open',orderNo:'SNB-ADV-2'}];
 await act(async()=>root.render(<AdminAdvanceTab branches={['SNB']}/>));expect(host.textContent).toContain('Final invoice: SNB-100');
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Excel'))!.click();});
 const rows=m.rows.mock.calls[0][0];expect(rows[0]).toMatchObject({'Status':'Finalized in main register','Final Invoice':'SNB-100','Balance Due (₹)':0,'Historical balance field (₹)':60});expect(rows[1]['Balance Due (₹)']).toBe(60);expect(m.write).toHaveBeenCalledTimes(1);
});
