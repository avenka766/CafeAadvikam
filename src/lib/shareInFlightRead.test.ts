import {expect,it,vi} from 'vitest';
import {shareInFlightRead} from './shareInFlightRead';
it('shares concurrent reads but fetches again after completion',async()=>{
 let finish!:(value:number)=>void;const load=vi.fn(()=>new Promise<number>(resolve=>{finish=resolve;}));
 const a=shareInFlightRead('session-a',load),b=shareInFlightRead('session-a',load);await Promise.resolve();expect(load).toHaveBeenCalledTimes(1);finish(5);expect(await a).toBe(5);expect(await b).toBe(5);
 const c=shareInFlightRead('session-a',load);await Promise.resolve();expect(load).toHaveBeenCalledTimes(2);finish(6);expect(await c).toBe(6);
});
it('does not retain failed reads or share another session',async()=>{
 const load=vi.fn().mockRejectedValueOnce(Error('Timeout')).mockResolvedValue(2);
 await expect(shareInFlightRead('failed',load)).rejects.toThrow('Timeout');expect(await shareInFlightRead('failed',load)).toBe(2);expect(await shareInFlightRead('another',load)).toBe(2);expect(load).toHaveBeenCalledTimes(3);
});
