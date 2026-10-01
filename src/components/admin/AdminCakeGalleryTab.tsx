// Manages src/pages/Landing.tsx's DB-backed cake gallery (Bakery venue,
// #cakes section). Falls back to the existing real bakery photos already on
// the page if this table is empty, so it's safe to start with none.
//
// REDESIGN (2026-10-01): added stats, category filter chips (mirrors the
// same chips the public gallery itself shows), search, drag-free up/down
// reordering, and a quick active-toggle on the hover overlay — matching the
// improvements made to the other 3 homepage-CMS tabs.
import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Cake, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { uploadSiteContentImage } from './siteContentImages';
import { useSupabaseRows } from './useSupabaseRows';

type CakeGalleryRow = {
  id: string;
  image_url: string;
  category: string | null;
  caption: string | null;
  display_order: number;
  active: boolean;
};

function GalleryDialog({ row, categories, onClose, onSaved }: { row: CakeGalleryRow | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [imageUrl, setImageUrl] = useState(row?.image_url ?? '');
  const [category, setCategory] = useState(row?.category ?? '');
  const [caption, setCaption] = useState(row?.caption ?? '');
  const [displayOrder, setDisplayOrder] = useState(String(row?.display_order ?? 0));
  const [active, setActive] = useState(row?.active ?? true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const url = await uploadSiteContentImage('cake', file);
      setImageUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!imageUrl) { setError('Upload a photo first.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      image_url: imageUrl,
      category: category.trim() || null,
      caption: caption.trim() || null,
      display_order: Number(displayOrder) || 0,
      active,
      updated_at: new Date().toISOString(),
    };
    const { error: dbError } = row
      ? await supabase.from('cake_gallery').update(payload).eq('id', row.id)
      : await supabase.from('cake_gallery').insert(payload);
    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{row ? 'Edit cake photo' : 'Add cake photo'}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-gray-100"><X className="size-4" /></button>
        </div>
        <div className="grid gap-3">
          {imageUrl && <img src={imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {uploading ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : (imageUrl ? 'Replace photo' : 'Upload photo')}
          </button>
          <div>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Wedding, Birthday, Kids)" list="cake-categories" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <datalist id="cake-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {categories.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:border-emerald-600 hover:text-emerald-700">{c}</button>
                ))}
              </div>
            )}
          </div>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Order <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className="w-20 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (shown on homepage)</label>
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

export default function AdminCakeGalleryTab() {
  const { rows, loading, reload, flash, setFlash } = useSupabaseRows<CakeGalleryRow>('cake_gallery', (q) => q.order('display_order'));
  const [dialog, setDialog] = useState<CakeGalleryRow | 'new' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => !!c))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((r) =>
    (categoryFilter === 'All' || r.category === categoryFilter)
    && (!search.trim() || `${r.caption ?? ''} ${r.category ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())),
  ), [rows, categoryFilter, search]);

  const stats = { total: rows.length, active: rows.filter((r) => r.active).length, categories: categories.length };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    await supabase.from('cake_gallery').delete().eq('id', id);
    setFlash('Photo deleted.');
    void reload();
  };

  const toggleActive = async (row: CakeGalleryRow) => {
    await supabase.from('cake_gallery').update({ active: !row.active, updated_at: new Date().toISOString() }).eq('id', row.id);
    void reload();
  };

  const move = async (row: CakeGalleryRow, direction: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((r) => r.id === row.id);
    const neighbor = sorted[idx + direction];
    if (!neighbor) return;
    await Promise.all([
      supabase.from('cake_gallery').update({ display_order: neighbor.display_order }).eq('id', row.id),
      supabase.from('cake_gallery').update({ display_order: row.display_order }).eq('id', neighbor.id),
    ]);
    void reload();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Cake gallery</h2>
          <p className="text-xs text-gray-500">Photos shown in the homepage cake gallery — falls back to real bakery photos if this list is empty.</p>
        </div>
        <button onClick={() => setDialog('new')} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
          <Plus className="size-4" /> Add photo
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { label: 'Total photos', value: stats.total },
          { label: 'Active (live)', value: stats.active },
          { label: 'Categories', value: stats.categories },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{flash}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {['All', ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn('rounded-full border px-3 py-1 text-xs font-bold transition', categoryFilter === c ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 text-gray-500 hover:border-emerald-600')}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="relative ml-auto min-w-[180px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search caption or category…" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <Cake className="mx-auto mb-2 size-8 text-gray-300" />
          <p className="text-sm text-gray-400">{rows.length === 0 ? 'No photos yet — the homepage is showing the existing real bakery photos as a fallback. Add photos here to build a real cake gallery.' : 'No photos match your filter.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((r, i) => (
            <div key={r.id} className={cn('group relative overflow-hidden rounded-xl border border-gray-200', !r.active && 'opacity-60')}>
              <img src={r.image_url} alt={r.caption ?? ''} className="aspect-square w-full object-cover" />
              <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-black/0 to-black/40 p-2 opacity-0 transition group-hover:opacity-100">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button onClick={() => void move(r, -1)} disabled={i === 0} className="grid size-6 place-items-center rounded-full bg-white/90 disabled:opacity-40" aria-label="Move earlier"><ArrowUp className="size-3.5" /></button>
                    <button onClick={() => void move(r, 1)} disabled={i === filtered.length - 1} className="grid size-6 place-items-center rounded-full bg-white/90 disabled:opacity-40" aria-label="Move later"><ArrowDown className="size-3.5" /></button>
                  </div>
                  <button onClick={() => void toggleActive(r)} className="grid size-6 place-items-center rounded-full bg-white/90" aria-label={r.active ? 'Deactivate' : 'Activate'}>
                    {r.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-gray-400" />}
                  </button>
                </div>
                <div className="flex items-end justify-between">
                  <span className="max-w-[70%] truncate text-xs font-bold text-white">{r.category ?? '—'}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setDialog(r)} className="grid size-7 place-items-center rounded-full bg-white/90"><Pencil className="size-3.5" /></button>
                    <button onClick={() => void remove(r.id)} className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
              {!r.active && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">Inactive</span>}
            </div>
          ))}
        </div>
      )}
      {dialog && <GalleryDialog row={dialog === 'new' ? null : dialog} categories={categories} onClose={() => setDialog(null)} onSaved={() => { setFlash(dialog === 'new' ? 'Photo added.' : 'Photo updated.'); void reload(); }} />}
    </div>
  );
}
