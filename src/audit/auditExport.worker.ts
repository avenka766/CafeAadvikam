import {auditWorkbook} from './workbook';
import {streamAuditWorkbook} from './streamWorkbook';
import type {AuditSnapshot} from './sources';
const scope=self as unknown as {onmessage:((event:MessageEvent<{snapshot:AuditSnapshot;from:string;to:string;branch:string}>)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=event=>{
 try{const {snapshot,from,to,branch}=event.data;const sheets=auditWorkbook(snapshot,from,to,branch);const bytes=streamAuditWorkbook(sheets,progress=>scope.postMessage({progress}));scope.postMessage({bytes},[bytes]);}
 catch(error){scope.postMessage({error:(error as Error).message});}
};
