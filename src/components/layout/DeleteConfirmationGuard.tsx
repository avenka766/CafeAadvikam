import {useEffect} from 'react';

export function deleteConfirmation(button:HTMLElement):string|null {
 const label=[button.getAttribute('aria-label'),button.getAttribute('title'),button.getAttribute('value'),button.textContent].filter(Boolean).join(' ').trim();
 const destructive=button.hasAttribute('data-delete-confirmation')||/\b(delete|remove|discard|archive)\b/i.test(label)||!!button.querySelector('.lucide-trash,.lucide-trash-2');
 if(!destructive||button.hasAttribute('disabled')) return null;
 // Existing confirmation dialogs already require the explicit final choice.
 if(button.closest('[role="alertdialog"],[data-delete-confirmed]'))return null;
 return button.dataset.deleteConfirmation||'Are you sure you want to delete or remove this item? Choose Cancel to keep it.';
}

/** Capture clicks before React handlers, including keyboard-generated clicks. */
export default function DeleteConfirmationGuard(){
 useEffect(()=>{
  const confirm=(event:MouseEvent)=>{
   const button=event.target instanceof Element?event.target.closest<HTMLElement>('button,a,[role="button"],[role="menuitem"],input[type="button"],input[type="submit"]'):null;
   if(!button)return;
   const message=deleteConfirmation(button);
   if(message&&!window.confirm(message)){event.preventDefault();event.stopImmediatePropagation();}
  };
  document.addEventListener('click',confirm,true);
  return()=>document.removeEventListener('click',confirm,true);
 },[]);
 return null;
}
