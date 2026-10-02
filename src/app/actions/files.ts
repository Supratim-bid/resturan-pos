"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getUser, requireAction } from "@/lib/auth";
import { can } from "@/lib/permissions";

type R = { ok: true; msg?: string } | { ok: false; error: string };

const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX = 5_000_000; // 5 MB
const KINDS = ["FSSAI", "GST", "DOC"];

/** Owner uploads a restaurant document (FSSAI, GST certificate, other). Super admin can see these. */
export async function uploadDocAction(fd: FormData): Promise<R> {
  try {
    const u = await getUser();
    if (!u || !can(u, "help")) return { ok: false, error: "You don't have access." };
    if (!can(u, "settings")) return { ok: false, error: "Only the owner can upload documents." };
    const kind = String(fd.get("kind") || "DOC");
    if (!KINDS.includes(kind)) return { ok: false, error: "Unknown document type." };
    const title = String(fd.get("title") || "").trim() || (kind === "FSSAI" ? "FSSAI licence" : kind === "GST" ? "GST certificate" : "Document");
    const docNumber = String(fd.get("docNumber") || "").trim();
    const expiryRaw = String(fd.get("expiry") || "").trim();
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : null;
    const f = fd.get("file");
    if (!(f instanceof Blob) || f.size === 0) return { ok: false, error: "Choose a file to upload." };
    if (!DOC_TYPES.includes(f.type)) return { ok: false, error: "Use a PDF, JPG, PNG or WebP file." };
    if (f.size > MAX) return { ok: false, error: "File is too large (max 5 MB)." };
    const buf = Buffer.from(await f.arrayBuffer());
    const filename = ("name" in f && typeof (f as File).name === "string" ? (f as File).name : `${title}`).slice(0, 180);
    await db.insert(schema.files).values({
      tenantId: u.tenantId, kind, title: title.slice(0, 120), filename, mime: f.type, size: f.size, data: buf,
      docNumber: docNumber.slice(0, 60), expiry, uploadedById: u.id, byAdmin: false,
    });
    revalidatePath("/help");
    return { ok: true, msg: "Uploaded." };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

export async function deleteDocAction(id: number): Promise<R> {
  try {
    const u = await requireAction("settings");
    await db.delete(schema.files).where(and(eq(schema.files.id, id), eq(schema.files.tenantId, u.tenantId)));
    revalidatePath("/help");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/** Owner sends a message to the platform support team. */
export async function sendSupportMessageAction(body: string): Promise<R> {
  try {
    const u = await requireAction("help");
    const text = body.trim();
    if (text.length < 3) return { ok: false, error: "Type your message." };
    if (text.length > 4000) return { ok: false, error: "Message is too long." };
    await db.insert(schema.supportMessages).values({ tenantId: u.tenantId, fromUserId: u.id, fromName: u.name, body: text });
    revalidatePath("/help");
    return { ok: true, msg: "Sent. We usually reply within 24 hours." };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
