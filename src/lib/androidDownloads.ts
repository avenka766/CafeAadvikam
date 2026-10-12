import { registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';
import { isNativeApp } from './platform';

const downloads = registerPlugin<{ save(options: { name: string; mime: string; base64: string }): Promise<{ location: string }> }>('AdminDownloads');
export function installAndroidDownloads() {
  if (!isNativeApp() || !import.meta.env.VITE_ANDROID_ADMIN_BUILD) return;
  document.documentElement.classList.add('android-admin-app');
  const save = async (link: HTMLAnchorElement) => {
    try {
      const blob = await (await fetch(link.href)).blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const result = await downloads.save({ name: link.download, mime: blob.type || 'application/octet-stream', base64 });
      toast.success(`Report saved to ${result.location}`);
    } catch { toast.error('Report could not be saved. Please retry.'); }
  };
  const original = HTMLAnchorElement.prototype.click;
  const isDownload = (link: HTMLAnchorElement) => !!link.download && /^(blob:|data:)/.test(link.href);
  HTMLAnchorElement.prototype.click = function () {
    if (isDownload(this)) { void save(this); return; }
    original.call(this);
  };
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (link instanceof HTMLAnchorElement && isDownload(link)) {
      event.preventDefault(); event.stopImmediatePropagation(); void save(link);
    }
  }, true);
}
