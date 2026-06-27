import { useEffect, useMemo } from 'react';
import type { Branch } from '@/branch/types';
import { catalogCategories, useBranchCatalogStore } from '@/stores/branchCatalogStore';

export function useOperationalBranchCatalog(branch: Branch | 'SNB' | 'VRSNB') {
  const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : 'SNB';
  const catalogue = useBranchCatalogStore((state) => state.items[catalogBranch]);
  const { loadCatalog, subscribe } = useBranchCatalogStore();
  useEffect(() => {
    void loadCatalog(catalogBranch);
    return subscribe(catalogBranch);
  }, [catalogBranch, loadCatalog, subscribe]);
  const items = useMemo(() => catalogue.filter((item) => item.active), [catalogue]);
  const categories = useMemo(() => catalogCategories(items), [items]);
  return { catalogBranch, items, categories };
}
