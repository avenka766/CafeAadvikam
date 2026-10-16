export const FESTIVAL_SALE_ITEMS = [
  'SPL SWEET MIX 1KG', 'SPL SWEET MIX 500G', 'SPL SWEET MIX 250G',
  'REG SWEET MIX 1KG', 'REG SWEET MIX 500G', 'REG SWEET MIX 250G',
  'BOMBAY MIXTURE 500G', 'BOMBAY MIXTURE 250G', 'BOMBAY MIXTURE 100G',
  'MANGALORE MIXTURE 500G', 'MANGALORE MIXTURE 250G', 'MANGALORE MIXTURE 100G',
] as const;

export type FestivalSaleDraft = { id: string; name: string; quantity: string; price: string; unit?: 'pcs' | 'kg'; custom?: boolean };
export type FestivalSaleLine = { itemName: string; unit: 'pcs' | 'kg'; quantity: number; price: number };
export function createFestivalSaleDrafts(): FestivalSaleDraft[] {
  return [...FESTIVAL_SALE_ITEMS.map((name, index) => ({ id: `festival-${index}`, name, quantity: '', price: '' })),
    { id: 'festival-custom', name: '', quantity: '', price: '', custom: true }];
}

export function festivalSaleCart(rows: FestivalSaleDraft[]) {
  const entered = rows.filter(row => row.quantity !== '' || row.price !== '' || (row.custom && row.name.trim() !== ''));
  let error = '';
  const names = new Set<string>();
  const lines: FestivalSaleLine[] = entered.map(row => {
    const name = row.name.trim();
    const unit = row.custom && row.unit === 'kg' ? 'kg' : 'pcs';
    const quantity = Number(row.quantity);
    const price = Number(row.price);
    if (!error) {
      if (!name) error = 'Enter a name for the custom item.';
      else if (names.has(name.toLocaleLowerCase())) error = `Use a different custom item name: ${name} is already in the cart.`;
      else if (!row.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || (unit === 'pcs' ? !Number.isSafeInteger(quantity) : Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001)) error = unit === 'pcs' ? `Enter a whole quantity greater than zero for ${name}.` : `Enter a quantity greater than zero with at most 3 decimal places for ${name}.`;
      else if (!row.price.trim() || !Number.isFinite(price) || price <= 0 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) error = `Enter a price greater than zero with at most 2 decimal places for ${name}.`;
    }
    names.add(name.toLocaleLowerCase());
    return { itemName: name || 'Custom item', unit, quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0, price: Number.isFinite(price) ? Math.max(0, price) : 0 };
  });
  return { lines, error };
}
