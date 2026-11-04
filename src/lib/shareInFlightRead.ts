const reads=new Map<string,Promise<unknown>>();
/** Share only concurrent reads. Completed results are never reused for a financial save. */
export function shareInFlightRead<T>(key:string,load:()=>PromiseLike<T>):Promise<T>{
 const current=reads.get(key);if(current)return current as Promise<T>;
 const promise=Promise.resolve().then(load);reads.set(key,promise);
 const clear=()=>{if(reads.get(key)===promise)reads.delete(key);};
 void promise.then(clear,clear);return promise;
}
