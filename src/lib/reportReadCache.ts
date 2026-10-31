type ReadResult={error?:unknown};
export type ReportReadFailure={id:string;error:string};
// Cache only within one explicit report load/retry, never across a new range or Refresh.
export class ReportReadCache {
 private generation=0;private values=new Map<string,{source:string;value:unknown}>();private failures=new Map<string,string>();
 reset(){this.generation++;this.values.clear();this.failures.clear();}
 retry(source:string){this.generation++;for(const [key,value] of this.values)if(value.source===source)this.values.delete(key);this.failures.delete(source);}
 get errors():ReportReadFailure[]{return [...this.failures].map(([id,error])=>({id,error}));}
 async read<T extends ReadResult>(source:string,key:string,load:()=>Promise<T>):Promise<T>{
  const saved=this.values.get(key);if(saved)return saved.value as T;
  const generation=this.generation;let value:T;
  try{value=await load();}catch(error){if(generation===this.generation)this.failures.set(source,error instanceof Error?error.message:String(error));throw error;}
  if(generation===this.generation){if(value.error)this.failures.set(source,typeof value.error==='object'&&value.error&&'message' in value.error?String(value.error.message):String(value.error));else this.values.set(key,{source,value});}
  return value;
 }
}
