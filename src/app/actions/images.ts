"use server";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 1_500_000;

/** Upload a (client-resized) image for this restaurant. */
export async function uploadImageAction(fd: FormData): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const u = await getUser();
  if (!u || !(can(u, "menu") || can(u, "settings") || can(u, "packaging"))) return { ok: false, error: "You don't have access to upload images." };
  const f = fd.get("file");
  if (!(f instanceof Blob)) return { ok: false, error: "No file received." };
  if (!TYPES.includes(f.type)) return { ok: false, error: "Use a JPG, PNG or WebP image." };
  if (f.size > MAX) return { ok: false, error: "Image is too large (max 1.5 MB after resizing)." };
  const buf = Buffer.from(await f.arrayBuffer());
  const [row] = await db.insert(schema.images).values({
    tenantId: u.tenantId, mime: f.type, data: buf, width: Number(fd.get("w")) || null, height: Number(fd.get("h")) || null,
  }).returning({ id: schema.images.id });
  return { ok: true, id: row.id };
}

/** Delete an image unless it is still used as logo or by a dish */
export async function deleteImageIfUnused(tenantId: number, id: number | null | undefined) {
  if (!id) return;
  const [s, m, pk] = await Promise.all([
    db.query.settings.findFirst({ where: and(eq(schema.settings.tenantId, tenantId), or(eq(schema.settings.logoImageId, id), eq(schema.settings.qrImageId, id))) }),
    db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.tenantId, tenantId), eq(schema.menuItems.imageId, id)) }),
    db.query.packaging.findFirst({ where: and(eq(schema.packaging.tenantId, tenantId), eq(schema.packaging.imageId, id)) }),
  ]);
  if (!s && !m && !pk) await db.delete(schema.images).where(and(eq(schema.images.id, id), eq(schema.images.tenantId, tenantId)));
}

export async function setLogoAction(imageId: number | null): Promise<{ ok: boolean; error?: string }> {
  const u = await getUser();
  if (!u || !can(u, "settings")) return { ok: false, error: "Only the owner can change the logo." };
  if (imageId) {
    const img = await db.query.images.findFirst({ where: and(eq(schema.images.id, imageId), eq(schema.images.tenantId, u.tenantId)) });
    if (!img) return { ok: false, error: "Image not found." };
  }
  const cur = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) });
  await db.update(schema.settings).set({ logoImageId: imageId }).where(eq(schema.settings.tenantId, u.tenantId));
  if (cur?.logoImageId && cur.logoImageId !== imageId) await deleteImageIfUnused(u.tenantId, cur.logoImageId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Payment QR image (the shop's UPI QR) printed on bills */
export async function setQrImageAction(imageId: number | null): Promise<{ ok: boolean; error?: string }> {
  const u = await getUser();
  if (!u || !can(u, "settings")) return { ok: false, error: "Only the owner can change the payment QR." };
  if (imageId) {
    const img = await db.query.images.findFirst({ where: and(eq(schema.images.id, imageId), eq(schema.images.tenantId, u.tenantId)) });
    if (!img) return { ok: false, error: "Image not found." };
  }
  const cur = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) });
  await db.update(schema.settings).set({ qrImageId: imageId }).where(eq(schema.settings.tenantId, u.tenantId));
  if (cur?.qrImageId && cur.qrImageId !== imageId) await deleteImageIfUnused(u.tenantId, cur.qrImageId);
  revalidatePath("/settings");
  return { ok: true };
}
