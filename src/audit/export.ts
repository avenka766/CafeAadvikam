import type {AuditSnapshot} from './sources';
export {auditWorkbook} from './workbook';
export async function downloadAuditWorkbook(filename:string,snapshot:AuditSnapshot,from:string,to:string,branch:string,onProgress?:(message:string)=>void){
 return new Promise<void>((resolve,reject)=>{
  const worker=new Worker(new URL('./auditExport.worker.ts',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Workbook preparation timed out. Choose a smaller date range and try again.'));},180000);
  const finish=()=>{clearTimeout(timer);worker.terminate();};
  worker.onerror=event=>{finish();reject(Error(event.message||'Excel worker failed.'));};
  worker.onmessage=(event:MessageEvent<{bytes?:ArrayBuffer;error?:string;progress?:string}>)=>{
   if(event.data.progress){onProgress?.(event.data.progress);return;}
   finish();if(event.data.error||!event.data.bytes){reject(Error(event.data.error||'No Excel file was generated.'));return;}
   try{const blob=new Blob([event.data.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);resolve();}catch(e){reject(e);}
  };
  worker.postMessage({snapshot,from,to,branch});
 });
}
