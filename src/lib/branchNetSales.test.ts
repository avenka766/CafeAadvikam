import {expect, it} from 'vitest';
import {branchNetSales} from './branchNetSales';
const bill = {id:'1', branch:'SNB', billNo:'SNB-1', status:'original', total:90, createdAt:'2026-11-07'};
const items = [{billId:'1', itemName:'Bun', unit:'pcs', quantity:10, lineTotal:100}];
const receipt = {branch:'SNB', originalBillNo:'SNB-1', returnNo:'RET-1', createdAt:'2026-11-07', amount:18, items:[{itemName:'Bun',unit:'pcs',quantity:2,lineTotal:18}]};
it('reconciles discounted bills, partial returns and earlier-date returns across every sales sheet',()=>{
 const report=branchNetSales([bill],items,[receipt,{...receipt,originalBillNo:'OLD',returnNo:'RET-2',amount:9,items:[{itemName:'Bun',unit:'pcs',quantity:1,lineTotal:9}]}]);
 expect(report.netSales).toBe(63);expect(report.bills[0].netSales).toBe(72);
 expect(report.lines.reduce((s,i)=>s+i.allocatedSales,0)).toBe(63);
 expect(report.items).toEqual([{itemName:'Bun',unit:'pcs',qty:7,revenue:63}]);
 expect(report.bills[1]).toMatchObject({grossSales:0,returns:9,netSales:-9});
});
it('keeps cancelled bills at zero and makes missing item data explicit without dropping money',()=>{
 const report=branchNetSales([bill,{...bill,id:'2',billNo:'CANCEL',status:'cancelled'}],[],[{...receipt,items:[]}]);
 expect(report.bills[1].netSales).toBe(0);expect(report.netSales).toBe(72);
 expect(report.lines.reduce((s,i)=>s+i.allocatedSales,0)).toBe(72);
 expect(report.items.every(i=>i.itemName.includes('unavailable'))).toBe(true);
});
it('keeps unlike units separate and preserves return-only negative totals',()=>{
 const report=branchNetSales([],[],[receipt,{...receipt,returnNo:'RET-2',items:[{itemName:'Bun',unit:'kg',quantity:.5,price:36}]}]);
 expect(report.netSales).toBe(-36);expect(report.items).toHaveLength(2);
 expect(report.items.reduce((s,i)=>s+i.revenue,0)).toBe(-36);
});
