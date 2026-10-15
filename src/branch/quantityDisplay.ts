export function formatBranchQuantity(quantity: number, unit: 'pcs' | 'kg'): string {
  if (!Number.isFinite(quantity)) return 'Stock check needed';
  if (unit === 'pcs') {
    const whole = Math.round(quantity);
    return Math.abs(quantity - whole) < 1e-9 ? `${whole} pcs` : 'Stock check needed';
  }
  return quantity >= 1 ? `${parseFloat(quantity.toFixed(3))} kg` : `${Math.round(quantity * 1000)} g`;
}
