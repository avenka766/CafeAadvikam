import {supabase} from '@/lib/supabase';
export async function createConfiguredWallet(staff:string,customer:Record<string,unknown>,limits:Record<string,unknown>){
 if(!staff)throw Error('Sign in before creating a wallet.');
 for(const value of [customer.openingBalance,...['transactionLimit','dailyLimit','highValueAuthorizationLimit'].map(k=>limits[k])]){
  if(value!=null&&(!Number.isFinite(Number(value))||Number(value)<0))throw Error('Wallet amounts and limits must be finite, non-negative numbers.');
 }
 const phone=String(customer.mobile||'').replace(/\D/g,'').slice(-10),key=`wallet-create:${staff}:${phone}`;
 const raw=localStorage.getItem(key);
 const request=raw?JSON.parse(raw):{p_request:crypto.randomUUID(),p_customer:customer,p_limits:limits};
 if(!request.p_request||!request.p_customer)throw Error('Saved wallet request needs Admin review.');
 if(!raw)localStorage.setItem(key,JSON.stringify(request));
 const {data,error}=await supabase.rpc('create_wallet_configured_v1',request);
 if(error){if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED'))localStorage.removeItem(key);throw Error(error.message);}
 if(!data?.id||!data.wallet_number)throw Error('Wallet confirmation is incomplete. Retry the saved request.');
 localStorage.removeItem(key);return data as Record<string,unknown>;
}
