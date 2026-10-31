import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {AuditTable} from './AuditTable';
it('sorts all records before paging and exposes the active direction',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 try{
  await act(async()=>root.render(<AuditTable title="Test register" rows={Array.from({length:55},(_,i)=>({id:i,amount:i+1}))} columns={[{key:'amount',label:'Amount',numeric:true}]}/>));
  const sort=container.querySelector<HTMLButtonElement>('th button')!;await act(async()=>sort.click());await act(async()=>sort.click());
  expect(container.querySelector('th')!.getAttribute('aria-sort')).toBe('descending');expect(container.querySelector('tbody td')!.textContent).toBe('55');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Next')!.click());expect(container.querySelector('tbody td')!.textContent).toBe('5');
 }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
