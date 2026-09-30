import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { renderBillPdf } from "@/lib/bill-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A4 bill as a PDF: /bill/<id>/pdf  (add ?download=1 to save it instead of opening)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u || !can(u, "orders")) return new Response("Not allowed", { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const pdf = await renderBillPdf(u.tenantId, id);
  if (!pdf) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download");
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
