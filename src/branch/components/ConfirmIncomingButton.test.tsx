import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import ConfirmIncomingButton from './ConfirmIncomingButton';
let root:Root; let container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('only submits once when rapidly double-clicked',async()=>{
  let finish!:(value:null)=>void; const onConfirm=vi.fn(()=>new Promise<null>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<ConfirmIncomingButton onConfirm={onConfirm}/>));
  const button=container.querySelector('button')!;
  await act(async()=>{button.click();button.click();});
  expect(onConfirm).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
  await act(async()=>finish(null)); expect(container.textContent).toContain('Added');
});
it('keeps a specific error visible and supports a safe retry',async()=>{
  const onConfirm=vi.fn().mockResolvedValueOnce('Planner must resolve the requested return.').mockResolvedValueOnce(null);
  await act(async()=>root.render(<ConfirmIncomingButton onConfirm={onConfirm}/>));
  await act(async()=>container.querySelector('button')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Planner must resolve');
  expect(container.textContent).not.toContain('Added');
  await act(async()=>container.querySelector('button')!.click()); expect(container.textContent).toContain('Added');
});
it('recovers from a thrown connection failure instead of staying on loading',async()=>{
  await act(async()=>root.render(<ConfirmIncomingButton onConfirm={vi.fn().mockRejectedValue(new Error('Connection interrupted'))}/>));
  await act(async()=>container.querySelector('button')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Connection interrupted');
  expect(container.querySelector('button')!.disabled).toBe(false);
});
