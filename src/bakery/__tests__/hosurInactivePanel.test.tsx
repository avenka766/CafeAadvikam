import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),fetch:vi.fn(),counter:vi.fn()}));
vi.mock('../packingCounter',()=>({getPackingCounterStatus:m.counter}));
vi.mock('@/lib/supabase',()=>({supabase:{from:m.from,rpc:vi.fn()},fetchAllRows:m.fetch}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(s:any)=>s({currentUser:{displayName:'Fixture'}})}));
vi.mock('../hosurBillingBridge',()=>({runHosurDispatchAndBillCore:vi.fn(),queueHosurDispatchAndBill:vi.fn(),runHosurLeftoverDispatchCore:vi.fn(),queueHosurLeftoverDispatch:vi.fn()}));
vi.mock('@/pages/HosurDashboard',()=>({notifyAdmin:vi.fn()}));
import HosurShopOrderPanel from '../HosurShopOrderPanel';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
beforeEach(()=>{m.from.mockReset();m.fetch.mockReset().mockResolvedValue({data:[],error:null});m.counter.mockReset().mockResolvedValue({isOpen:true});const query:any=new Proxy({}, {get:(_t,key)=>key==='then'?Promise.resolve({data:[],error:null}).then.bind(Promise.resolve({data:[],error:null})):()=>query});m.from.mockReturnValue(query);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it('loads on entry and pauses when the retained workspace is hidden',async()=>{
 const render=(active:boolean)=>act(async()=>root.render(<HosurShopOrderPanel active={active} section="dispatch"/>));
 await render(false);expect(m.from).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 await render(true);expect(m.from).toHaveBeenCalledTimes(2);expect(m.fetch).toHaveBeenCalledTimes(2);
 await render(false);expect(m.from).toHaveBeenCalledTimes(2);expect(m.fetch).toHaveBeenCalledTimes(2);
 const counterCalls=m.counter.mock.calls.length;await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});expect(m.counter).toHaveBeenCalledTimes(counterCalls);
 await render(true);expect(m.from).toHaveBeenCalledTimes(4);expect(m.fetch).toHaveBeenCalledTimes(4);
});

it.each([false, true])('uses saved GST details or opens the exact shop when missing (saved: %s)', async saved => {
  const shop = { id: 'shop-1', shop_name: 'Fixture Shop', gst_name: saved ? 'Registered Fixture' : null, gstin: saved ? '33ABCDE1234F1Z5' : null };
  const query = m.from.getMockImplementation()!;
  m.from.mockImplementation(table => table === 'hosur_shops'
    ? { select: () => ({ order: async () => ({data: [shop], error: null}) }) }
    : query(table));
  m.fetch.mockImplementation(async table => ({data: table === 'hosur_orders'
    ? [{id: 'order-1', order_number: '42', shop_id: shop.id, shop_name: shop.shop_name, status: 'dispatched'}]
    : [{id: 'line-1', order_id: 'order-1', item_name: 'Bun', unit: 'pcs', quantity: 2, dispatched_quantity: 2, received_quantity: 0, unit_price: 10}], error: null}));
  const openShop = vi.fn();
  await act(async () => root.render(<HosurShopOrderPanel section="dispatch" onOpenShopGst={openShop} />));
  const findButton = (name: string) => [...host.querySelectorAll('button')].find(button => button.textContent?.includes(name));
  await act(async () => findButton('Fixture Shop - #42')!.click());
  const toggle = [...host.querySelectorAll('label')].find(label => label.textContent?.includes('Also generate a GST Tax Invoice'))!.querySelector('input')!;
  expect(findButton('Open this shop in Shop Master')).toBeUndefined();
  await act(async () => toggle.click());
  expect(host.textContent).toContain('Registered GST name (required)');
  expect(host.textContent).toContain('GST number (required)');
  if (saved) {
    expect(findButton('Open this shop in Shop Master')).toBeUndefined();
    expect([...host.querySelectorAll('input[readonly]')].map(input => (input as HTMLInputElement).value)).toEqual(['Registered Fixture', '33ABCDE1234F1Z5']);
  } else {
    await act(async () => findButton('Open this shop in Shop Master')!.click());
    expect(openShop).toHaveBeenCalledWith(shop.id);
  }
});
