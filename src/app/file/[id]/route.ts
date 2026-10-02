import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COOKIE, ADMIN_COOKIE, verifySession, verifyAdmin } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download a stored file. Admin resources (tenant_id null) are for any logged-in restaurant user or super admin.
// A restaurant's own documents are for that restaurant's users, or a super admin.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const f = await db.query.files.findFirst({ where: eq(schema.files.id, id) });
  if (!f) return new Response("Not found", { status: 404 });

  const jar = await cookies();
  const admin = await verifyAdmin(jar.get(ADMIN_COOKIE)?.value);
  const sess = await verifySession(jar.get(COOKIE)?.value);
  const allowed = !!admin                                   // super admin can see any file
    || (f.tenantId == null && !!sess)                        // shared resource: any logged-in restaurant user
    || (f.tenantId != null && sess?.tid === f.tenantId);     // a restaurant's own document
  if (!allowed) return new Response("Not allowed", { status: 403 });

  const download = new URL(req.url).searchParams.get("inline") ? "inline" : "attachment";
  const safe = (f.filename || f.title || `file-${f.id}`).replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime || "application/octet-stream",
      "Content-Disposition": `${download}; filename="${safe}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
