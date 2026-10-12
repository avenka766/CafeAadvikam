import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, save: vi.fn().mockResolvedValue({ location: 'Downloads / SNB Admin' }), success: vi.fn(), error: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ save: mocks.save }) }));
vi.mock('./platform', () => ({ isNativeApp: () => mocks.native }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
const originalClick = HTMLAnchorElement.prototype.click;
afterEach(() => { HTMLAnchorElement.prototype.click = originalClick; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('leaves web downloads unchanged', async () => {
  mocks.native = false; vi.stubEnv('VITE_ANDROID_ADMIN_BUILD', 'true');
  const { installAndroidDownloads } = await import('./androidDownloads');
  installAndroidDownloads(); expect(HTMLAnchorElement.prototype.click).toBe(originalClick);
});
it('saves an Excel blob through the Android plugin and reports its location', async () => {
  mocks.native = true; vi.stubEnv('VITE_ANDROID_ADMIN_BUILD', 'true');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['report'], { type: 'application/vnd.ms-excel' }) }));
  const { installAndroidDownloads } = await import('./androidDownloads');
  installAndroidDownloads();
  const link = document.createElement('a'); link.href = 'blob:https://localhost/report'; link.download = 'Sales.xlsx'; link.click();
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sales.xlsx', base64: 'cmVwb3J0' })));
  expect(mocks.success).toHaveBeenCalledWith('Report saved to Downloads / SNB Admin');
});
