// Manages src/pages/Landing.tsx's DB-backed testimonials section (public
// SELECT of active rows only — see the `testimonials` table's RLS). The
// homepage shows only published reviews and hides the section when empty.
//
// REDESIGN (2026-10-01): added search/filter, per-venue + active stats, a
// star-rating field (the `rating` column already existed in the DB but was
// never read by this form or by Landing.tsx — every review rendered with a
// hardcoded 5 stars regardless of its actual rating; both sides are now
// wired up), inline active-toggle and reorder (no need to open the dialog
// for either), and a quote character counter.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MessageSquareQuote, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useSupabaseRows } from './useSupabaseRows';

type Testimonial = {
  id: string;
  venue: 'cafe' | 'bakery';
  author: string;
  quote: string;
  rating: number | null;
  meta: string | null;
  display_order: number;
  active: boolean;
};

type Draft = { venue: 'cafe' | 'bakery'; author: string; quote: string; rating: string; meta: string; display_order: string; active: boolean };
const blankDraft: Draft = { venue: 'cafe', author: '', quote: '', rating: '5', meta: '', display_order: '0', active: true };
const QUOTE_MAX = 400;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5" aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <Star className={cn('size-5 transition', n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
          </button>
        ))}
      </div>
      <span className="text-xs font-semibold text-gray-500">{value.toFixed(1)}</span>
    </div>
  );
}

function TestimonialDialog({ row, onClose, onSaved }: { row: Testimonial | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(row ? {
    venue: row.venue, author: row.author, quote: row.quote, rating: String(row.rating ?? 5),
    meta: row.meta ?? '', display_order: String(row.display_order), active: row.active,
  } : blankDraft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.author.trim() || !draft.quote.trim()) { setError('Author and quote are required.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      venue: draft.venue,
      author: draft.author.trim(),
      quote: draft.quote.trim(),
      rating: Math.min(5, Math.max(1, Number(draft.rating) || 5)),
      meta: draft.meta.trim() || null,
      display_order: Number(draft.display_order) || 0,
      active: draft.active,
      updated_at: new Date().toISOString(),
    };
    const { error: dbError } = row
      ? await supabase.from('testimonials').update(payload).eq('id', row.id)
      : await supabase.from('testimonials').insert(payload);
    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] overflow-y-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{row ? 'Edit testimonial' : 'Add testimonial'}</h3>
          <button onClick={onClose} aria-label="Close editor" className="grid size-8 place-items-center rounded-full hover:bg-gray-100"><X className="size-4" /></button>
        </div>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Venue</label>
            <div className="grid grid-cols-2 gap-2">
              {(['cafe', 'bakery'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, venue: v }))}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-bold capitalize transition', draft.venue === v ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50')}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <input value={draft.author} onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))} placeholder="Author name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div>
            <textarea
              value={draft.quote}
              onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value.slice(0, QUOTE_MAX) }))}
              placeholder="Quote — exactly what the customer said, no paraphrasing"
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className={cn('mt-1 text-right text-[11px]', draft.quote.length > QUOTE_MAX - 20 ? 'text-amber-600' : 'text-gray-400')}>{draft.quote.length}/{QUOTE_MAX}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Rating</label>
            <StarPicker value={Number(draft.rating) || 5} onChange={(v) => setDraft((d) => ({ ...d, rating: String(v) }))} />
          </div>
          <input value={draft.meta} onChange={(e) => setDraft((d) => ({ ...d, meta: e.target.value }))} placeholder="Meta (e.g. Local Guide · 363 reviews)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Order <input type="number" value={draft.display_order} onChange={(e) => setDraft((d) => ({ ...d, display_order: e.target.value }))} className="w-20 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} /> Active (shown on homepage)</label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={save} disabled={saving} className="mt-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTestimonialsTab() {
  const { rows, loading, reload, flash, setFlash } = useSupabaseRows<Testimonial>('testimonials', (q) => q.order('venue').order('display_order'));
  const [dialog, setDialog] = useState<Testimonial | 'new' | null>(null);
  const [venueFilter, setVenueFilter] = useState<'all' | 'cafe' | 'bakery'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => rows.filter((r) =>
    (venueFilter === 'all' || r.venue === venueFilter)
    && (!search.trim() || `${r.author} ${r.quote}`.toLowerCase().includes(search.trim().toLowerCase())),
  ), [rows, venueFilter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.active).length,
    cafe: rows.filter((r) => r.venue === 'cafe').length,
    bakery: rows.filter((r) => r.venue === 'bakery').length,
  }), [rows]);

  const remove = async (id: string) => {
    if (!window.confirm('Delete this testimonial? This cannot be undone.')) return;
    await supabase.from('testimonials').delete().eq('id', id);
    setFlash('Testimonial deleted.');
    void reload();
  };

  const toggleActive = async (row: Testimonial) => {
    await supabase.from('testimonials').update({ active: !row.active, updated_at: new Date().toISOString() }).eq('id', row.id);
    void reload();
  };

  // Swaps display_order with the previous/next row IN THE SAME VENUE (the
  // homepage orders reviews per-venue, so reordering across venues would be
  // meaningless) — simple and reliable, no drag library needed.
  const move = async (row: Testimonial, direction: -1 | 1) => {
    const sameVenue = rows.filter((r) => r.venue === row.venue).sort((a, b) => a.display_order - b.display_order);
    const idx = sameVenue.findIndex((r) => r.id === row.id);
    const neighbor = sameVenue[idx + direction];
    if (!neighbor) return;
    await Promise.all([
      supabase.from('testimonials').update({ display_order: neighbor.display_order }).eq('id', row.id),
      supabase.from('testimonials').update({ display_order: row.display_order }).eq('id', neighbor.id),
    ]);
    void reload();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Testimonials</h2>
          <p className="text-xs text-gray-500">Active reviews appear on the homepage with their rating, author and venue. Disable all reviews to hide the section.</p>
        </div>
        <button onClick={() => setDialog('new')} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
          <Plus className="size-4" /> Add testimonial
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Active (live)', value: stats.active },
          { label: 'Cafe', value: stats.cafe },
          { label: 'Bakery', value: stats.bakery },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{flash}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-300 p-0.5">
          {(['all', 'cafe', 'bakery'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVenueFilter(v)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-bold capitalize transition', venueFilter === v ? 'bg-emerald-700 text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search author or quote…" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <MessageSquareQuote className="mx-auto mb-2 size-8 text-gray-300" />
          <p className="text-sm text-gray-400">{rows.length === 0 ? 'No testimonials yet — add the first one, or leave this empty to keep showing the built-in reviews.' : 'No testimonials match your filter.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Venue</th>
                <th className="px-4 py-2">Author</th>
                <th className="px-4 py-2">Quote</th>
                <th className="px-4 py-2">Rating</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className={cn(!r.active && 'opacity-50')}>
                  <td className="px-4 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold capitalize', r.venue === 'cafe' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700')}>{r.venue}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{r.author.charAt(0).toUpperCase()}</span>
                      <span className="font-semibold">{r.author}</span>
                    </div>
                  </td>
                  <td className="max-w-md truncate px-4 py-2 text-gray-600" title={r.quote}>{r.quote}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1 text-amber-500">
                      <Star className="size-3.5 fill-amber-400" /> {(r.rating ?? 5).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <span className="w-5 text-center">{r.display_order}</span>
                      <button onClick={() => move(r, -1)} className="grid size-6 place-items-center rounded hover:bg-gray-100" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                      <button onClick={() => move(r, 1)} className="grid size-6 place-items-center rounded hover:bg-gray-100" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => void toggleActive(r)}
                      className={cn('relative h-5 w-9 rounded-full transition', r.active ? 'bg-emerald-600' : 'bg-gray-300')}
                      aria-label={r.active ? 'Deactivate' : 'Activate'}
                    >
                      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition', r.active ? 'left-[18px]' : 'left-0.5')} />
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => setDialog(r)} className="grid size-8 place-items-center rounded-lg hover:bg-gray-100"><Pencil className="size-4" /></button>
                      <button onClick={() => void remove(r.id)} className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <TestimonialDialog row={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={() => { setFlash(dialog === 'new' ? 'Testimonial added.' : 'Testimonial updated.'); void reload(); }} />}
    </div>
  );
}
