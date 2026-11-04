import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({collect:vi.fn()}));
vi.mock('./branchStore',()=>({useBranchStore:(selector:any)=>selector({collectAdvanceBalance:m.collect})}));
import {AdvancePaymentsTab} from './tabs/AdvancePaymentsTab';
import type {BranchAdvanceOrder} from './branchStore';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
beforeEach(()=>{m.collect.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const order={id:'one',branch:'SNB',orderNo:'SNB-ADV-TEST',customerName:'Customer',items:[{itemName:'Bun',quantity:3,lineTotal:30}],subtotal:30,advanceAmount:10,advanceMethod:'cash',balanceDue:20,soldBy:'Cashier',createdAt:'2026-11-03T10:00:00Z',status:'pending',dispatchedAt:'2026-11-03T11:00:00Z'} as BranchAdvanceOrder;
it('hides collection for an already finalized order and shows its actual invoice reference',async()=>{
 await act(async()=>root.render(<AdvancePaymentsTab branch="SNB" advanceOrders={[{...order,finalizedInMain:true,mainFinalBillNo:'SNB-123'}]}/>));
 expect(host.textContent).toContain('Final invoice: SNB-123');expect(host.textContent).toContain('Do not collect this balance again');
 expect([...host.querySelectorAll('button')].some(b=>b.textContent?.includes('Collect ₹'))).toBe(false);expect(m.collect).not.toHaveBeenCalled();
 expect(host.textContent).not.toContain('Fully Settled');
});
it('keeps collection available for a genuinely pending dispatched order',async()=>{
 await act(async()=>root.render(<AdvancePaymentsTab branch="SNB" advanceOrders={[order]}/>));
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Collect ₹20'))!.click();});
 expect(m.collect).toHaveBeenCalledWith('SNB','one','cash');
});
