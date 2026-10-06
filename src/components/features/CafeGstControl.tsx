import { Switch } from '@/components/ui/switch';
import { calculateCafeGst } from '@/lib/cafeGst';

export function CafeGstControl({ enabled, onChange, disabled = false, tax }: {
  enabled: boolean; onChange: (value: boolean) => void; disabled?: boolean;
  tax: Pick<ReturnType<typeof calculateCafeGst>, 'cgstAmount' | 'sgstAmount' | 'gstAmount'>;
}) {
  return <div className="rounded-xl border border-border p-3 space-y-2 text-sm">
    <label className="flex items-center justify-between gap-3 font-bold">
      <span>Add GST (5%) on eligible items</span><Switch aria-label="GST (5%)" checked={enabled} onCheckedChange={onChange} disabled={disabled} />
    </label>
    {enabled ? <>
      <div className="flex justify-between text-xs text-muted-foreground"><span>CGST (2.5%)</span><span>₹{tax.cgstAmount.toFixed(2)}</span></div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>SGST (2.5%)</span><span>₹{tax.sgstAmount.toFixed(2)}</span></div>
      <div className="flex justify-between font-semibold"><span>Additional GST</span><span>₹{tax.gstAmount.toFixed(2)}</span></div>
    </> : <p className="text-xs text-muted-foreground">Additional GST is off for this bill.</p>}
  </div>;
}

