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
