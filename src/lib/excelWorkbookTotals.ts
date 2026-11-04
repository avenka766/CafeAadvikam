import * as XLSX from 'xlsx';import {withExcelTotals} from './excelTotals';
export function addWorkbookTotals(wb:XLSX.WorkBook){
 for(const name of wb.SheetNames){const ws=wb.Sheets[name];const rows=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''});const complete=withExcelTotals(rows);if(complete.length>rows.length)XLSX.utils.sheet_add_aoa(ws,[complete[complete.length-1]],{origin:-1});}
 return wb;
}
