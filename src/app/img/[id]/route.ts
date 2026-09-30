import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { COOKIE, verifySession } from "@/lib/session";

// Logos are public (login page, bills). Dish photos are only served to people of the same restaurant.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const img = await db.query.images.findFirst({ where: eq(schema.images.id, id) });
  if (!img) return new Response("Not found", { status: 404 });
  const isLogo = !!(await db.query.settings.findFirst({ where: and(eq(schema.settings.tenantId, img.tenantId), eq(schema.settings.logoImageId, id)) }));
  if (!isLogo) {
    const s = await verifySession((await cookies()).get(COOKIE)?.value);
    if (!s || s.tid !== img.tenantId) return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": `${isLogo ? "public" : "private"}, max-age=31536000, immutable` },
  });
}
