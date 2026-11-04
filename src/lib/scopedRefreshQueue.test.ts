import {expect,it,vi} from 'vitest';
import {ScopedRefreshQueue} from './scopedRefreshQueue';
it('combines simultaneous widgets into one scoped read',async()=>{
 const queue=new ScopedRefreshQueue<'stock'|'credit'>(),load=vi.fn(async(_scopes:string[])=>{});
 await Promise.all([queue.request('staff:SNB:today',['stock'],false,load),queue.request('staff:SNB:today',['stock','credit'],false,load)]);
 expect(load).toHaveBeenCalledTimes(1);expect(new Set(load.mock.calls[0][0])).toEqual(new Set(['stock','credit']));
});
it('does not mistake a stock refresh for a fresh credit register',async()=>{
 const queue=new ScopedRefreshQueue<'stock'|'credit'>(),load=vi.fn(async(_scopes:string[])=>{});
 await queue.request('SNB',['stock'],false,load);await queue.request('SNB',['credit'],false,load);await queue.request('SNB',['stock'],false,load);
 expect(load.mock.calls.map(call=>call[0])).toEqual([['stock'],['credit']]);
});
it('shares an in-flight read, while coalescing forced updates into one follow-up',async()=>{
 const queue=new ScopedRefreshQueue<'stock'>();let finish!:()=>void;const load=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const first=queue.request('SNB',['stock'],false,load);await Promise.resolve();
 const same=queue.request('SNB',['stock'],false,load),forced=queue.request('SNB',['stock'],true,load),forcedAgain=queue.request('SNB',['stock'],true,load);
 finish();await first;await same;expect(load).toHaveBeenCalledTimes(2);finish();await forced;await forcedAgain;expect(load).toHaveBeenCalledTimes(2);
});
it('does not cache a failed read or mark another staff session fresh',async()=>{
 const queue=new ScopedRefreshQueue<'stock'>(),load=vi.fn().mockRejectedValueOnce(Error('Timeout')).mockResolvedValue(undefined);
 await expect(queue.request('staff-a',['stock'],false,load)).rejects.toThrow('Timeout');await queue.request('staff-a',['stock'],false,load);await queue.request('staff-b',['stock'],false,load);expect(load).toHaveBeenCalledTimes(3);
});
