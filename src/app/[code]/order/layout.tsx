import type { Metadata, Viewport } from "next";
import { isRestaurantPath } from "@/lib/reserved";
import { brandOf } from "@/lib/pwa";

// Every customer page of a restaurant installs as that restaurant's own app (its name, logo and colour)
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = (await params).code.toLowerCase();
  if (!isRestaurantPath(code)) return {};
  const b = await brandOf(code);
  if (!b) return {};
  return {
    applicationName: b.s.name,
    manifest: `/${code}/order/manifest.webmanifest`,
    icons: { icon: `/pwa/${code}/icon-192.png`, apple: `/pwa/${code}/apple-180.png` },
    appleWebApp: { capable: true, title: b.s.name, statusBarStyle: "default" },
  };
}
export async function generateViewport({ params }: { params: Promise<{ code: string }> }): Promise<Viewport> {
  const code = (await params).code.toLowerCase();
  const b = isRestaurantPath(code) ? await brandOf(code) : null;
  return { themeColor: b?.color ?? "#9a1c1f" };
}
export default function OrderLayout({ children }: { children: React.ReactNode }) { return children; }
