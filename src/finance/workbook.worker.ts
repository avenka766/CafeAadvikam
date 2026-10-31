import {financeWorkbook,type FinanceExport} from './workbook';
import {streamAuditWorkbook} from '@/audit/streamWorkbook';
self.onmessage=(event:MessageEvent<FinanceExport>)=>{try{const bytes=streamAuditWorkbook(financeWorkbook(event.data));self.postMessage({bytes},{transfer:[bytes]});}catch(e){self.postMessage({error:(e as Error).message});}};
