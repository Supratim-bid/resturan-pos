// Extra features the super admin switches on per restaurant (Admin → restaurant → Features).
export const FEATURES = {
  preorders: { label: "Pre-orders", help: "Book orders for a later date and meal (breakfast / lunch / dinner), with a kitchen cook list." },
  onlineOrders: { label: "Online ordering", help: "Customers order from their phone at /<code>/order (delivery, takeaway, pre-order); staff accept or reject." },
} as const;
export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
/** Tabs that only exist when their feature is on */
export const FEATURE_TABS: Record<string, FeatureKey> = { preorders: "preorders", onlineOrders: "onlineOrders" };
export const hasFeature = (features: string[] | null | undefined, f: FeatureKey) => !!features?.includes(f);
