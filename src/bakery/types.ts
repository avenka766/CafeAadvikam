// ─── Bakery Workflow Types ─────────────────────────────────────────────────

export type BakeryRole = 'order_receiver' | 'store' | 'baker' | 'packing';

export type WorkflowStatus = 'pending' | 'processing' | 'baking' | 'packed' | 'dispatched';

export interface BakeryOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface BakeryOrder {
  id: string;
  orderNumber: number;
  items: BakeryOrderItem[];
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  // Store fields
  expectedOutput?: number;
  materialsCalculatedAt?: string;
  // Baker fields
  preparedItems?: PreparedItem[];
  sentToPackingAt?: string;
  // Packing fields
  dispatchLog?: DispatchEntry[];
}

export interface PreparedItem {
  itemId: string;
  itemName: string;
  quantityPrepared: number;
  preparedAt: string;
}

export interface DispatchEntry {
  id: string;
  itemName: string;
  quantity: number;
  branch: Branch;
  dispatchedAt: string;
  dispatchedBy: string;
}

export type Branch = 'VRSNB' | 'SNB' | 'Hosur';

export interface MaterialRequirement {
  material: string;
  quantity: number;
  unit: string;
}

// Recipe config: item → materials needed per unit
export const BAKERY_ITEMS: { id: string; name: string; icon: string }[] = [
  { id: 'white-bread', name: 'White Bread', icon: '🍞' },
  { id: 'brown-bread', name: 'Brown Bread', icon: '🍞' },
  { id: 'bun', name: 'Bun', icon: '🫓' },
  { id: 'croissant', name: 'Croissant', icon: '🥐' },
  { id: 'cake', name: 'Cake', icon: '🎂' },
  { id: 'cookie', name: 'Cookie', icon: '🍪' },
  { id: 'rusk', name: 'Rusk', icon: '🍞' },
  { id: 'pav', name: 'Pav', icon: '🫓' },
];

export const BRANCHES: Branch[] = ['VRSNB', 'SNB', 'Hosur'];

// Materials per unit of each item
export const RECIPE_MAP: Record<string, MaterialRequirement[]> = {
  'white-bread': [
    { material: 'Maida (All Purpose Flour)', quantity: 500, unit: 'g' },
    { material: 'Yeast', quantity: 7, unit: 'g' },
    { material: 'Salt', quantity: 5, unit: 'g' },
    { material: 'Sugar', quantity: 10, unit: 'g' },
    { material: 'Butter', quantity: 30, unit: 'g' },
    { material: 'Water', quantity: 300, unit: 'ml' },
  ],
  'brown-bread': [
    { material: 'Wheat Flour', quantity: 400, unit: 'g' },
    { material: 'Maida', quantity: 100, unit: 'g' },
    { material: 'Yeast', quantity: 7, unit: 'g' },
    { material: 'Salt', quantity: 5, unit: 'g' },
    { material: 'Honey', quantity: 15, unit: 'g' },
    { material: 'Water', quantity: 310, unit: 'ml' },
  ],
  'bun': [
    { material: 'Maida', quantity: 250, unit: 'g' },
    { material: 'Yeast', quantity: 5, unit: 'g' },
    { material: 'Sugar', quantity: 30, unit: 'g' },
    { material: 'Butter', quantity: 40, unit: 'g' },
    { material: 'Milk', quantity: 100, unit: 'ml' },
    { material: 'Egg (or substitute)', quantity: 1, unit: 'pc' },
  ],
  'croissant': [
    { material: 'Maida', quantity: 300, unit: 'g' },
    { material: 'Butter (lamination)', quantity: 150, unit: 'g' },
    { material: 'Yeast', quantity: 6, unit: 'g' },
    { material: 'Sugar', quantity: 20, unit: 'g' },
    { material: 'Salt', quantity: 5, unit: 'g' },
    { material: 'Milk', quantity: 120, unit: 'ml' },
  ],
  'cake': [
    { material: 'Maida', quantity: 200, unit: 'g' },
    { material: 'Sugar', quantity: 180, unit: 'g' },
    { material: 'Butter', quantity: 100, unit: 'g' },
    { material: 'Baking Powder', quantity: 5, unit: 'g' },
    { material: 'Milk', quantity: 150, unit: 'ml' },
    { material: 'Vanilla Essence', quantity: 5, unit: 'ml' },
  ],
  'cookie': [
    { material: 'Maida', quantity: 150, unit: 'g' },
    { material: 'Butter', quantity: 80, unit: 'g' },
    { material: 'Sugar', quantity: 80, unit: 'g' },
    { material: 'Baking Soda', quantity: 2, unit: 'g' },
    { material: 'Vanilla Essence', quantity: 3, unit: 'ml' },
  ],
  'rusk': [
    { material: 'Maida', quantity: 300, unit: 'g' },
    { material: 'Sugar', quantity: 60, unit: 'g' },
    { material: 'Butter', quantity: 50, unit: 'g' },
    { material: 'Yeast', quantity: 5, unit: 'g' },
    { material: 'Cardamom Powder', quantity: 2, unit: 'g' },
  ],
  'pav': [
    { material: 'Maida', quantity: 300, unit: 'g' },
    { material: 'Yeast', quantity: 6, unit: 'g' },
    { material: 'Sugar', quantity: 20, unit: 'g' },
    { material: 'Salt', quantity: 4, unit: 'g' },
    { material: 'Butter', quantity: 30, unit: 'g' },
    { material: 'Milk', quantity: 100, unit: 'ml' },
  ],
};
