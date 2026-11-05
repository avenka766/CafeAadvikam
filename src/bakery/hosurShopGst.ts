import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';

export function useHosurShopGstDefaults(
  shopId: string | null | undefined,
  enabled: boolean,
  setName: Dispatch<SetStateAction<string>>,
  setGstin: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!shopId || !enabled) return;
    const controller = new AbortController();
    void (async () => {
      const {data} = await supabase.from('hosur_shops').select('gst_name,gstin').eq('id', shopId)
        .abortSignal(controller.signal).maybeSingle();
      if (!controller.signal.aborted && data?.gst_name && data.gstin) {
        setName(value => value || data.gst_name);
        setGstin(value => value || data.gstin);
      }
    })();
    return () => controller.abort();
  }, [shopId, enabled, setName, setGstin]);
}

/** Remember the first pair entered during billing. Later changes belong in Shop Master. */
export async function rememberHosurShopGst(shopId: string, name: string, gstin: string) {
  if (!navigator.onLine) return;
  const {error} = await supabase.from('hosur_shops').update({gst_name: name.trim(), gstin: gstin.trim().toUpperCase()})
    .eq('id', shopId).is('gst_name', null).is('gstin', null);
  if (error) throw Error('Could not save the shop GST details. ' + error.message);
}
