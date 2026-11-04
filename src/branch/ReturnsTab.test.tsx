import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({add:vi.fn(),fetch:vi.fn(),history:vi.fn(),print:vi.fn()}));
vi.mock('@/lib/supabase',()=>{const bill={id:'bill',bill_no:'SNB-1',invoice_no:1,bill_type:'counter',subtotal:100,discount:20,tax:0,total:80,tendered:80,balance:0,status:'original',created_at:'2026-11-03T10:00:00Z',branch_bill_items:[{item_name:'Bun',quantity:4,unit:'pcs',unit_price:25,line_total:100}],branch_sale_payments:[{payment_mode:'cash',amount:80}]};const q:any=new Proxy({}, {get:(_,key)=>key==='maybeSingle'?async()=>({data:bill,error:null}):()=>q});return {supabase:{from:()=>q},fetchAllRows:m.history};});
vi.mock('@/stores/authStore',()=>({useAuthStore:()=>({currentUser:{id:'staff',username:'Fixture'}})}));
vi.mock('./branchOpsStore',()=>({money:(v:number)=>`₹${v}`,useBranchOpsStore:()=>({returns:[],addReturn:m.add})}));
vi.mock('./branchStore',()=>({useBranchStore:()=>({fetchBranchData:m.fetch})}));
vi.mock('@/bakery/bakeryStore',()=>({useBakeryStore:()=>({})}));
vi.mock('./printUtils',()=>({printCounterBill:m.print,printHtml:vi.fn(),printBranchCashierClosure:vi.fn(),printCounterOpenSlip:vi.fn(),printCounterCloseSlip:vi.fn()}));
import {ReturnsTab} from './tabs/BranchBusinessModules';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{localStorage.clear();m.add.mockReset();m.fetch.mockReset().mockResolvedValue(undefined);m.history.mockReset().mockResolvedValue({data:[],error:null});m.print.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
async function change(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function search(){await act(async()=>root.render(<ReturnsTab branch="SNB" branchStock={[]}/>));await change(host.querySelector('input')!,'SNB-1');await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Search')!.click();});}
const confirmed={id:'return',branch:'SNB',returnNo:'SNB-RET-1',originalBillNo:'SNB-1',originalPaymentMode:'cash',items:[{itemName:'Bun',quantity:2,unit:'pcs',price:20,lineTotal:40,tax:0,discount:0}],total:40,refundAmount:40,creditAdjusted:0,returnPayMode:'cash',returnedBy:'Fixture',reason:'Fixture',createdAt:'2026-11-03T10:00:00Z'};
it('prevents double submission and prints only the confirmed server values',async()=>{
 let finish!:(value:unknown)=>void;m.add.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await search();await change(host.querySelector('input[type=number]')!,'2');
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Print Return Bill'))!;
 await act(async()=>{button.click();button.click();});expect(m.add).toHaveBeenCalledTimes(1);expect(m.print).not.toHaveBeenCalled();
 await act(async()=>finish(confirmed));expect(m.print).toHaveBeenCalledTimes(1);expect(m.print.mock.calls[0][0]).toMatchObject({total:40,tendered:40,billNo:'SNB-RET-1'});
});
it('restores an uncertain return without rejecting it as already fully returned',async()=>{
 const input={p_branch:'SNB',p_bill_no:'SNB-1',p_payment_mode:'cash',p_reason:'Saved request',p_items:confirmed.items,p_request:'same-request'};
 localStorage.setItem('branch-return:staff:SNB:SNB-1',JSON.stringify(input));m.add.mockResolvedValue({...confirmed,duplicate:true});await search();expect(host.textContent).toContain('A saved return needs confirmation');expect(m.history).not.toHaveBeenCalled();
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Print Return Bill'))!.click();});expect(m.add).toHaveBeenCalledTimes(1);expect(m.print.mock.calls[0][1]).toBe(true);
});
it('does not allow a refund when prior return history is incomplete',async()=>{
 m.history.mockResolvedValue({data:[],error:'Timeout'});await search();expect(host.textContent).toContain('Previous returns could not load');expect(m.add).not.toHaveBeenCalled();expect(m.print).not.toHaveBeenCalled();
});
