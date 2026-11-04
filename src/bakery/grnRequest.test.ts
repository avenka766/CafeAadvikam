import {beforeEach,expect,it} from 'vitest';import {webcrypto} from 'node:crypto';import {pendingGrnRequest} from './grnRequest';
beforeEach(()=>{localStorage.clear();Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});});
it('reuses a persisted GRN request after an uncertain response and starts a new one after confirmation',async()=>{const first=await pendingGrnRequest('fixture',{amount:100});const retry=await pendingGrnRequest('fixture',{amount:100});expect(retry.number).toBe(first.number);first.confirmed();expect((await pendingGrnRequest('fixture',{amount:100})).number).not.toBe(first.number);});
it('isolates pending invoice identities between staff',async()=>{expect((await pendingGrnRequest('one',{amount:100})).number).not.toBe((await pendingGrnRequest('two',{amount:100})).number);});

it('keeps the same request when an equivalent draft is reconstructed with different property order',async()=>{expect((await pendingGrnRequest('fixture',{amount:100,supplier:'one'})).number).toBe((await pendingGrnRequest('fixture',{supplier:'one',amount:100})).number);});
