// src/branch/tabs/SettingsTab.tsx  ← NEW FILE
import { Settings } from 'lucide-react';
import { SectionHeader, ThresholdEditor, EmptyState } from '../components';
import type { Branch } from '../types';
import type { StockItem } from '../branchStore';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
}

export function SettingsTab({ branch, branchStock }: Props) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <SectionHeader
        icon={<Settings className="size-4 text-primary" />}
        title="Low Stock Thresholds"
        right={
          <span className="text-xs text-muted-foreground">
            Alert triggers when stock drops below this level
          </span>
        }
      />
      {branchStock.length === 0 ? (
        <EmptyState message="No stock data yet." />
      ) : (
        <div className="divide-y">
          {branchStock.map((s) => (
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
