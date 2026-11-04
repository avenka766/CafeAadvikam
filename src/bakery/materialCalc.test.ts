import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({calculate:vi.fn()}));
vi.mock('./recipeStore',()=>({useRecipeStore:{getState:()=>({getRecipe:()=>({outputUnit:'kg',materials:[]}),calculateMaterials:mocks.calculate})}}));
vi.mock('./itemMatcher',()=>({pcsToKg:vi.fn(),resolveItemWeightGrams:()=>undefined}));
import {combinedMaterialsForItems} from './materialCalc';
const items=[{itemId:'first',itemName:'First',quantity:1,dispatchUnit:'kg' as const},{itemId:'second',itemName:'Second',quantity:1,dispatchUnit:'kg' as const}];
beforeEach(()=>mocks.calculate.mockReset());
it('converts grams and kilograms before adding the same material',()=>{
 mocks.calculate.mockReturnValueOnce([{material:'Flour',quantity:1,unit:'kg'}]).mockReturnValueOnce([{material:' flour ',quantity:500,unit:'g'}]);
 expect(combinedMaterialsForItems(items)).toEqual([{material:'Flour',quantity:1.5,unit:'kg'}]);
});
it('converts millilitres and litres before combining',()=>{
 mocks.calculate.mockReturnValueOnce([{material:'Oil',quantity:1,unit:'L'}]).mockReturnValueOnce([{material:'Oil',quantity:250,unit:'ml'}]);
 expect(combinedMaterialsForItems(items)[0]).toMatchObject({quantity:1.25,unit:'ltr'});
});
it('blocks incompatible mass and volume instead of adding their raw numbers',()=>{
 mocks.calculate.mockReturnValueOnce([{material:'Ghee',quantity:1,unit:'kg'}]).mockReturnValueOnce([{material:'Ghee',quantity:1,unit:'ltr'}]);
 expect(()=>combinedMaterialsForItems(items)).toThrow('units disagree');
});
it.each([NaN,Infinity,-1])('rejects invalid recipe quantity %s',quantity=>{
 mocks.calculate.mockReturnValue([{material:'Flour',quantity,unit:'kg'}]);expect(()=>combinedMaterialsForItems(items)).toThrow('Invalid recipe');
});
