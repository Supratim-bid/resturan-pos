import { FEATURE_TABS } from "./features";
// Tabs (modules) and access rules. The owner can switch each tab on/off per person in Settings.
export type Role = "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN";

export const MODULES = {
  dashboard:  { label: "Dashboard",          href: "/" },
  newOrder:   { label: "New Order",          href: "/orders/new" },
  orders:     { label: "Orders & Bills",     href: "/orders" },
  preorders:  { label: "Pre-orders",         href: "/preorders" },
  onlineOrders: { label: "Online Orders",    href: "/online-orders" },
  kot:        { label: "Kitchen (KOT)",      href: "/kot" },
  delivery:   { label: "Delivery",           href: "/delivery" },
  customers:  { label: "Customers & Dues",   href: "/customers" },
  dailyMenu:  { label: "Today's Menu",       href: "/daily-menu" },
  menu:       { label: "Menu",               href: "/menu" },
  recipes:    { label: "Recipes & Costing",  href: "/recipes" },
  ingredients:{ label: "Ingredient Rates",   href: "/ingredients" },
  packaging:  { label: "Packaging",          href: "/packaging" },
  stock:      { label: "Stock",              href: "/stock" },
  wastage:    { label: "Wastage",            href: "/wastage" },
  expenses:   { label: "Expenses",           href: "/expenses" },
  vendors:    { label: "Vendors & Dues",     href: "/vendors" },
  staff:      { label: "Staff & Attendance", href: "/staff" },
  cash:       { label: "Cash Closing",       href: "/cash" },
  money:      { label: "Cash & Bank",        href: "/money" },
  settlements:{ label: "Swiggy/Zomato Payouts", href: "/settlements" },
  reports:    { label: "Reports & P&L",      href: "/reports" },
  reminders:  { label: "Reminders",          href: "/reminders" },
  settings:   { label: "Settings & Users",   href: "/settings" },
} as const;
export type ModuleKey = keyof typeof MODULES;

/** Extra powers that are not tabs */
export const POWERS = {
  seeCosts: "See costs, margins & profit",
  editPastOrders: "Edit past orders & delete payments",
  approveCancel: "Cancel bills / approve cancellation requests",
} as const;
export type PowerKey = keyof typeof POWERS;
export type PermKey = ModuleKey | PowerKey;

export const ALL_PERMS = [...Object.keys(MODULES), ...Object.keys(POWERS)] as PermKey[];

/** Starting access for each role (owner can change per person) */
export const ROLE_DEFAULTS: Record<Role, PermKey[]> = {
  OWNER: ALL_PERMS,
  MANAGER: ALL_PERMS.filter((k) => k !== "reports" && k !== "settings" && k !== "approveCancel" && k !== "money"),
  CASHIER: ["newOrder", "orders", "preorders", "onlineOrders", "customers", "dailyMenu", "expenses", "cash", "delivery"],
  KITCHEN: ["kot", "preorders", "dailyMenu", "recipes", "stock", "wastage"],
};

export type Perms = { role: Role; perms: PermKey[]; features?: string[] };

/** Owners always have everything; others use their saved list or the role default */
export function effectivePerms(role: Role, saved: string[] | null | undefined): PermKey[] {
  if (role === "OWNER") return ALL_PERMS;
  const list = (saved ?? ROLE_DEFAULTS[role]).filter((k): k is PermKey => (ALL_PERMS as string[]).includes(k));
  return list.filter((k) => k !== "settings"); // settings & users stay owner-only
}

export function can(u: Perms, k: PermKey) {
  const f = FEATURE_TABS[k];
  if (f && !u.features?.includes(f)) return false; // feature not switched on for this restaurant
  return u.role === "OWNER" || u.perms.includes(k);
}
export const canSeeCosts = (u: Perms) => can(u, "seeCosts");
export const canEditAnyOrder = (u: Perms) => can(u, "editPastOrders");

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier / Counter", KITCHEN: "Kitchen",
};
