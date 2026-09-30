import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRestaurantPath } from "@/lib/reserved";

export const runtime = "nodejs";

const FILES: Record<string, { size: number; pad: number }> = {
  "icon-192.png": { size: 192, pad: 0 },
  "icon-512.png": { size: 512, pad: 0 },
  "maskable-512.png": { size: 512, pad: 0.18 }, // Android crops to a circle / squircle: keep the logo inside the safe zone
  "apple-180.png": { size: 180, pad: 0 },
};

async function platformIcon() {
  const b = await readFile(path.join(process.cwd(), "public", "icon-512.png"));
  return `data:image/png;base64,${b.toString("base64")}`;
}

// Home-screen app icon made from the restaurant's logo: /pwa/<code>/icon-192.png … ("_" = the platform icon)
export async function GET(_: Request, { params }: { params: Promise<{ code: string; file: string }> }) {
  const { code: raw, file } = await params;
  const f = FILES[file];
  if (!f) return new Response("Not found", { status: 404 });
  const code = raw.toLowerCase();
  let src: string | null = null, bg = "#ffffff";
  if (code !== "_" && isRestaurantPath(code)) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
    const s = t ? await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) }) : null;
    if (s?.logoImageId) {
      const img = await db.query.images.findFirst({ where: eq(schema.images.id, s.logoImageId) });
      if (img && img.tenantId === t!.id && ["image/jpeg", "image/png"].includes(img.mime)) src = `data:${img.mime};base64,${Buffer.from(img.data).toString("base64")}`;
    }
  }
  if (!src) { src = await platformIcon(); bg = "#fdf8f2"; }
  const inner = Math.round(f.size * (1 - 2 * f.pad));
  return new ImageResponse(
    (
      <div style={{ width: f.size, height: f.size, display: "flex", alignItems: "center", justifyContent: "center", background: bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={inner} height={inner} style={{ objectFit: "cover", borderRadius: f.pad ? inner / 2 : 0 }} alt="" />
      </div>
    ),
    { width: f.size, height: f.size, headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
