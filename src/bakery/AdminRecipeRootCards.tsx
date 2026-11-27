import { useCallback, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Entry = { item: string; card: string };
type SaveCard = (item: string, expected: string, proposed: string) => Promise<void>;

export function useAdminRecipeRootCards(enabled: boolean) {
  const [cards, setCards] = useState<Map<string, string>>();
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const call = ++sequence.current;
    const { data, error } = await supabase.rpc('admin_recipe_root_cards_v1', { item: null, expected: null, proposed: null });
    if (call !== sequence.current) return;
    if (error) {
      setError(error.code === 'PGRST202' ? 'Root cards are unavailable until the database update is installed.' : error.message);
      return;
    }
    setCards(new Map((data as Entry[]).map(row => [row.item, row.card])));
    setError('');
  }, [enabled]);

  const save: SaveCard = async (item, expected, proposed) => {
    const { error } = await supabase.rpc('admin_recipe_root_cards_v1', { item, expected, proposed });
    if (error) throw new Error(error.message);
    await refresh();
  };
  return { cards, error, refresh, save };
}

export function RecipeRootCardEditor({ item, name, card, save }: {
  item: string; name: string; card: string; save: SaveCard;
}) {
  const [expected, setExpected] = useState<string>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return <div onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {expected === undefined ? <button type="button"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-primary/10"
      aria-label={'Edit root card ' + card + ' for ' + name}
      onClick={() => { setExpected(card); setDraft(card); setError(''); }}>
      {card}<Pencil className="size-3" aria-hidden="true" />
    </button> : <form className="flex flex-wrap items-center gap-2" onSubmit={async event => {
      event.preventDefault();
      setSaving(true);
      setError('');
      try {
        await save(item, expected, draft);
        setExpected(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save the root card.');
      } finally {
        setSaving(false);
      }
    }}>
      <Input autoFocus aria-label={'Root card for ' + name} required maxLength={40}
        className="h-8 w-36" value={draft} disabled={saving} onChange={event => setDraft(event.target.value)} />
      <Button type="submit" size="sm" disabled={saving || !draft.trim()}>Save</Button>
      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setExpected(undefined)}>Cancel</Button>
      {error && <p role="alert" className="basis-full text-xs text-destructive">{error}</p>}
    </form>}
  </div>;
}
