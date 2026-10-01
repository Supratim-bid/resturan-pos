import { verifyBill } from "@/lib/session";
import { renderBillPdf } from "@/lib/bill-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared bill PDF - opened from the /b/<token> link, no login
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = await verifyBill((await params).token);
  if (!v) return new Response("This bill link is invalid or has expired.", { status: 404 });
  const pdf = await renderBillPdf(v.tid, v.oid);
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
