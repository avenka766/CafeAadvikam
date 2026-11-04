/** Totals apply to additive numeric fields, never rates, identifiers or KPI summaries. */
export function withExcelTotals<T>(source:T[][]):T[][]{
 const rows=source.map(r=>[...r]);
 const header=rows.findIndex(r=>r.filter(v=>typeof v==='string'&&v.trim()).length>=2);
 if(header<0||rows.length<=header+1)return rows;
 const labels=rows[header].map(String);
 if(labels.some(h=>/^metric$/i.test(h))||rows.slice(header+1).some(r=>r.some(v=>typeof v==='string'&&/^(grand\s+total|total)(\s|$)/i.test(v.trim()))))return rows;
 const unitIndex=labels.findIndex(h=>/^(unit|uom)$/i.test(h));
 const mixedUnits=unitIndex>=0&&new Set(rows.slice(header+1).map(r=>String(r[unitIndex]||'')).filter(Boolean)).size>1;
 const totals:Array<string|number>=labels.map((label,i)=>{
  if(/(^#|(^|[ _])(id|no|number|barcode|phone|mobile|year|month|day)([ _.]|$)|rate|unit.?price|(^| )price$|%|percentage|account)/i.test(label.replace(/([a-z])([A-Z])/g,'$1 $2')))return '';
  if(mixedUnits&&/qty|quantity/i.test(label))return '';
  const numbers=rows.slice(header+1).map(r=>r[i]).filter((v):v is T & number=>typeof v==='number'&&Number.isFinite(v));
  return numbers.length?Math.round(numbers.reduce((sum,n)=>sum+Number(n),0)*100)/100:'';
 });
 if(!totals.some(v=>typeof v==='number'))return rows;
 const labelColumn=labels.findIndex((_label,i)=>totals[i]==='');totals[Math.max(0,labelColumn)]='TOTAL';
 rows.push(totals as T[]);return rows;
}
export function withExcelObjectTotals<T extends Record<string,unknown>>(rows:T[]):T[]{
 if(!rows.length)return rows;
 const headers=[...new Set(rows.flatMap(Object.keys))];
 const complete=withExcelTotals<unknown>([headers,...rows.map(r=>headers.map(h=>r[h]??''))]);
 return complete.length>rows.length+1?[...rows,Object.fromEntries(headers.map((h,i)=>[h,complete[complete.length-1][i]])) as T]:rows;
}
