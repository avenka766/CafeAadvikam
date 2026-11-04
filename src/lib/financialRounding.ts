/** Decimal multiplication rounded to paise, matching PostgreSQL numeric round. */
function decimal(value:number):[bigint,number]{
 if(!Number.isFinite(value)||value<0)throw Error('Enter a finite nonnegative money value.');
 const [coefficient,exponent='0']=String(value).toLowerCase().split('e');
 const [whole,fraction='']=coefficient.split('.');let scale=fraction.length-Number(exponent);let digits=BigInt(whole+fraction);
 if(scale<0){digits*=10n**BigInt(-scale);scale=0;}return [digits,scale];
}
function product(a:number,b:number,extraScale:number):number{
 const [left,ls]=decimal(a),[right,rs]=decimal(b);let n=left*right;const scale=ls+rs+extraScale;
 if(scale>2){const divisor=10n**BigInt(scale-2);n=n/divisor+(n%divisor*2n>=divisor?1n:0n);}else n*=10n**BigInt(2-scale);
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Money value exceeds the supported range.');return Number(n)/100;
}
export const financialLineTotal=(quantity:number,price:number)=>product(quantity,price,0);
export const financialPercent=(amount:number,percent:number)=>product(amount,percent,2);
