export type PlannerGstDetails = { name:string; gstin:string; address:string; stateName:string; stateCode:string; hsnCode:string; rate:string; supplyType:'intra'|'inter' };
export default function PlannerSalesGstFields({enabled,onEnabledChange,details,onChange}:{enabled:boolean;onEnabledChange:(enabled:boolean)=>void;details:PlannerGstDetails;onChange:(patch:Partial<PlannerGstDetails>)=>void}) {
  const inputClass='mt-1 h-9 w-full min-w-0 rounded-lg border border-purple-300 bg-white px-2 text-xs font-bold';
  return <section className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-3" aria-label="GST invoice details">
    <label className="flex items-center justify-between gap-3 text-xs font-black text-purple-900">Enable GST — print Tax Invoice<input type="checkbox" role="switch" checked={enabled} onChange={event=>onEnabledChange(event.target.checked)} className="size-5 accent-purple-700" /></label>
    {enabled && <><p className="text-xs text-purple-900">GST is added once to the overall bill after discount. ₹1,000 + 5% GST = ₹1,050.</p><div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 text-xs font-bold">Buyer name<input aria-label="GST buyer name" value={details.name} onChange={e=>onChange({name:e.target.value})} placeholder="Customer name if blank" className={inputClass}/></label>
      <label className="text-xs font-bold">Buyer GSTIN<input aria-label="Buyer GSTIN" value={details.gstin} onChange={e=>onChange({gstin:e.target.value.toUpperCase()})} placeholder="Optional" className={inputClass}/></label>
      <label className="text-xs font-bold">HSN/SAC<input aria-label="HSN/SAC" value={details.hsnCode} onChange={e=>onChange({hsnCode:e.target.value})} className={inputClass}/></label>
      <label className="col-span-2 text-xs font-bold">Buyer address<textarea aria-label="GST buyer address" value={details.address} onChange={e=>onChange({address:e.target.value})} className={inputClass+' h-16 py-2'}/></label>
      <label className="text-xs font-bold">State name<input aria-label="GST state name" value={details.stateName} onChange={e=>onChange({stateName:e.target.value})} className={inputClass}/></label>
      <label className="text-xs font-bold">State code<input aria-label="GST state code" value={details.stateCode} onChange={e=>onChange({stateCode:e.target.value})} className={inputClass}/></label>
      <label className="text-xs font-bold">GST % on whole bill<input aria-label="Overall GST percentage" type="number" min="0.01" max="100" step="0.01" value={details.rate} onChange={e=>onChange({rate:e.target.value})} className={inputClass}/></label>
      <label className="text-xs font-bold">Supply type<select aria-label="GST supply type" value={details.supplyType} onChange={e=>onChange({supplyType:e.target.value as 'intra'|'inter'})} className={inputClass}><option value="intra">Same state — CGST + SGST</option><option value="inter">Other state — IGST</option></select></label>
    </div></>}
  </section>;
}
