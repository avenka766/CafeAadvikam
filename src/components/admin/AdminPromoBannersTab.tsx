// Manages src/pages/Landing.tsx's promo banner strip (shown below the nav,
// only when an active row matches the current venue and date range — see
// the `promo_banners` table's RLS, which does the active+date filtering
// server-side already).
//
// REDESIGN (2026-10-01): the old table left admins guessing which banner (if
// any) was actually showing on the live site right now — `active: Yes` alone
// doesn't mean live, since a row can be active but outside its date range.
// Added a computed Live/Scheduled/Expired/Off status badge (same predicate
// as the RLS policy), a real preview of the banner strip inside the dialog
// (matching Landing.tsx's actual styling), a one-click Duplicate for
// recurring promos, and start/end date validation.
import { useMemo, useRef, useState } from 'react';
import { Copy, Loader2, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { uploadSiteContentImage } from './siteContentImages';
import { useSupabaseRows } from './useSupabaseRows';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type PromoBanner = {
  id: string;
  title: string;
  message: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_link: string | null;
  venue: 'cafe' | 'bakery' | 'both';
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
};

// Mirrors the promo_banners_read_anon RLS predicate exactly: active AND
// (no start_date OR start_date <= today) AND (no end_date OR end_date >= today).
function liveStatus(r: PromoBanner): { label: string; tone: string } {
  if (!r.active) return { label: 'Off', tone: 'bg-gray-100 text-gray-500' };
  const today = new Date().toISOString().slice(0, 10);
  if (r.start_date && r.start_date > today) return { label: 'Scheduled', tone: 'bg-sky-100 text-sky-700' };
  if (r.end_date && r.end_date < today) return { label: 'Expired', tone: 'bg-red-100 text-red-700' };
  return { label: 'Live now', tone: 'bg-emerald-100 text-emerald-700' };
}

function BannerPreview({ title, message, ctaLabel }: { title: string; message: string; ctaLabel: string }) {
  if (!title.trim()) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Offer text preview</p>
      <div className="bg-[#682c36] flex flex-wrap items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-center text-xs font-bold text-primary-foreground sm:text-sm">
        <span>{title}</span>
        {message.trim() && <span className="font-normal opacity-90">{message}</span>}
        {ctaLabel.trim() && <span className="underline underline-offset-2">{ctaLabel}</span>}
      </div>
    </div>
  );
}

function BannerDialog({ row, onClose, onSaved }: { row: PromoBanner | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [message, setMessage] = useState(row?.message ?? '');
  const [imageUrl, setImageUrl] = useState(row?.image_url ?? '');
  const [ctaLabel, setCtaLabel] = useState(row?.cta_label ?? '');
  const [ctaLink, setCtaLink] = useState(row?.cta_link ?? '');
  const [venue, setVenue] = useState<PromoBanner['venue']>(row?.venue ?? 'both');
  const [active, setActive] = useState(row?.active ?? true);
  const [startDate, setStartDate] = useState(row?.start_date ?? '');
  const [endDate, setEndDate] = useState(row?.end_date ?? '');
  const [displayOrder, setDisplayOrder] = useState(String(row?.display_order ?? 0));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    try { setImageUrl(await uploadSiteContentImage('banner', file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (startDate && endDate && endDate < startDate) { setError('End date must be on or after the start date.'); return; }
    if (ctaLabel.trim() && !ctaLink.trim()) { setError('Add a button link, or clear the button label.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(),
      message: message.trim() || null,
      image_url: imageUrl || null,
      cta_label: ctaLabel.trim() || null,
      cta_link: ctaLink.trim() || null,
      venue,
      active,
      start_date: startDate || null,
      end_date: endDate || null,
      display_order: Number(displayOrder) || 0,
      updated_at: new Date().toISOString(),
    };
    const { error: dbError } = row
      ? await supabase.from('promo_banners').update(payload).eq('id', row.id)
      : await supabase.from('promo_banners').insert(payload);
    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{row ? 'Edit banner' : 'Add banner'}</h3>
          <button onClick={onClose} aria-label="Close editor" className="grid size-8 place-items-center rounded-full hover:bg-gray-100"><X className="size-4" /></button>
        </div>
        <div className="grid gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message (optional)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Button text (optional, e.g. Order Now)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <BannerPreview title={title} message={message} ctaLabel={ctaLabel} />

          {imageUrl && <img src={imageUrl} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {uploading ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : (imageUrl ? 'Replace image' : 'Upload image (optional, shown alongside the offer on the homepage)')}
          </button>
          <input value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="Button link — where the button goes (e.g. /order, or a WhatsApp link)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Venue</label>
            <div className="grid grid-cols-3 gap-2">
              {(['both', 'cafe', 'bakery'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVenue(v)}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-bold capitalize transition', venue === v ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50')}
                >
                  {v === 'both' ? 'Both' : v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-500">Start date (optional)<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-bold text-gray-500">End date (optional)<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
          </div>
          <p className="text-[11px] text-gray-400">Leave dates blank to run indefinitely (until you deactivate it).</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Order <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className="w-20 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={save} disabled={saving || uploading} className="mt-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPromoBannersTab() {
  const { rows, loading, reload, flash, setFlash } = useSupabaseRows<PromoBanner>('promo_banners', (q) => q.order('display_order'));
  const [dialog, setDialog] = useState<PromoBanner | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromoBanner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const liveCount = useMemo(() => rows.filter((r) => liveStatus(r).label === 'Live now').length, [rows]);

  const remove = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.from('promo_banners').delete().eq('id', id);
      if (error) throw error;
      setDeleteTarget(null);
      setFlash('Banner deleted.');
      void reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this banner. Please try again.');
    } finally { setDeleting(false); }
  };

  const duplicate = async (row: PromoBanner) => {
    const { id: _id, ...rest } = row;
    await supabase.from('promo_banners').insert({ ...rest, title: `${row.title} (copy)`, active: false });
    setFlash('Duplicated — the copy is inactive so you can edit it before it goes live.');
    void reload();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Promo banners</h2>
          <p className="text-xs text-gray-500">Active offers appear within their date range. Both venues appears after the opening story; cafe and bakery offers appear beside their sections. Images and buttons are shown too.</p>
        </div>
        <button onClick={() => setDialog('new')} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
          <Plus className="size-4" /> Add banner
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total banners', value: rows.length },
          { label: 'Live now', value: liveCount, highlight: liveCount > 0 },
          { label: 'Inactive / expired', value: rows.length - liveCount },
        ].map((s) => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.highlight ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white')}>
            <p className={cn('text-2xl font-bold', s.highlight ? 'text-emerald-700' : 'text-gray-900')}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{flash}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <Megaphone className="mx-auto mb-2 size-8 text-gray-300" />
          <p className="text-sm text-gray-400">No banners — nothing is shown on the homepage right now.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Venue</th>
                <th className="px-4 py-2">Dates</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const status = liveStatus(r);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', status.tone)}>{status.label}</span></td>
                    <td className="px-4 py-2">
                      <p className="font-semibold">{r.title}</p>
                      {r.message && <p className="max-w-xs truncate text-xs text-gray-500">{r.message}</p>}
                    </td>
                    <td className="px-4 py-2 capitalize">{r.venue}</td>
                    <td className="px-4 py-2 text-gray-500">{r.start_date ?? 'Always'} → {r.end_date ?? 'Always'}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => setDialog(r)} className="grid size-8 place-items-center rounded-lg hover:bg-gray-100" aria-label="Edit"><Pencil className="size-4" /></button>
                        <button onClick={() => void duplicate(r)} className="grid size-8 place-items-center rounded-lg hover:bg-gray-100" aria-label="Duplicate"><Copy className="size-4" /></button>
                        <button onClick={() => { setDeleteError(''); setDeleteTarget(r); }} className="grid size-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <BannerDialog row={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={() => { setFlash(dialog === 'new' ? 'Banner added.' : 'Banner updated.'); void reload(); }} />}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent><DialogTitle>Delete this banner?</DialogTitle><DialogDescription>“{deleteTarget?.title}” will be permanently removed. This cannot be undone.</DialogDescription>
          {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
          <div className="flex justify-end gap-3"><button disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border px-4 py-2">Cancel</button><button disabled={deleting} onClick={() => deleteTarget && void remove(deleteTarget.id)} className="rounded-lg bg-red-700 px-4 py-2 text-white">{deleting ? 'Deleting…' : 'Delete banner'}</button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
