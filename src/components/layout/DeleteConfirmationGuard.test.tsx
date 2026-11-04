import {expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import DeleteConfirmationGuard,{deleteConfirmation} from './DeleteConfirmationGuard';
it('recognizes named and icon-only deletion without intercepting ordinary actions',()=>{
 const b=document.createElement('button');b.innerHTML='<svg class="lucide-trash-2"></svg>';expect(deleteConfirmation(b)).toContain('Are you sure');
 b.innerHTML='Save';expect(deleteConfirmation(b)).toBeNull();b.textContent='Delete';b.disabled=true;expect(deleteConfirmation(b)).toBeNull();
});
it('blocks the operation on cancel and proceeds only on confirmation',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const action=vi.fn();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await act(async()=>root.render(<><DeleteConfirmationGuard/><button onClick={action}>Delete record</button></>));
 host.querySelector('button')!.click();expect(action).not.toHaveBeenCalled();confirm.mockReturnValue(true);host.querySelector('button')!.click();expect(action).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());host.remove();confirm.mockRestore();
});
