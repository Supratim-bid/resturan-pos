"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/orders") return path === "/orders" || (path.startsWith("/orders/") && !path.startsWith("/orders/new"));
  return path === href || path.startsWith(href + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const p = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${active(p, i.href) ? "bg-brand text-white shadow-[inset_3px_0_0_var(--color-gold)]" : "text-ink hover:bg-gold-light/70"}`}>
          <span className="w-5 text-center">{i.icon}</span>{i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const p = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
        {items.map((i) => {
          const a = active(p, i.href);
          const isNew = i.href === "/orders/new";
          return (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${a ? "text-brand" : "text-muted"}`}>
              <span className={`flex h-7 items-center justify-center text-lg ${isNew ? "-mt-5 h-12 w-12 rounded-full bg-brand text-2xl text-white shadow-lg ring-4 ring-gold/70" : ""}`}>{i.icon}</span>
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
