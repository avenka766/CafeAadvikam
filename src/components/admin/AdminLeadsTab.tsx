// Two lead lists gathered by src/pages/Landing.tsx's public forms: the party
// hall enquiry form (cafe, #occasion) and the PAN-India delivery "notify me"
// waitlist (bakery, now dormant — the public signup form was removed once
// pan-India delivery went live, but old signups still read back here).
//
// REDESIGN (2026-10-01): the old version was read-only text in a table —
// staff had to copy a phone number out to actually contact anyone. Added
// one-tap Call + WhatsApp links per enquiry, colored status badges instead
// of a plain dropdown, a status filter, a per-status count bar, and a
// delete action for clearing spam/test entries (needed its own RLS policy —
// see migration admin_delete_leads_policies — the tables never had an admin
// DELETE policy before, only INSERT/SELECT/UPDATE).
import { useMemo, useState } from 'react';
import { Inbox, MessageCircle, Phone, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useSupabaseRows } from './useSupabaseRows';

type Enquiry = {
  id: string; name: string; phone: string; event_type: string | null; event_date: string | null;
  guest_count: number | null; preferred_time: string | null; requirements: string | null;
  status: 'new' | 'contacted' | 'confirmed' | 'closed'; created_at: string;
};
type WaitlistRow = { id: string; name: string; contact: string; created_at: string };

const STATUS_OPTIONS: Enquiry['status'][] = ['new', 'contacted', 'confirmed', 'closed'];
const STATUS_TONE: Record<Enquiry['status'], string> = {
  new: 'bg-sky-100 text-sky-700',
  contacted: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-200 text-gray-600',
};

// Best-effort Indian-number normalizer for wa.me links — the form just
// collects free-text phone input, not a validated/formatted field.
function waLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export default function AdminLeadsTab() {
  const { rows: enquiries, loading: loadingE, reload: reloadE } = useSupabaseRows<Enquiry>('party_hall_enquiries', (q) => q.order('created_at', { ascending: false }));
  const { rows: waitlist, loading: loadingW, reload: reloadW } = useSupabaseRows<WaitlistRow>('pan_india_waitlist', (q) => q.order('created_at', { ascending: false }));
  const loading = loadingE || loadingW;
  const [statusFilter, setStatusFilter] = useState<'all' | Enquiry['status']>('all');

  const reload = () => { void reloadE(); void reloadW(); };

  const counts = useMemo(() => {
    const c: Record<Enquiry['status'], number> = { new: 0, contacted: 0, confirmed: 0, closed: 0 };
    enquiries.forEach((r) => { c[r.status] += 1; });
    return c;
  }, [enquiries]);

  const filteredEnquiries = useMemo(
    () => statusFilter === 'all' ? enquiries : enquiries.filter((r) => r.status === statusFilter),
    [enquiries, statusFilter],
  );

  const updateStatus = async (id: string, status: Enquiry['status']) => {
    await supabase.from('party_hall_enquiries').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    void reloadE();
  };

  const removeEnquiry = async (id: string) => {
    if (!window.confirm('Delete this enquiry? This cannot be undone.')) return;
    await supabase.from('party_hall_enquiries').delete().eq('id', id);
    void reloadE();
  };

  const removeWaitlist = async (id: string) => {
    if (!window.confirm('Delete this sign-up? This cannot be undone.')) return;
    await supabase.from('pan_india_waitlist').delete().eq('id', id);
    void reloadW();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Leads</h2>
          <p className="text-xs text-gray-500">Every party hall enquiry and (historical) PAN-India sign-up submitted from the homepage.</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={cn('rounded-xl border p-3 text-left transition', statusFilter === s ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-gray-200 bg-white hover:border-gray-300')}
          >
            <p className="text-2xl font-bold text-gray-900">{counts[s]}</p>
            <p className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold capitalize', STATUS_TONE[s])}>{s}</p>
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <div className="mb-2 mt-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Party hall & catering enquiries ({filteredEnquiries.length}{statusFilter !== 'all' ? ` of ${enquiries.length}` : ''})</h3>
            {statusFilter !== 'all' && <button onClick={() => setStatusFilter('all')} className="text-xs font-semibold text-emerald-700 hover:underline">Clear filter</button>}
          </div>
          <div className="mb-8 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Guests</th>
                  <th className="px-4 py-2">Requirements</th>
                  <th className="px-4 py-2">Received</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEnquiries.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-semibold">{r.name}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span>{r.phone}</span>
                        <a href={`tel:${r.phone}`} className="grid size-6 place-items-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200" aria-label={`Call ${r.name}`} title="Call"><Phone className="size-3.5" /></a>
                        <a href={waLink(r.phone, `Hi ${r.name}, thanks for your party hall enquiry with Cafe Aadvikam — following up here.`)} target="_blank" rel="noreferrer" className="grid size-6 place-items-center rounded-full bg-[#25D366]/15 text-[#128C4A] hover:bg-[#25D366]/25" aria-label={`WhatsApp ${r.name}`} title="WhatsApp"><MessageCircle className="size-3.5" /></a>
                      </div>
                    </td>
                    <td className="px-4 py-2">{r.event_type ?? '—'}</td>
                    <td className="px-4 py-2">{r.event_date ?? '—'}</td>
                    <td className="px-4 py-2">{r.guest_count ?? '—'}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-gray-500" title={r.requirements ?? ''}>{r.requirements ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2">
                      <select
                        value={r.status}
                        onChange={(e) => void updateStatus(r.id, e.target.value as Enquiry['status'])}
                        className={cn('rounded-lg border-0 px-2 py-1 text-xs font-bold capitalize', STATUS_TONE[r.status])}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => void removeEnquiry(r.id)} className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
                {filteredEnquiries.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    <Inbox className="mx-auto mb-2 size-7 text-gray-300" />
                    {enquiries.length === 0 ? 'No enquiries yet.' : 'No enquiries with this status.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 mt-2 text-sm font-bold uppercase tracking-wide text-gray-500">PAN-India delivery waitlist ({waitlist.length}) — closed, now delivering nationwide</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Contact</th><th className="px-4 py-2">Signed up</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {waitlist.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-semibold">{r.name}</td>
                    <td className="px-4 py-2">{r.contact}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => void removeWaitlist(r.id)} className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
                {waitlist.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No sign-ups yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
