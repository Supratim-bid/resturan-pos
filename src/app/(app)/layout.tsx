import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { MODULES, can, ROLE_LABEL, type ModuleKey } from "@/lib/permissions";
import { themeCss } from "@/lib/theme";
import { BottomNav, NavProgress, SideNav, type NavItem } from "@/components/nav";
import { logout } from "../actions/auth";
import { db, schema } from "@/db";

const ICONS: Record<ModuleKey, string> = {
  dashboard: "🏠", newOrder: "＋", orders: "🧾", preorders: "🗓️", onlineOrders: "📲", kot: "🍳", delivery: "🏍️", customers: "👥", dailyMenu: "📅", menu: "🍛", recipes: "📖",
  ingredients: "🧅", packaging: "📦", stock: "🏷️", wastage: "🗑️", expenses: "💸", vendors: "🚚", staff: "👨‍🍳",
  cash: "💰", money: "🏦", settlements: "🛵", reports: "📊", reminders: "⏰", settings: "⚙️",
};
const SHORT: Partial<Record<ModuleKey, string>> = { kot: "Kitchen", delivery: "Delivery", onlineOrders: "Online", preorders: "Pre-orders", newOrder: "New", dashboard: "Home", dailyMenu: "Today", orders: "Orders", customers: "Customers", cash: "Cash" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const setting = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, user.tenantId) });
  const allowed = (Object.keys(MODULES) as ModuleKey[]).filter((k) => can(user, k));
  const side: NavItem[] = allowed.map((k) => ({ href: MODULES[k].href, label: MODULES[k].label, icon: ICONS[k] }));
  // bottom bar: up to 4 most-used tabs this person can open, New Order in the middle when allowed
  const prefer: ModuleKey[] = ["dashboard", "orders", "newOrder", "customers", "delivery", "kot", "dailyMenu", "preorders", "cash", "recipes", "stock", "wastage", "expenses", "menu", "reports"];
  let bottomKeys = prefer.filter((k) => allowed.includes(k)).slice(0, 4);
  if (bottomKeys.includes("newOrder")) bottomKeys = [...bottomKeys.filter((k) => k !== "newOrder").slice(0, 2), "newOrder", ...bottomKeys.filter((k) => k !== "newOrder").slice(2)];
  const bottom = [...bottomKeys.map((k) => ({ href: MODULES[k].href, label: SHORT[k] ?? MODULES[k].label.split(" ")[0], icon: ICONS[k] })), { href: "/more", label: "More", icon: "☰" }];
  const name = setting?.name ?? "Restaurant";

  return (
    <div className="md:flex">
      <NavProgress />
      <style dangerouslySetInnerHTML={{ __html: themeCss(setting?.primaryColor, setting?.accentColor) }} />
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-gold/30 bg-white p-3 md:flex">
        <Link href="/" className="mb-3 flex items-center gap-2 px-2 py-1">
          <img src="/logo" alt="" className="h-12 w-12 rounded-full bg-white object-cover ring-2 ring-gold/60" />
          <div className="min-w-0"><div className="truncate font-display text-lg font-bold leading-tight text-brand">{name}</div><div className="text-[11px] text-muted">{setting?.tagline || "Restaurant Manager"}</div></div>
        </Link>
        <SideNav items={side} />
        <div className="mt-auto border-t border-line pt-3 text-xs">
          <div className="flex items-center gap-2 px-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-light font-bold text-ink">{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0"><div className="truncate font-semibold">{user.name}</div><div className="text-muted">{ROLE_LABEL[user.role]} · @{user.username}</div></div>
          </div>
          <form action={logout}><button className="btn-ghost btn-sm mt-2 w-full">Log out</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-gold/40 bg-cream/95 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/more" className="flex min-w-0 items-center gap-2"><img src="/logo" alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover ring-2 ring-gold/60" /><span className="truncate font-display text-lg font-bold text-brand">{name}</span></Link>
          <Link href="/more" className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-line">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-light text-xs font-bold">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="max-w-24 truncate text-xs font-semibold">{user.name.split(" ")[0]}</span>
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-44 pt-4 md:px-6 md:pb-10 md:pt-6">{children}</main>
      </div>
      <BottomNav items={bottom} />
    </div>
  );
}
