"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

/** Thin bar at the top the moment any in-app link is tapped, until the next page arrives - so a tap never looks ignored */
export function NavProgress() {
  const p = usePathname();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [p]);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      const u = new URL(href, location.href);
      if (u.pathname === location.pathname && u.search === location.search) return;
      setOn(true);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 15000); return () => clearTimeout(t); }, [on]);
  if (!on) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-gold-light" role="progressbar" aria-label="Loading">
      <div className="h-full w-1/3 animate-[navbar_1s_ease-in-out_infinite] bg-brand" />
      <style>{`@keyframes navbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
