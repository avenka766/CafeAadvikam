// src/branch/tabs/SettingsTab.tsx  ← NEW FILE
import { Settings } from 'lucide-react';
import { SectionHeader, ThresholdEditor, EmptyState } from '../components';
import type { Branch } from '../types';
import type { StockItem } from '../branchStore';
import { useOperationalBranchCatalog } from '@/hooks/useOperationalBranchCatalog';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
}

const SNB_BRANCHES = ['SNB', 'Hosur'] as const;

export function SettingsTab({ branch, branchStock }: Props) {
  const isSNB = (SNB_BRANCHES as readonly string[]).includes(branch);
  const { items: catalogue } = useOperationalBranchCatalog(isSNB ? 'SNB' : 'VRSNB');
  const allItemNames = catalogue.map((item) => item.name);

  // Merge DB stock data with full item list — items not yet in DB get defaults
  const stockMap = new Map(branchStock.map((s) => [s.itemName, s]));
  const allItems = allItemNames.map((name) =>
    stockMap.get(name) ?? { itemName: name, itemBarcode: catalogue.find((item) => item.name === name)?.barcode, quantity: 0, minThreshold: 10, price: catalogue.find((item) => item.name === name)?.price ?? null }
  );

  return (
    <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
      <SectionHeader
        icon={<Settings className="size-4 text-primary" />}
        title="Low Stock Thresholds"
        right={
          <span className="text-xs text-muted-foreground">
            Alert triggers when stock drops below this level
          </span>
        }
      />
      {allItems.length === 0 ? (
        <EmptyState message="No items configured for this branch." />
      ) : (
        <div className="divide-y">
          {allItems.map((s) => (
            <div key={s.itemName} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{s.itemName}</p>
                <p className="text-xs text-muted-foreground">Current: {s.quantity}</p>
              </div>
              <ThresholdEditor branch={branch} itemName={s.itemName} current={s.minThreshold} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
