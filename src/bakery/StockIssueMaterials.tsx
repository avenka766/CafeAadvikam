import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, MaterialSelect } from './MaterialWorkspaceControls';
import type { Material } from './materialWorkspace';

export type IssueDraft = { key: string; stockId: string; quantity: string };
export const newIssueLine = (): IssueDraft => ({ key: crypto.randomUUID(), stockId: '', quantity: '' });
const wholeUnits = (unit: string) => ['pcs', 'nos', 'no', 'pieces'].includes(unit.trim().toLowerCase());

export function issueRows(lines: IssueDraft[], materials: Material[]) {
  return lines.flatMap(line => {
    const stock = materials.find(material => material.id === line.stockId);
    const quantity = Number(line.quantity);
    if (!stock || !(quantity > 0 && quantity <= stock.quantity)) return [];
    if (wholeUnits(stock.unit) && !Number.isInteger(quantity)) return [];
    if (Number(quantity.toFixed(6)) !== quantity) return [];
    return [{ stock_id: stock.id, unit: stock.unit, quantity }];
  });
}

export default function StockIssueMaterials({ lines, materials, change }: {
  lines: IssueDraft[]; materials: Material[]; change: (lines: IssueDraft[]) => void;
}) {
  return <div className="space-y-2">
    {lines.map((line, index) => {
      const stock = materials.find(material => material.id === line.stockId);
      const choices = materials.filter(material => material.id === line.stockId || !lines.some(other => other.stockId === material.id));
      const update = (values: Partial<IssueDraft>) => change(lines.map(row => row.key === line.key ? { ...row, ...values } : row));
      const step = stock && wholeUnits(stock.unit) ? 1 : 0.000001;
      return <div key={line.key} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[2fr_1fr_auto]">
        <Field label={'Raw material ' + (index + 1)}><MaterialSelect selected={stock?.id ?? ''} materials={choices}
          change={stockId => update({ stockId, quantity: '' })}/></Field>
        {stock && <div className="space-y-1">
          <Field label={'Quantity (' + stock.unit + ')'}><Input type="number" min={step} step={step} max={stock.quantity}
            value={line.quantity} onChange={event => update({ quantity: event.target.value })}/></Field>
          <p className="text-xs text-muted-foreground">Available {stock.quantity} {stock.unit}</p>
        </div>}
        <Button type="button" size="sm" variant="outline" onClick={() => change(lines.filter(row => row.key !== line.key))}>
          Remove material {index + 1}
        </Button>
      </div>;
    })}
    <Button type="button" size="sm" variant="outline" disabled={lines.some(line => !line.stockId) || lines.length >= Math.min(materials.length, 200)}
      onClick={() => change([...lines, newIssueLine()])}>Add material</Button>
  </div>;
}
