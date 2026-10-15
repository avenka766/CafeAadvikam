import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerSuggestionsInput, { type PreviousSalesCustomer } from './CustomerSuggestionsInput';
const rpc=vi.hoisted(()=>vi.fn()); vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
let root:Root; let container:HTMLDivElement;
const customers=[{name:'Ramesh',mobile:'9876543210',address:'Hosur'},{name:'Ramesh',mobile:'9999999999',address:'Berigai'}];
function Form({picked}:{picked:(customer:PreviousSalesCustomer)=>void}) { const [name,setName]=useState(''); const [mobile,setMobile]=useState(''); return <><CustomerSuggestionsInput value={name} onChange={setName} onSelect={customer=>{setName(customer.name);setMobile(customer.mobile);picked(customer);}}/><input aria-label="Mobile" value={mobile} readOnly/></>; }
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);rpc.mockReset().mockResolvedValue({data:customers,error:null});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const input=()=>container.querySelector<HTMLInputElement>('[role="combobox"]')!;
async function type(value:string) {await act(async()=>{input().focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));});}
async function settle(){await act(async()=>{await vi.advanceTimersByTimeAsync(260);});}
async function key(value:string){await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));}
it('debounces name lookup and fills both name and mobile after keyboard selection',async()=>{
 const picked=vi.fn();await act(async()=>root.render(<Form picked={picked}/>));
 await type('Ra');expect(rpc).not.toHaveBeenCalled();await settle();
 expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);expect(container.textContent).toContain('9876543210');
 await key('ArrowDown');await key('ArrowDown');await key('Enter');
 expect(picked).toHaveBeenCalledWith(customers[1]);expect(input().value).toBe('Ramesh');expect(container.querySelector<HTMLInputElement>('[aria-label="Mobile"]')!.value).toBe('9999999999');
 expect(input().getAttribute('aria-expanded')).toBe('false');
});
it('supports clicking a name and the visible arrow buttons',async()=>{
 const picked=vi.fn();await act(async()=>root.render(<Form picked={picked}/>));await type('Ram');await settle();
 await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Next customer suggestion"]')!.click());
 expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('9876543210');
 await act(async()=>container.querySelectorAll<HTMLButtonElement>('[role="option"]')[1].click());expect(picked).toHaveBeenCalledWith(customers[1]);
});
it('closes on Escape and permits new customer names when no history matches',async()=>{
 rpc.mockResolvedValue({data:[],error:null});await act(async()=>root.render(<Form picked={vi.fn()}/>));await type('New Customer');await settle();
 expect(container.textContent).toContain('No previous customer found');await key('Escape');expect(input().value).toBe('New Customer');expect(input().getAttribute('aria-expanded')).toBe('false');
});
it('does not offer stale results after a newer query',async()=>{
 let resolveOld!:(value:unknown)=>void;rpc.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({data:[{name:'Bala',mobile:'8888888888',address:''}],error:null});
 await act(async()=>root.render(<Form picked={vi.fn()}/>));await type('Ra');await settle();await type('Ba');await settle();
 await act(async()=>resolveOld({data:customers,error:null}));expect(container.textContent).toContain('Bala');expect(container.textContent).not.toContain('9876543210');
});
