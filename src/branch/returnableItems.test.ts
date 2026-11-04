import {expect,it} from 'vitest';
import {returnableItems} from './returnableItems';
const item={itemName:'Bun',unit:'pcs' as const,quantity:2,price:25,lineTotal:50,tax:0,discount:0};
it('combines repeated item rows and displays their net refundable unit value',()=>{
 const rows=returnableItems([item,{...item,quantity:2}],80,[]);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({quantity:4,price:20,lineTotal:80});
});
it('shows only quantities not already returned',()=>{
 expect(returnableItems([item],40,[{items:[{itemName:'Bun',unit:'pcs',quantity:1}]}])[0]).toMatchObject({quantity:1,price:20});
 expect(returnableItems([item],40,[{items:[{itemName:'Bun',unit:'pcs',quantity:2}]}])).toEqual([]);
});
it('blocks corrupt history instead of guessing what remains',()=>{
 expect(()=>returnableItems([item],40,[{items:[{itemName:'Bun',quantity:3}]}])).toThrow('exceed');
 expect(()=>returnableItems([item],40,[{items:null}])).toThrow('need review');
});
