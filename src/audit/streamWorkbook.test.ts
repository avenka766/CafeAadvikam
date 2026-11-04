import {expect,it} from 'vitest';
import * as XLSX from 'xlsx';
import {unzipSync,strFromU8} from 'fflate';
import {streamAuditWorkbook} from './streamWorkbook';
it('creates a readable XLSX with safe strings, typed amounts, working links, frozen headers and every row',()=>{
 const note='A & B <C> "quoted" =SUM(A1) _x000A_\u0001';const bytes=streamAuditWorkbook([{name:'Contents',title:'Audit',columns:[{key:'sheet',header:'Open sheet'}],rows:[{sheet:"Branch's sales"}]},{name:"Branch's sales",title:'Sales INR',columns:[{key:'reference',header:'Invoice'},{key:'amount',header:'Amount INR'},{key:'note',header:'Details'},{key:'active',header:'Active'}],rows:Array.from({length:12001},(_,i)=>({reference:'BILL-'+i,amount:i===0?0:12.34,note:i===0?note:'Saved item '+i,active:true}))}]);
 const book=XLSX.read(bytes,{type:'array',cellStyles:true});expect(book.SheetNames).toEqual(['Contents',"Branch's sales"]);const sheet=book.Sheets["Branch's sales"];expect(sheet.A12005.v).toBe('BILL-12000');expect(sheet.B5.v).toBe(0);expect(sheet.B6.v).toBe(12.34);expect(sheet.B6.z).toBe('#,##0.00');expect(sheet.C5.v).toBe(note);expect(sheet.D5.v).toBe(true);expect(book.Sheets.Contents.A5.l?.Target).toContain("Branch''s sales");expect(sheet.B2.l?.Target).toContain('Contents');expect(sheet['!autofilter']?.ref).toBe('A4:D12005');
 const xml=strFromU8(unzipSync(new Uint8Array(bytes))['xl/worksheets/sheet2.xml']);expect(xml).toContain('ySplit="4"');expect(xml).toContain('state="frozen"');expect(xml).not.toContain('<f>');
}, 15000);
