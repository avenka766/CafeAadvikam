import {describe,it,expect} from 'vitest';
import {allowsFlexibleBranchStock as flexible} from './flexibleStock';
describe('Branch flexible stock categories',()=>{
 it('allows the exact SNB festival category, including case and whitespace variations',()=>{for(const category of ['Dasara & Diwali Items',' DASARA  & DIWALI ITEMS ','Dasara and Diwali Items'])expect(flexible('SNB',{category})).toBe(true);});
 it('preserves existing SNB Mix & Combo and VRSNB MIX behavior',()=>{expect(flexible('SNB',{category:'Mix & Combo'})).toBe(true);expect(flexible('SNB',{category:'Mix and Combo'})).toBe(true);expect(flexible('VRSNB',{category:'MIX'})).toBe(true);});
 it('keeps other categories and branches stock restricted',()=>{for(const branch of ['VRSNB','Hosur'])expect(flexible(branch,{category:'Dasara & Diwali Items'})).toBe(false);for(const category of ['Bombay Mixture','Diwali sweets','Other Dasara & Diwali Items','MIX'])expect(flexible('SNB',{category})).toBe(false);expect(flexible('SNB',null)).toBe(false);});
});
