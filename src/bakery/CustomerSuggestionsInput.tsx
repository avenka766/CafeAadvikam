import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type PreviousSalesCustomer = { name: string; mobile: string; address: string };
export default function CustomerSuggestionsInput({ value, onChange, onSelect, placeholder = 'Customer name', className, required = false }: {
  value: string; onChange: (value: string) => void; onSelect: (customer: PreviousSalesCustomer) => void; placeholder?: string; className?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [customers, setCustomers] = useState<PreviousSalesCustomer[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const version = useRef(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const visible = focused && value.trim().length > 0;
  useEffect(() => {
    const request = ++version.current;
    setCustomers([]); setActive(-1); setFailed(false); setLoading(false);
    if (!focused || !value.trim()) return;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('planner_sales_customer_suggestions', { p_query: value.trim() });
        if (request !== version.current) return;
        if (error) throw error;
        setCustomers((data || []) as PreviousSalesCustomer[]);
      } catch { if (request === version.current) setFailed(true); }
      finally { if (request === version.current) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); ++version.current; };
  }, [value, focused]);
  const choose = (customer: PreviousSalesCustomer) => {
    ++version.current; setFocused(false); setCustomers([]); setActive(-1); onSelect(customer);
  };
  const move = (direction: number) => {
    if (!customers.length) return;
    setActive(index => (index === -1 ? direction > 0 ? 0 : customers.length - 1 : (index + direction + customers.length) % customers.length));
  };
  useEffect(() => { if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, id]);
  return <div ref={wrapper} className="relative min-w-0" onBlur={event => { if (!wrapper.current?.contains(event.relatedTarget as Node)) { ++version.current; setFocused(false); } }}>
    <input ref={input} required={required} value={value} placeholder={placeholder} className={className || 'h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold'} autoComplete="off" role="combobox" aria-label="Customer name" aria-autocomplete="list" aria-expanded={visible} aria-controls={`${id}-list`} aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
      onFocus={() => setFocused(true)} onChange={event => { ++version.current; setCustomers([]); setActive(-1); setFocused(true); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); ++version.current; setFocused(false); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setFocused(true); move(event.key === 'ArrowDown' ? 1 : -1); }
        if (event.key === 'Enter' && visible && active >= 0 && customers[active]) { event.preventDefault(); choose(customers[active]); }
      }} />
    {visible && <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {loading && <p role="status" className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Looking up previous customers…</p>}
      {failed && <p role="status" className="p-3 text-xs text-muted-foreground">Suggestions unavailable. You can still enter customer details.</p>}
      {!loading && !failed && customers.length === 0 && <p className="p-3 text-xs text-muted-foreground">No previous customer found. Continue entering the new customer.</p>}
      <div id={`${id}-list`} role="listbox" aria-label="Previous customers" className="max-h-60 overflow-y-auto">
        {customers.map((customer, index) => <button key={`${customer.name}|${customer.mobile}`} id={`${id}-${index}`} type="button" role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(customer)} onMouseEnter={() => setActive(index)} className={`block w-full border-b border-border px-3 py-2 text-left last:border-0 ${active === index ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}>
          <span className="block text-sm font-bold">{customer.name}</span><span className="block text-xs text-muted-foreground">{customer.mobile || 'No mobile recorded'}</span>
        </button>)}
      </div>
      {customers.length > 0 && <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1 text-[10px] text-muted-foreground"><span>↑ ↓ to select · Enter to fill</span><div className="flex gap-1">{[-1, 1].map(direction => <button key={direction} type="button" aria-label={direction === -1 ? 'Previous customer suggestion' : 'Next customer suggestion'} onMouseDown={event => event.preventDefault()} onClick={() => { move(direction); input.current?.focus(); }} className="grid size-8 place-items-center rounded-lg border border-border">{direction === -1 ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</button>)}</div></div>}
    </div>}
  </div>;
}
