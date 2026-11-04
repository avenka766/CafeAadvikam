import {expect,it} from 'vitest';
import {isGstCheckedBill} from './gstBillFilter';
it('includes only an explicitly persisted GST checkbox',()=>{
 expect([{isGstInvoice:true},{isGstInvoice:false},{}].filter(isGstCheckedBill)).toEqual([{isGstInvoice:true}]);
});
