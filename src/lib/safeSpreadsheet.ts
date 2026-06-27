export type CellValue = string | number | boolean | null | undefined | Date;
export type RowObject = Record<string, unknown>;
export type WorkSheet = { name?: string; rows: CellValue[][]; '!cols'?: Array<{ wch?: number }> };
export type WorkBook = { SheetNames: string[]; Sheets: Record<string, WorkSheet> };

const enc = new TextEncoder();
const xml = (v: unknown) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const colName = (n: number) => { let s=''; for (let x=n+1;x;x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s; };
const book_new = (): WorkBook => ({ SheetNames: [], Sheets: {} });
const toCellValue = (v: unknown): CellValue => v == null ? null : typeof v==='string'||typeof v==='number'||typeof v==='boolean'||v instanceof Date ? v : JSON.stringify(v);
const json_to_sheet = (rows: RowObject[]): WorkSheet => { const h=Array.from(rows.reduce((s,r)=>(Object.keys(r).forEach(k=>s.add(k)),s),new Set<string>())); return {rows:[h,...rows.map(r=>h.map(k=>toCellValue(r[k])))]}; };
const aoa_to_sheet = (rows: CellValue[][]): WorkSheet => ({ rows });
const book_append_sheet = (wb: WorkBook, ws: WorkSheet, name: string) => { const safe=(name||`Sheet ${wb.SheetNames.length+1}`).slice(0,31).replace(/[\\/?*:]/g,'-').replace(/\[/g,'-').replace(/\]/g,'-'); ws.name=safe; wb.SheetNames.push(safe); wb.Sheets[safe]=ws; };

const crcTable = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=(b:Uint8Array)=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const u16=(n:number)=>new Uint8Array([n&255,(n>>>8)&255]);
const u32=(n:number)=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const join=(parts:Uint8Array[])=>{const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let x=0;for(const p of parts){o.set(p,x);x+=p.length;}return o;};
function zipStore(files: Array<{name:string;data:string}>): Uint8Array {
  const locals:Uint8Array[]=[]; const centrals:Uint8Array[]=[]; let off=0;
  for(const f of files){const name=enc.encode(f.name),data=enc.encode(f.data),crc=crc32(data);
    const local=join([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    centrals.push(join([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off),name]));
    off+=local.length;
  }
  const cd=join(centrals); return join([...locals,cd,u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(off),u16(0)]);
}
function cellXml(v:CellValue,r:string){ if(v==null)return `<c r="${r}"/>`; if(typeof v==='number'&&Number.isFinite(v))return `<c r="${r}"><v>${v}</v></c>`; if(typeof v==='boolean')return `<c r="${r}" t="b"><v>${v?1:0}</v></c>`; if(v instanceof Date)return `<c r="${r}" t="inlineStr"><is><t>${xml(v.toISOString())}</t></is></c>`; return `<c r="${r}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`; }
function sheetXml(ws:WorkSheet){const rows=ws.rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>cellXml(v,`${colName(j)}${i+1}`)).join('')}</row>`).join(''); const cols=ws['!cols']?.length?`<cols>${ws['!cols'].map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(1,c.wch??12)}" customWidth="1"/>`).join('')}</cols>`:''; return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;}
function writeFile(wb:WorkBook,filename:string){if(typeof document==='undefined')return; const sheets=wb.SheetNames.map((n,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(wb.Sheets[n])})); const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wb.SheetNames.map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`; const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wb.SheetNames.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`; const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${wb.SheetNames.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`; const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`; const bytes=zipStore([{name:'[Content_Types].xml',data:types},{name:'_rels/.rels',data:rootRels},{name:'xl/workbook.xml',data:workbook},{name:'xl/_rels/workbook.xml.rels',data:rels},...sheets]); const blobBytes=Uint8Array.from(bytes); const blob=new Blob([blobBytes.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename.replace(/\.xls$/i,'.xlsx');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export const utils={book_new,json_to_sheet,aoa_to_sheet,book_append_sheet}; export{writeFile}; export default{utils,writeFile};
