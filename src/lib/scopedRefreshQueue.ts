/** Coalesce reads without letting a stock-only refresh mark credit/history fresh. */
export class ScopedRefreshQueue<S extends string>{
 private states=new Map<string,{fresh:Map<S,number>;done:Map<S,number>;next:Map<S,number>;pending:Map<S,number>;running:Map<S,number>;busy:boolean;waiters:{targets:Map<S,number>;resolve:()=>void;reject:(cause:unknown)=>void}[]}>();
 constructor(private ttl=60_000){}
 request(key:string,scopes:readonly S[],force:boolean,load:(scopes:S[])=>Promise<void>):Promise<void>{
  let state=this.states.get(key);
  if(!state){state={fresh:new Map(),done:new Map(),next:new Map(),pending:new Map(),running:new Map(),busy:false,waiters:[]};this.states.set(key,state);}
  const targets=new Map<S,number>();
  for(const scope of new Set(scopes)){
   if(!force&&Date.now()-(state.fresh.get(scope)??-Infinity)<this.ttl)continue;
   let version=state.pending.get(scope)??(!force?state.running.get(scope):undefined);
   if(version===undefined){version=(state.next.get(scope)??0)+1;state.next.set(scope,version);state.pending.set(scope,version);}
   targets.set(scope,version);
  }
  if(!targets.size)return Promise.resolve();
  const promise=new Promise<void>((resolve,reject)=>state!.waiters.push({targets,resolve,reject}));
  if(!state.busy){
   state.busy=true;
   // A microtask groups independent widgets mounting in the same render.
   void Promise.resolve().then(async()=>{
    while(state!.pending.size){
     const batch=new Map(state!.pending);state!.pending.clear();state!.running=batch;
     try{
      await load([...batch.keys()]);
      for(const [scope,version] of batch){state!.done.set(scope,version);state!.fresh.set(scope,Date.now());}
     }catch(cause){
      state!.waiters=state!.waiters.filter(waiter=>{
       if([...waiter.targets].some(([scope,version])=>batch.has(scope)&&version<=batch.get(scope)!)){waiter.reject(cause);return false;}return true;
      });
     }
     state!.running=new Map();
     state!.waiters=state!.waiters.filter(waiter=>{
      if([...waiter.targets].every(([scope,version])=>(state!.done.get(scope)??0)>=version)){waiter.resolve();return false;}return true;
     });
    }
    state!.busy=false;
   });
  }
  return promise;
 }
}
