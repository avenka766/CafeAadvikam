/** Keep a GRN number across an uncertain response/reload. Never send an unpersisted intent. */
export async function pendingGrnRequest(staffId:string,payload:unknown){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value)));
 const digest=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 const key=`pending-store-grn:${staffId}:${digest}`;
 let number=localStorage.getItem(key);
 if(!number){number='GRN-'+crypto.randomUUID().replaceAll('-','').toUpperCase();localStorage.setItem(key,number);}
 return {number,confirmed:()=>localStorage.removeItem(key)};
}
