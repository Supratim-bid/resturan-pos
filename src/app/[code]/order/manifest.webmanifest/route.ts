import { loadStorefront } from "@/lib/online";
import { isRestaurantPath } from "@/lib/reserved";
import { pwaIcons } from "@/lib/pwa";

// Customer ordering app for one restaurant: its name, colours and logo; opens straight to its menu
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!isRestaurantPath(code)) return new Response("Not found", { status: 404 });
  const store = await loadStorefront(code);
  if (!store) return new Response("Not found", { status: 404 });
  const c = store.config;
  const body = {
    id: `/${code}/order`, name: c.name, short_name: c.name.slice(0, 12), description: c.tagline || `Order from ${c.name}`,
    start_url: `/${code}/order`, scope: `/${code}/`, display: "standalone", orientation: "portrait",
    background_color: "#fdf8f2", theme_color: c.primary || "#9a1c1f", icons: pwaIcons(code),
    shortcuts: [{ name: "My orders", url: `/${code}/order/my` }],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
