import {act,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),user:{id:'admin-fixture',role:'admin'}}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(select:(s:unknown)=>unknown)=>select({currentUser:mocks.user})}));
import AdminPayrollGate from './AdminPayrollGate';
afterEach(()=>{vi.clearAllMocks();});
it('does not mount payroll until server approval, rejects wrong passwords, and relocks on leaving',async()=>{
 (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
 const load=vi.fn();
 function Payroll(){useEffect(()=>{load();},[]);return <p>Private payroll</p>;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const show=()=>root.render(<AdminPayrollGate><Payroll/></AdminPayrollGate>);
 try {
  await act(async()=>show());expect(load).not.toHaveBeenCalled();
  const input=host.querySelector('input')!;
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
  await act(async()=>{setter.call(input,'fixture-secret');input.dispatchEvent(new Event('input',{bubbles:true}));});
  mocks.rpc.mockResolvedValueOnce({data:false,error:null});
  await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(host.querySelector('[role=alert]')).not.toBeNull();expect(load).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({data:true,error:null});
  await act(async()=>{setter.call(input,'fixture-secret');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(load).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Private payroll');
  await act(async()=>root.render(null));await act(async()=>show());
  expect(host.querySelector('form')).not.toBeNull();expect(host.textContent).not.toContain('Private payroll');
 } finally {await act(async()=>root.unmount());host.remove();}
});
