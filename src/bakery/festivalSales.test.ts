import { expect, it } from 'vitest';
import { createFestivalSaleDrafts, FESTIVAL_SALE_ITEMS, festivalSaleCart } from './festivalSales';

it('starts with the 12 requested packs and an empty custom item, without default prices or quantities', () => {
  const rows = createFestivalSaleDrafts();
  expect(FESTIVAL_SALE_ITEMS).toHaveLength(12);
  expect(rows).toHaveLength(13);
  expect(rows.every(row => row.price === '' && row.quantity === '')).toBe(true);
  expect(festivalSaleCart(rows)).toEqual({lines:[],error:''});
});
it('shows a partially entered item but blocks an incomplete bill', () => {
  const rows=createFestivalSaleDrafts(); rows[0].price='500';
  const result=festivalSaleCart(rows);
  expect(result.lines).toEqual([{itemName:'SPL SWEET MIX 1KG',unit:'pcs',quantity:0,price:500}]);
  expect(result.error).toContain('whole quantity');
  rows[0].price='';rows[0].quantity='2';expect(festivalSaleCart(rows).error).toContain('price');
});
it('bills packs as pieces without converting their weights to kilograms', () => {
  const rows=createFestivalSaleDrafts();rows[0].quantity='3';rows[0].price='575.50';rows[8].quantity='4';rows[8].price='30';
  const result=festivalSaleCart(rows);
  expect(result.error).toBe('');expect(result.lines.every(line=>line.unit==='pcs')).toBe(true);
  expect(result.lines.reduce((sum,line)=>sum+line.price*line.quantity,0)).toBe(1846.5);
});
it('rejects fractional packs, invalid amounts and extra price precision', () => {
  const rows=createFestivalSaleDrafts();rows[0].price='50';
  for(const quantity of ['0','-1','1.5','Infinity']) {rows[0].quantity=quantity;expect(festivalSaleCart(rows).error).toContain('quantity');}
  rows[0].quantity='1';for(const price of ['0','-1','NaN','Infinity','10.005']) {rows[0].price=price;expect(festivalSaleCart(rows).error).toContain('price');}
});
it('requires a custom item name and prevents duplicate names from silently merging', () => {
  const rows=createFestivalSaleDrafts();const custom=rows[12];custom.quantity='2';custom.price='100';
  expect(festivalSaleCart(rows).error).toContain('name');
  custom.name='Festival gift box';expect(festivalSaleCart(rows).error).toBe('');expect(festivalSaleCart(rows).lines[0].unit).toBe('pcs');
  custom.name='spl sweet mix 1kg';rows[0].quantity='1';rows[0].price='500';expect(festivalSaleCart(rows).error).toContain('already');
});
