// Only these exact catalogue categories can bill through insufficient stock.
// Use the same policy for item selection, quantity changes and checkout checks.
export function allowsFlexibleBranchStock(branch:string,item?:{category:string}|null){
 if(!item)return false;
 const category=item.category.toLowerCase().replace(/\s+/g,' ').trim();
 if(branch==='SNB')return ['mix & combo','mix and combo','dasara & diwali items','dasara and diwali items'].includes(category);
 return branch==='VRSNB'&&category==='mix';
}
