import { supabase } from '@/lib/supabase';

export const PACKING_CLOSURE_KEY_PREFIX = 'packing-daily-closure:';

export const packingBusinessDateToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

export type PackingCounterStatus = {
  isOpen: boolean;
  isFinalized: boolean;
  openingCash: number;
};

export async function getPackingCounterStatus(date = packingBusinessDateToday()): Promise<PackingCounterStatus> {
  const { data, error } = await supabase
    .from('app_state')
    .select('value')
    .eq('key', `${PACKING_CLOSURE_KEY_PREFIX}${date}`)
    .maybeSingle();

  if (error) throw error;

  const value = (data?.value && typeof data.value === 'object' ? data.value : {}) as {
    status?: string;
    opening_cash?: number;
  };

  return {
    isOpen: value.status === 'draft',
    isFinalized: value.status === 'finalized',
    openingCash: Number(value.opening_cash ?? 0),
  };
}
