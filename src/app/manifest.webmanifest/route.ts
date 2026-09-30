import { APP_NAME, brandOf, currentCode, pwaIcons } from "@/lib/pwa";

// Staff app: named after the restaurant logged in on this device, with its logo as the app icon
export async function GET() {
  const code = await currentCode();
  const b = await brandOf(code);
  const name = b ? `${b.s.name} · ${APP_NAME}` : APP_NAME;
  const body = {
    id: "/", name, short_name: (b?.s.name || APP_NAME).slice(0, 12), description: "Orders, billing, kitchen, stock and accounts",
    start_url: "/", scope: "/", display: "standalone", orientation: "any",
    background_color: "#fdf8f2", theme_color: b?.color ?? "#9a1c1f", icons: pwaIcons(b ? code : "_"),
    shortcuts: [
      { name: "New order", url: "/orders/new" },
      { name: "Online orders", url: "/online-orders" },
      { name: "Kitchen (KOT)", url: "/kot" },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-cache" } });
}
