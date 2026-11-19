import { supabase } from '@/lib/supabase';

export interface Material {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minimum: number | null;
  maximum: number | null;
}
export interface MaterialLine {
  stock_id: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
}
export interface Supplier {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  items_supplied: string;
}
export interface CatalogueEntry { stock_id: string; supplier_id: string; price: number; preferred: boolean }
export type OrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'received';
export interface PurchaseOrder {
  id: string;
  number: number;
  supplier_id: string;
  supplier: string;
  status: OrderStatus;
  automatic: boolean;
  lines: MaterialLine[];
  expected_date: string | null;
  notes: string;
  created_at: string;
  created_by: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  version: number;
}
export interface Receipt {
  id: string;
  number: number;
  po_id: string;
  inward_date: string;
  created_at: string;
  supplier_invoice: string;
  supplier_invoice_date: string;
  delivery_reference: string;
  notes: string;
  lines: MaterialLine[];
  created_by: string;
}
export interface Outward {
  id: string;
  section: string;
  recipe: string;
  reason: string;
  lines: Array<Omit<MaterialLine, 'price' | 'stock_id'> & { before: number | null; after: number | null }>;
  created_at: string;
  created_by: string;
}
export interface StockData {
  materials: Material[];
  opening: Array<Omit<Material, 'id'> & { captured_at: string }>;
  outward: Outward[];
}
export interface PurchaseData {
  materials: Material[];
  suppliers: Supplier[];
  catalogue: CatalogueEntry[];
  orders: PurchaseOrder[];
  receipts: Receipt[];
}

type Action = 'stock_read' | 'purchase_read' | 'stock_import' | 'supplier_import' | 'issue' | 'po_save' | 'review' | 'receive';
export async function materialRequest<T>(action: Action, payload: object, request?: string): Promise<T> {
  const { data, error } = await supabase.rpc('material_workspace_v1', {
    p_action: action, p_payload: payload, p_request: request ?? null,
  });
  if (error) {
    if (error.code === '28000') throw new Error('Your session has expired. Sign in again.');
    if (error.code === '42501') throw new Error('Your account does not have access to this action.');
    throw new Error(error.message);
  }
  return data as T;
}

const indiaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const displayDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
export const dateKey = (value = new Date()) => indiaDay.format(value);
export const localDay = (timestamp: string) => dateKey(new Date(timestamp));
export const displayCapturedAt = (value: string) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value)) + ' IST';
export const displayDate = (value: string | null) => value ? displayDay.format(new Date(value)) : '';
export const poNumber = (number: number) => 'PO-' + String(number).padStart(6, '0');
export const grnNumber = (number: number) => 'GRN-' + String(number).padStart(6, '0');
export const stockStatus = (item: Pick<Material, 'quantity' | 'minimum' | 'maximum'>) => {
  if (item.quantity < (item.minimum ?? 0)) return 'Below minimum';
  if (item.maximum !== null && item.quantity > item.maximum) return 'Above maximum';
  return 'Normal';
};
export const statusLabel: Record<OrderStatus, string> = {
  draft: 'Draft', submitted: 'Pending approval', approved: 'Approved', rejected: 'Rejected', received: 'Fully received',
};
export const approvalLabel = (status: OrderStatus) => status === 'received' ? 'Approved' : statusLabel[status];
export const remainingQuantity = (order: PurchaseOrder, line: MaterialLine, receipts: Receipt[]) =>
  Number((line.quantity - receipts.filter(receipt => receipt.po_id === order.id)
    .flatMap(receipt => receipt.lines).filter(item => item.stock_id === line.stock_id)
    .reduce((total, item) => total + item.quantity, 0)).toFixed(6));

