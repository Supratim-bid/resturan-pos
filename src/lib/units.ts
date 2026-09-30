// Unit conversion for recipes → stock units
export const UNITS: Record<string, { base: string; factor: number }> = {
  kg: { base: "kg", factor: 1 }, g: { base: "kg", factor: 0.001 },
  litre: { base: "litre", factor: 1 }, ml: { base: "litre", factor: 0.001 },
  pcs: { base: "pcs", factor: 1 }, dozen: { base: "pcs", factor: 12 },
  packet: { base: "packet", factor: 1 }, bunch: { base: "bunch", factor: 1 },
};
export const UNIT_LIST = Object.keys(UNITS);
export const STOCK_UNITS = ["kg", "litre", "pcs", "packet", "bunch", "g", "ml", "dozen"];

/** Convert qty in `unit` into the ingredient's `stockUnit`. null when incompatible (e.g. pcs → kg). */
export function convert(qty: number, unit: string, stockUnit: string): number | null {
  const a = UNITS[unit || stockUnit], b = UNITS[stockUnit];
  if (!a || !b || a.base !== b.base) return null;
  return (qty * a.factor) / b.factor;
}
export function compatibleUnits(stockUnit: string) {
  const b = UNITS[stockUnit]?.base;
  return UNIT_LIST.filter((u) => UNITS[u].base === b);
}
