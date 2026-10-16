import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FestivalSalesPanel from '@/bakery/FestivalSalesPanel';
import {createFestivalSaleDrafts,festivalSaleCart} from '@/bakery/festivalSales';
import PlannerSalesGstFields, {type PlannerGstDetails} from '@/bakery/PlannerSalesGstFields';
import {calculatePlannerSalesGst} from '@/bakery/plannerSalesGst';
import '@/index.css';

function Preview() {
  const [rows,setRows]=useState(createFestivalSaleDrafts);
  const [gstEnabled,setGstEnabled]=useState(false);
  const [discount,setDiscount]=useState('');
  const [gst,setGst]=useState<PlannerGstDetails>({name:'',gstin:'',address:'',stateName:'Tamil Nadu',stateCode:'33',hsnCode:'',rate:'5',supplyType:'intra'});
  const {lines,error}=festivalSaleCart(rows);
  const subtotal=lines.reduce((sum,i)=>sum+i.quantity*i.price,0);
  const tax=calculatePlannerSalesGst(subtotal,Math.min(subtotal,Number(discount)||0),gstEnabled,Number(gst.rate)||0,gst.supplyType);
  return <main className="min-h-screen bg-[#f8f6f0] p-4 sm:p-8"><div className="mx-auto max-w-7xl space-y-5">
    <header className="rounded-2xl bg-[#173d31] p-6 text-white"><h1 className="text-3xl font-bold">Festival Sales · VRSNB Foods LLP</h1><p className="mt-2 text-sm">Form demonstration only. Saving and printing are available in the signed-in Planner.</p></header>
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]"><section className="rounded-2xl bg-white p-5"><FestivalSalesPanel rows={rows} onChange={setRows}/></section><aside className="space-y-4 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">Cart ({lines.length})</h2>
    {lines.map(i=><p key={i.itemName} className="rounded-lg bg-muted p-3 text-sm"><b>{i.itemName}</b><br/>{i.quantity||'—'} {i.unit} × ₹{i.price||'—'}</p>)}
    <input aria-label="Customer name" placeholder="Customer name" className="h-10 w-full rounded-lg border px-3"/><input aria-label="Mobile number" placeholder="Mobile number" className="h-10 w-full rounded-lg border px-3"/>
    <label className="block text-sm">Discount ₹<input aria-label="Discount" type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)} className="h-10 w-full rounded-lg border px-3"/></label>
    <PlannerSalesGstFields enabled={gstEnabled} onEnabledChange={setGstEnabled} details={gst} onChange={patch=>setGst(v=>({...v,...patch}))}/>
    <p>Taxable value <b className="float-right">₹{tax.taxableValue.toFixed(2)}</b></p>{gstEnabled&&<p>GST added ({gst.rate}%) <b className="float-right">₹{tax.totalTax.toFixed(2)}</b></p>}<p className="text-xl font-bold">Total <span className="float-right">₹{tax.total.toFixed(2)}</span></p>
    {error&&<p className="text-sm text-amber-800">{error}</p>}<button disabled className="h-11 w-full rounded-xl bg-[#173d31] font-bold text-white opacity-50">Save &amp; Print Bill</button><p className="text-xs text-muted-foreground">Uses the full Invoice tab Tax Invoice format and the normal Sales bill number. No separate preview step.</p></aside></div>
  </div></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
