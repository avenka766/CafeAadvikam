import {it,expect,vi} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
import * as Excel from 'xlsx';
import {utils,writeFile} from './safeSpreadsheet';
it('writes a real Excel filter range excluding totals and preserves contract team values',async()=>{
 let file:NodeBlob|undefined;
 vi.stubGlobal('Blob',NodeBlob);
 vi.spyOn(URL,'createObjectURL').mockImplementation(value=>{file=value as unknown as NodeBlob;return 'blob:fixture';});
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{
  const wb=utils.book_new(),sheet=utils.aoa_to_sheet([['Report'],[],['Name','Amount','Contract Team'],['Employee',1800,'Bala team'],['TOTAL',1800,'']]);
  sheet['!autofilter']={startRow:2,endRow:3,endColumn:2};utils.book_append_sheet(wb,sheet,'Payroll');writeFile(wb,'fixture.xlsx');
  const read=Excel.read(new Uint8Array(await file!.arrayBuffer()),{type:'array'});
  expect(read.Sheets.Payroll['!autofilter']).toEqual({ref:'A3:C4'});
  expect(read.Sheets.Payroll.C4.v).toBe('Bala team');expect(read.Sheets.Payroll.B4.v).toBe(1800);
 }finally{vi.unstubAllGlobals();vi.restoreAllMocks();}
});
