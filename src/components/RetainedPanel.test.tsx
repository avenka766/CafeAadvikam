import {act,useEffect,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {RetainedPanel} from './RetainedPanel';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it('does not mount or load an unopened pane and preserves its draft after first visit',async()=>{
 const load=vi.fn(),cleanup=vi.fn();
 function Workspace(){const [draft,setDraft]=useState('');useEffect(()=>{load();return cleanup;},[]);return <input value={draft} onChange={e=>setDraft(e.target.value)}/>;}
 const render=(active:boolean)=>act(async()=>root.render(<RetainedPanel active={active}><Workspace/></RetainedPanel>));
 await render(false);expect(load).not.toHaveBeenCalled();expect(host.querySelector('input')).toBeNull();
 await render(true);expect(load).toHaveBeenCalledTimes(1);const input=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Unfinished sale');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await render(false);expect(host.firstElementChild?.hasAttribute('hidden')).toBe(true);expect(cleanup).not.toHaveBeenCalled();
 await render(true);expect(host.querySelector('input')?.value).toBe('Unfinished sale');expect(load).toHaveBeenCalledTimes(1);
});
