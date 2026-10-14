import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContractTeamsPanel from './ContractTeamsPanel';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
let root: Root; let container: HTMLDivElement;
const props = () => ({ teams:[{id:'bala',name:'BALA TEAM'},{id:'bittu',name:'BITTU TEAM'}], employees:[{id:'one',name:'Bala Person',branch:'SNB',department:'Bakery',paymentMode:'BALA TEAM'},{id:'two',name:'Direct Person',branch:'Cafe Aadvikam',department:'Service'}],error:'',onCreated:vi.fn(),onAddNew:vi.fn(),onAssigned:vi.fn() });
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); rpc.mockReset(); container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (text:string) => [...container.querySelectorAll('button')].find(button => button.textContent?.trim()===text)!;
async function change(element:HTMLInputElement|HTMLSelectElement,value:string) {
  await act(async () => { const setter=Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value')!.set!; setter.call(element,value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); });
}
it('shows existing teams and members with creation/addition controls only', async () => {
  const p=props(); await act(async () => root.render(<ContractTeamsPanel {...p} />));
  expect(container.textContent).toContain('BALA TEAM'); expect(container.textContent).toContain('BITTU TEAM'); expect(container.textContent).toContain('Bala Person');
  expect(container.textContent).not.toContain('Delete'); expect(container.textContent).not.toContain('Edit');
  await act(async () => button('Add new person').click()); expect(p.onAddNew).toHaveBeenCalledWith('BALA TEAM');
});
it('saves a new team and displays a database failure without pretending it was created', async () => {
  const p=props(); await act(async () => root.render(<ContractTeamsPanel {...p} />));
  await change(container.querySelector('input[aria-label="New contract team name"]')!,'New Team');
  rpc.mockResolvedValueOnce({data:null,error:{message:'A contract team with this name already exists.'}});
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(p.onCreated).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('already exists');
  rpc.mockResolvedValueOnce({data:{id:'new',name:'NEW TEAM'},error:null});
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(p.onCreated).toHaveBeenCalledWith({id:'new',name:'NEW TEAM'});
});
it('only offers unassigned people and saves their membership in the chosen team', async () => {
  const p=props(); await act(async () => root.render(<ContractTeamsPanel {...p} />));
  await act(async () => button('Add existing person').click());
  const select=container.querySelector('select')!; expect(select.textContent).toContain('Direct Person'); expect(select.textContent).not.toContain('Bala Person');
  await change(select,'two'); rpc.mockResolvedValueOnce({data:{members:1},error:null});
  await act(async () => button('Add to team').click());
  expect(rpc).toHaveBeenCalledWith('add_attendance_contract_members',{p_team_id:'bala',p_employee_ids:['two']});
  expect(p.onAssigned).toHaveBeenCalledWith(['two'],'BALA TEAM');
});
