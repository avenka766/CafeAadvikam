// OS connectivity plus actual API reachability. A Wi-Fi link alone does not prove internet access.
export const CONNECTIVITY_EVENT='cafe:connectivity';
let reachable=typeof navigator==='undefined'||navigator.onLine;
export function connectionIsOnline(){return reachable&&(typeof navigator==='undefined'||navigator.onLine);}
export function reportConnection(online:boolean){
 const next=online&&(typeof navigator==='undefined'||navigator.onLine);
 if(reachable===next)return;
 reachable=next;
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(CONNECTIVITY_EVENT,{detail:{online:next}}));
}
