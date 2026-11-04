import {expect,it} from 'vitest';
import {financialLineTotal,financialPercent} from './financialRounding';
it('matches decimal half-paise rounding for fractional kg and percentage deductions',()=>{
 expect(financialLineTotal(.3,40.05)).toBe(12.02);expect(financialLineTotal(1,1.005)).toBe(1.01);
 expect(financialPercent(100.5,1)).toBe(1.01);expect(financialPercent(12.1,5)).toBe(.61);
 expect(financialLineTotal(1e-3,1000)).toBe(1);expect(financialLineTotal(0,0)).toBe(0);
});
it('rejects invalid or unsafe monetary magnitudes',()=>{
 expect(()=>financialLineTotal(NaN,1)).toThrow();expect(()=>financialPercent(1,Infinity)).toThrow();expect(()=>financialLineTotal(-1,1)).toThrow();expect(()=>financialLineTotal(1e30,1)).toThrow();
});
