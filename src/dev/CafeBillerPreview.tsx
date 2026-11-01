// Standalone local layout preview. No real sessions, orders or external requests.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import '@/index.css';
import type {MenuItem} from '@/types';

if(!import.meta.env.DEV)throw new Error('The Cafe layout preview is development-only.');
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin===location.origin)return nativeFetch(input,init);
 const method=init?.method||(input instanceof Request?input.method:'GET');
 return new Response(method==='GET'?'[]':JSON.stringify({message:'Preview only: saving and printing are disabled.'}),{status:method==='GET'?200:403,headers:{'Content-Type':'application/json'}});
};
window.print=()=>window.alert('This is a layout preview. Printing is disabled.');
const [{useAuthStore},{useMenuStore},{useMenuCategoryStore},{useOrderStore},{useBranchOpsStore},{useBranchStore},{useWalletPromotionStore}]=await Promise.all([
 import('@/stores/authStore'),import('@/stores/menuStore'),import('@/stores/menuCategoryStore'),import('@/stores/orderStore'),import('@/branch/branchOpsStore'),import('@/branch/branchStore'),import('@/stores/walletPromotionStore'),
]);
// Do not persist preview staff or operations, even on this isolated preview origin.
const memoryStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
useAuthStore.persist.setOptions({storage:memoryStorage});
useBranchOpsStore.persist.setOptions({storage:memoryStorage});
await useBranchOpsStore.persist.rehydrate();
useAuthStore.setState({currentUser:{id:'cafe-layout-preview',username:'Preview',displayName:'Biller Preview',role:'billing',password:''} as never,sessionExpiresAt:new Date(Date.now()+3600000).toISOString()});
const groups=[['tiffin','Tiffin','🍽️'],['dosa','Dosa','🥞'],['rice','Rice & Meals','🍚'],['snacks','Snacks','🥟'],['beverages','Beverages','☕'],['desserts','Ice Cream','🍨']];
useMenuCategoryStore.setState({categories:groups.map(([id,name,icon],sortOrder)=>({id,name,icon,timing:'all',sortOrder})),loadCategories:async()=>{},subscribe:()=>()=>{}});
const menu:MenuItem[]=[
 ['Idli',30,'tiffin'],['Vada',20,'tiffin'],['Pongal',60,'tiffin'],['Poori',60,'tiffin'],['Plain Dosa',50,'dosa'],['Masala Dosa',70,'dosa'],['Ghee Roast',80,'dosa'],['Onion Dosa',70,'dosa'],['Mini Meals',100,'rice'],['Sambar Rice',60,'rice'],['Curd Rice',50,'rice'],['Lemon Rice',50,'rice'],['Samosa',20,'snacks'],['Veg Puff',25,'snacks'],['Paneer Puff',30,'snacks'],['Tea',15,'beverages'],['Filter Coffee',25,'beverages'],['Cold Coffee',45,'beverages'],['Fresh Lime',35,'beverages'],['Ice Cream',50,'desserts'],
].map(([name,price,category],i)=>({id:`preview-menu-${i}`,name:String(name),price:Number(price),category:String(category),timing:'all',enabled:true,gstApplicable:true}));
useMenuStore.setState({items:menu,loaded:true,loading:false,loadedAt:Date.now(),loadMenu:async()=>{}});
const noBilling=async():Promise<never>=>{throw new Error('Layout preview only. No bill can be saved here.');};
useOrderStore.setState({orders:[],cart:[{menuItem:menu[4],quantity:2},{menuItem:menu[16],quantity:2}],polling:true,loadOrders:async()=>{},startPolling:()=>{},stopPolling:()=>{},submitOrder:noBilling});
const today=new Date().toLocaleDateString('en-CA');
useBranchOpsStore.setState({counterOpenings:[{id:'preview-counter',branch:'Cafe',date:today,active:true,openingCash:1000,createdAt:new Date().toISOString()} as never],cashierClosures:[]});
useBranchStore.setState({fetchCreditSales:async()=>{}});
useWalletPromotionStore.setState({loadBillingPromotions:async()=>[],searchBillingWallets:async()=>[],recordPromotionExposure:async()=>{}});
const [{default:BillingDashboard},{default:Header},{default:WorkspaceChrome},{default:BottomNav}]=await Promise.all([
 import('@/pages/BillingDashboard'),import('@/components/layout/Header'),import('@/components/layout/WorkspaceChrome'),import('@/components/layout/BottomNav'),
]);
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/billing']}><Header/><WorkspaceChrome><BillingDashboard/></WorkspaceChrome><BottomNav/></MemoryRouter></QueryClientProvider>);
