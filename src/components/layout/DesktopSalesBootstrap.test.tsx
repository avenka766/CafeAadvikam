import {act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({user:{id:'staff',role:'planner'},oldSync:vi.fn(async()=>{throw Error('One old receipt requires review');}),sync:vi.fn(async()=>{}),prepare:vi.fn(async()=>{}),repair:vi.fn(async()=>({errors:[],remaining:0}))}));
vi.mock('@/stores/authStore',()=>({useAuthStore:Object.assign((select:any)=>select({currentUser:api.user}),{getState:()=>({currentUser:api.user})})}));
vi.mock('@/bakery/desktopSales',()=>({desktopSalesAvailable:()=>true,desktopSalesSnapshot:async()=>({receipts:[]}),desktopSalesCall:(op:string)=>op==='repair-backups'?api.repair():Promise.resolve(null),syncDesktopSales:api.oldSync}));
vi.mock('@/lib/desktopBilling',()=>({billingSnapshot:async()=>({actions:[]}),restoreBillingActions:async()=>{},syncBillingActions:api.sync,maintainBillingNumbers:api.prepare,reprintDesktopBill:vi.fn()}));
import Bootstrap from './DesktopSalesBootstrap';
it('continues other bill uploads, number preparation and backup repair when an older sale fails',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);const host=document.createElement('div');const root=createRoot(host);
 try{await act(async()=>root.render(<Bootstrap/>));expect(api.oldSync).toHaveBeenCalled();expect(api.sync).toHaveBeenCalled();expect(api.prepare).toHaveBeenCalled();expect(api.repair).toHaveBeenCalled();expect(host.textContent).toContain('One old receipt requires review');}finally{await act(async()=>root.unmount());vi.restoreAllMocks();vi.unstubAllGlobals();}
});
