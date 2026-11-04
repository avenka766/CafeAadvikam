import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { useAuthStore } from './authStore';
beforeEach(() => { mocks.rpc.mockReset(); useAuthStore.setState({ currentUser: null }); });
it('reports an unreachable sign-in service as a connection error', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
  await expect(useAuthStore.getState().login('test-user', 'test-password')).rejects.toThrow('Unable to connect');
  expect(useAuthStore.getState().currentUser).toBeNull();
});
it('returns invalid credentials only when the server rejects the account', async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  await expect(useAuthStore.getState().login('test-user', 'test-password')).resolves.toBe(false);
});
it('rejects incomplete server sessions without blaming the password', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ username: 'test-user' }], error: null });
  await expect(useAuthStore.getState().login('test-user', 'test-password')).rejects.toThrow('incomplete session');
});
it('revokes the private Audit session using the captured token after clearing local sign-in', async()=>{
 const {saveAppSession,getAppSessionToken}=await import('@/lib/appSession');
 saveAppSession('isolated-audit-session-token',new Date(Date.now()+60000).toISOString());
 useAuthStore.setState({currentUser:{id:'isolated-audit',role:'audit',username:'Audit',displayName:'Audit',password:''}});
 const request=Promise.resolve({data:true,error:null}) as Promise<unknown>&{setHeader:ReturnType<typeof vi.fn>};request.setHeader=vi.fn(()=>request);mocks.rpc.mockReturnValue(request);
 useAuthStore.getState().logout();await request;
 expect(useAuthStore.getState().currentUser).toBeNull();expect(getAppSessionToken()).toBeNull();expect(mocks.rpc).toHaveBeenCalledWith('logout_audit_staff_secure');expect(request.setHeader).toHaveBeenCalledWith('x-cafe-session','isolated-audit-session-token');
});

it('revokes a normal staff session with the token captured before local logout',async()=>{
 const {saveAppSession,getAppSessionToken}=await import('@/lib/appSession');
 saveAppSession('isolated-normal-session-token',new Date(Date.now()+60000).toISOString());
 useAuthStore.setState({currentUser:{id:'fixture',username:'Fixture',displayName:'Fixture',role:'billing',password:''}});
 const setHeader=vi.fn().mockResolvedValue({data:null,error:null});mocks.rpc.mockReturnValue({setHeader});
 useAuthStore.getState().logout();await Promise.resolve();
 expect(getAppSessionToken()).toBeNull();expect(mocks.rpc).toHaveBeenCalledWith('logout_staff_secure');
 expect(setHeader).toHaveBeenCalledWith('x-cafe-session','isolated-normal-session-token');
});
