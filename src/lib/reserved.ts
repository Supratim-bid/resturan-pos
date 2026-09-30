// Top-level paths used by the app itself; a restaurant code can't be one of these
// (restaurants log in at /<code>, e.g. /alooposto).
export const RESERVED_PATHS = [
  "login", "admin", "api", "bill", "img", "logo", "no-access", "more", "orders", "preorders", "customers", "daily-menu", "menu", "recipes",
  "ingredients", "packaging", "stock", "wastage", "expenses", "vendors", "staff", "cash", "settlements", "reports", "reminders", "settings",
  "icon", "apple-icon", "manifest.webmanifest", "favicon.ico", "platform-logo.svg", "_next", "static", "public", "app", "www", "help", "support",
];
export const isRestaurantPath = (seg: string) => /^[a-z0-9][a-z0-9-]{1,30}$/.test(seg) && !RESERVED_PATHS.includes(seg);
