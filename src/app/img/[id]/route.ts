import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { COOKIE, verifySession } from "@/lib/session";

async function onlinePublicImage(tenantId: number, id: number) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!t?.active || !(t.features ?? []).includes("onlineOrders")) return false;
  const dish = await db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.tenantId, tenantId), eq(schema.menuItems.imageId, id), eq(schema.menuItems.active, true)) });
  if (dish) return true;
  return !!(await db.query.settings.findFirst({ where: and(eq(schema.settings.tenantId, tenantId), eq(schema.settings.qrImageId, id)) }));
}

// Logos are public (login page, bills). Dish photos are only served to people of the same restaurant,
// except for restaurants taking online orders (their menu photos and payment QR are public).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const img = await db.query.images.findFirst({ where: eq(schema.images.id, id) });
  if (!img) return new Response("Not found", { status: 404 });
  const isLogo = !!(await db.query.settings.findFirst({ where: and(eq(schema.settings.tenantId, img.tenantId), eq(schema.settings.logoImageId, id)) }));
  // restaurants with online ordering show dish photos and their payment QR to customers
  const isPublic = isLogo || (await onlinePublicImage(img.tenantId, id));
  if (!isPublic) {
    const s = await verifySession((await cookies()).get(COOKIE)?.value);
    if (!s || s.tid !== img.tenantId) return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": `${isPublic ? "public" : "private"}, max-age=31536000, immutable` },
  });
}
