// Shared upload helper for the site-content-images bucket, used by both
// AdminCakeGalleryTab and AdminPromoBannersTab. Same resize-then-upload
// pattern as src/pages/MenuManagement.tsx's uploadMenuItemImage — client-side
// downscale to keep the bucket (and every future page load of these images)
// small, instead of uploading whatever resolution the admin's phone camera
// produced.
import { supabase } from '@/lib/supabase';

export async function resizeImageToJpegBlob(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That file could not be read as an image.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image resizing is not supported in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

export async function uploadSiteContentImage(prefix: string, file: File): Promise<string> {
  const blob = await resizeImageToJpegBlob(file);
  const path = `${prefix}-${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage.from('site-content-images').upload(path, blob, {
    cacheControl: '31536000',
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  const { data } = supabase.storage.from('site-content-images').getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Could not get a URL for the uploaded image.');
  return data.publicUrl;
}
