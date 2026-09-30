// Features that can be sold / switched per restaurant.
//  - Plans (Starter / Growth / Pro …, editable by the super admin) include a set of features.
//  - For one restaurant the super admin can add extra features (add-ons) or remove ones from its plan.
//  - The owner can switch off anything their restaurant has (Settings → Extra features).
// The basics (New order, Orders & bills, Customers, Menu, Today's menu, Expenses, Cash closing, Settings) are always included.

export const FEATURE_GROUPS = {
  orders: "Orders & kitchen",
  online: "Sell online",
  delivery: "Delivery",
  kitchen: "Kitchen & stock",
  money: "Money & reports",
  team: "Team",
} as const;
export type FeatureGroup = keyof typeof FEATURE_GROUPS;

type F = { label: string; help: string; group: FeatureGroup; comingSoon?: boolean };
export const FEATURES = {
  preorders: { label: "Pre-orders", group: "orders", help: "Book orders for a later date and meal (breakfast / lunch / dinner), with a kitchen cook list." },
  kot: { label: "KOT (kitchen tickets)", group: "orders", help: "Kitchen screen and KOT slips (no prices); bills can send a KOT to the kitchen." },
  onlineOrders: { label: "Online ordering", group: "online", help: "Customers order from their phone at /<code>/order (delivery, pickup, pre-order); staff accept or reject." },
  paymentGateways: { label: "Payment links & gateways", group: "online", help: "Razorpay, Instamojo or Cashfree payment links on bills - marked paid automatically." },
  aggregators: { label: "Swiggy / Zomato orders", group: "online", help: "Receive Swiggy and Zomato orders here (through an integration partner).", comingSoon: true },
  deliveryPartners: { label: "Delivery partners", group: "delivery", help: "Book riders (Porter, Rapido, Borzo…) from an order and track them.", comingSoon: true },
  recipes: { label: "Recipes & costing", group: "kitchen", help: "Recipes, ingredient rates and cost / margin per plate." },
  stock: { label: "Stock & wastage", group: "kitchen", help: "Ingredient stock used by recipes, purchases, counts and wastage." },
  packaging: { label: "Packaging stock", group: "kitchen", help: "Containers & bags used per order, stock and cost; optional barcode scanner." },
  vendors: { label: "Vendors & dues", group: "money", help: "Suppliers, purchases on credit and what you owe them." },
  reports: { label: "Reports & P&L", group: "money", help: "Sales, dish-wise, profit & loss, exports." },
  money: { label: "Cash & Bank", group: "money", help: "Cash in hand + online / bank balance, ledger and Excel." },
  settlements: { label: "Swiggy/Zomato payouts", group: "money", help: "Record weekly payouts and commission from the apps." },
  staff: { label: "Staff & attendance", group: "team", help: "Staff list, attendance and salary expenses." },
  reminders: { label: "Reminders", group: "team", help: "Licence renewals, rent, birthdays and other reminders." },
} as const satisfies Record<string, F>;
export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
export const isComingSoon = (k: string) => !!(FEATURES as Record<string, F>)[k]?.comingSoon;

/** Tabs (modules) that only exist when their feature is on */
export const FEATURE_TABS: Record<string, FeatureKey> = {
  preorders: "preorders", onlineOrders: "onlineOrders", kot: "kot",
  recipes: "recipes", ingredients: "recipes", stock: "stock", wastage: "stock", packaging: "packaging",
  vendors: "vendors", reports: "reports", money: "money", settlements: "settlements", staff: "staff", reminders: "reminders",
};
export const hasFeature = (features: string[] | null | undefined, f: FeatureKey) => !!features?.includes(f);

/** Default plans (the super admin can change them in Admin → Plans) */
export const DEFAULT_PLANS = [
  { key: "starter", name: "Starter", price: 499, maxUsers: 2, sortOrder: 1, description: "Billing, customers, menu and expenses for a small kitchen",
    features: ["preorders", "reminders"] },
  { key: "growth", name: "Growth", price: 999, maxUsers: 5, sortOrder: 2, description: "Adds online ordering, KOT, recipes & stock, staff and reports",
    features: ["preorders", "reminders", "onlineOrders", "kot", "recipes", "stock", "packaging", "vendors", "staff", "reports"] },
  { key: "pro", name: "Pro", price: 1999, maxUsers: 15, sortOrder: 3, description: "Everything: Cash & Bank, payment gateways, Swiggy/Zomato payouts",
    features: ["preorders", "reminders", "onlineOrders", "kot", "recipes", "stock", "packaging", "vendors", "staff", "reports", "money", "settlements", "paymentGateways", "aggregators", "deliveryPartners"] },
] as const;

/** What a restaurant is allowed to use: its plan + add-ons − removed (coming-soon features never count) */
export function allowedFeatures(t: { features?: string[] | null; featuresRemoved?: string[] | null }, planFeatures: string[] | null | undefined) {
  const set = new Set([...(planFeatures ?? []), ...(t.features ?? [])]);
  for (const f of t.featuresRemoved ?? []) set.delete(f);
  return [...set].filter((f) => f in FEATURES && !isComingSoon(f));
}
/** Features actually in use: allowed, and not switched off by the owner */
export function activeFeatures(t: { features?: string[] | null; featuresRemoved?: string[] | null; featuresOff?: string[] | null }, planFeatures: string[] | null | undefined) {
  return allowedFeatures(t, planFeatures).filter((f) => !(t.featuresOff ?? []).includes(f));
}
