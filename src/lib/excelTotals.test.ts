import {it,expect} from 'vitest';import {withExcelTotals,withExcelObjectTotals} from './excelTotals';
it('totals money without summing IDs, rates, or duplicating existing totals',()=>{
 const rows=[['Name','Invoice Number','Rate','Line Total'],['A',1,5,10],['B',2,6,20]];
 const result=withExcelTotals<unknown>(rows);expect(result.at(-1)).toEqual(['TOTAL','','',30]);expect(rows).toHaveLength(3);
 expect(withExcelTotals(result)).toEqual(result);
});
it('does not add an incorrect grand total to non-additive metric summaries',()=>{
 expect(withExcelObjectTotals([{Metric:'Sales',Amount:100},{Metric:'Cash',Amount:100}])).toHaveLength(2);
});
it('leaves quantity totals blank when rows mix physical units',()=>{
 expect(withExcelTotals<unknown>([['Name','Qty','Unit','Amount'],['A',2,'kg',10],['B',3,'pcs',20]]).at(-1)).toEqual(['TOTAL','','',30]);
});
