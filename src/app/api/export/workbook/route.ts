import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildWorkbook } from "@/lib/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One Excel workbook with a sheet per area, for the chosen dates: Orders, Items, Payments, Expenses, Reimbursements, Customers.
export async function GET(req: Request) {
  const u = await getUser();
  if (!u || !can(u, "reports")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "2000-01-01", to = url.searchParams.get("to") || "2100-01-01";
  const { buffer, filename } = await buildWorkbook(u.tenantId, from, to, u.tenantCode);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
