// Extra features the super admin switches on per restaurant (Admin → restaurant → Features).
export const FEATURES = {
  preorders: { label: "Pre-orders", help: "Book orders for a later date and meal (breakfast / lunch / dinner), with a kitchen cook list." },
  kot: { label: "KOT (kitchen tickets)", help: "Every bill also sends a KOT to the kitchen screen and can print a KOT slip (no prices)." },
  onlineOrders: { label: "Online ordering", help: "Customers order from their phone at /<code>/order (delivery, takeaway, pre-order); staff accept or reject." },
} as const;
export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
/** Tabs that only exist when their feature is on */
export const FEATURE_TABS: Record<string, FeatureKey> = { preorders: "preorders", onlineOrders: "onlineOrders", kot: "kot" };
export const hasFeature = (features: string[] | null | undefined, f: FeatureKey) => !!features?.includes(f);
/** Features actually in use: allowed by the super admin and not switched off by the owner */
export const activeFeatures = (t: { features?: string[] | null; featuresOff?: string[] | null }) =>
  (t.features ?? []).filter((f) => !(t.featuresOff ?? []).includes(f));
