import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { can, canEditAnyOrder, canSeeCosts } from "@/lib/permissions";
import { payStatus } from "@/lib/orders";
import { lookupValues } from "@/lib/options";
import { fmtDate, fmtDateTime, fmtTime, inr, inr2, todayIST } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SharePdfButton } from "@/components/share-pdf";
import { DeletePaymentBtn, PaymentForm, CancelPanel, FulfilButtons, PayLinkPanel } from "@/components/order-actions";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const u = await requirePage("orders");
  const { id } = await params;
  const { saved } = await searchParams;
  const o = await db.query.orders.findFirst({
    where: and(eq(schema.orders.id, Number(id)), eq(schema.orders.tenantId, u.tenantId)),
    with: { items: { orderBy: (t) => asc(t.id) }, packaging: { orderBy: (t) => asc(t.id) }, customer: true, payments: { orderBy: (t) => asc(t.id) }, createdBy: true },
  });
  if (!o) notFound();
  const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
  const st = payStatus(Number(o.total), paid);
  const modes = (await lookupValues(u.tenantId, "PAYMENT_MODE")).filter((m) => m !== "Credit");
  const editable = canEditAnyOrder(u) || o.date === todayIST() || (o.isPreorder && o.date >= todayIST());
  const staffIds = [o.cancelRequestedById, o.cancelDecidedById].filter((x): x is number => !!x);
  const names = new Map((staffIds.length ? await db.query.users.findMany({ where: and(eq(schema.users.tenantId, u.tenantId), inArray(schema.users.id, staffIds)) }) : []).map((x) => [x.id, x.name]));
  const setting = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) });
  const code = o.billNo;
  const lines = o.items.map((i) => `${i.name} x${Number(i.qty)} = ₹${Number(i.lineTotal)}`).join("\n");
  const msg = `*${setting?.name ?? "Restaurant"}* - Bill ${code}\n${fmtDate(o.date)}\n\n${lines}\n\n*Total: ₹${Number(o.total)}*` +
    (o.isPreorder ? `\n\n🗓️ Pre-order for ${fmtDate(o.date)}${o.mealSlot ? `, ${o.mealSlot}` : ""}${o.slotTime ? ` at ${fmtTime(o.slotTime)}` : ""}` : "") +
    (st.due > 0 ? `\nDue: ₹${st.due}` : "\nPaid - thank you!") +
    (st.due > 0 && o.payLinkShort && o.payLinkStatus === "created" ? `\nPay online: ${o.payLinkShort}` : "") +
    (setting?.upiId && st.due > 0 ? `\nPay by UPI: ${setting.upiId}` : "") +
    (!setting?.upiId && setting?.payLinkUrl && st.due > 0 ? `\nPay here: ${setting.payLinkUrl}` : "");
  const phone = (o.customer?.phone ?? "").replace(/\D/g, "");
  const wa = `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(msg)}`;
  const margin = Number(o.taxable) - Number(o.foodCost);

  return (
    <div className="mx-auto max-w-3xl">
      {saved && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">✓ Order saved</div>}
      <PageHeader
        title={code}
        subtitle={<>{fmtDate(o.date)} · {o.orderType}{o.tableNo ? ` · Table ${o.tableNo}` : ""} · by {o.createdBy?.name ?? "—"} · {fmtDateTime(o.createdAt)}</>}
        actions={<>
          <Link href={`/bill/${o.id}`} className="btn-primary">🧾 Bill / Print</Link>
          {o.kotNo && <Link href={`/kot/${o.id}`} className="btn-gold">🍳 Print KOT #{o.kotNo}</Link>}
          <SharePdfButton orderId={o.id} billNo={o.billNo} phone={o.customer?.phone ?? ""} message={msg} label="📄 WhatsApp bill (PDF)" />
          <a href={wa} target="_blank" className="btn-ghost">WhatsApp text</a>
          {editable && o.status === "ACTIVE" && o.cancelStatus !== "REQUESTED" && <Link href={`/orders/${o.id}/edit`} className="btn-ghost">Edit</Link>}
        </>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {o.status === "CANCELLED" && <Badge tone="gray">Cancelled</Badge>}
        {o.isPreorder && <Badge tone="amber">Pre-order</Badge>}
        {o.kotNo && <Badge tone={o.kotStatus === "READY" || o.kotStatus === "SERVED" ? "green" : "amber"}>KOT #{o.kotNo} · {({ NEW: "sent to kitchen", PREPARING: "cooking", READY: "ready", SERVED: "served" } as Record<string, string>)[o.kotStatus] ?? o.kotStatus}</Badge>}
      </div>
      {o.isPreorder && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold bg-gold-light/40 px-4 py-3 text-sm">
          <div>
            <div className="font-bold">🗓️ For {fmtDate(o.date)}{o.mealSlot ? ` · ${o.mealSlot}` : ""}{o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}</div>
            {o.bookedOn && <div className="text-xs text-muted">Booked on {fmtDate(o.bookedOn)}</div>}
          </div>
          {o.status === "ACTIVE" && <FulfilButtons orderId={o.id} status={o.fulfilStatus || "PENDING"} />}
        </div>
      )}
      {(o.cancelStatus === "REQUESTED" || o.status === "CANCELLED" || o.cancelStatus === "REJECTED") && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${o.status === "CANCELLED" ? "border-red-200 bg-red-50 text-red-800" : o.cancelStatus === "REQUESTED" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-white"}`}>
          <div className="font-bold">{o.status === "CANCELLED" ? "Bill cancelled" : o.cancelStatus === "REQUESTED" ? "Cancellation requested - waiting for approval" : "Cancellation request was rejected"}</div>
          {o.cancelReason && <div>Reason: {o.cancelReason}</div>}
          {o.cancelMoney === "REFUNDED" && <div className="font-semibold">Money received was refunded to the customer (see Payments below).</div>}
          {o.cancelMoney === "ADVANCE" && <div className="font-semibold">Money received was kept as the customer&apos;s advance.</div>}
          {o.cancelRequestedAt && <div className="text-xs">Requested by {names.get(o.cancelRequestedById ?? 0) ?? "—"} · {fmtDateTime(o.cancelRequestedAt)}</div>}
          {o.cancelDecidedAt && <div className="text-xs">{o.cancelStatus === "REJECTED" ? "Rejected" : "Approved"} by {names.get(o.cancelDecidedById ?? 0) ?? "—"} · {fmtDateTime(o.cancelDecidedAt)}{o.cancelNote ? ` · “${o.cancelNote}”` : ""}</div>}
          {o.cancelStatus === "REQUESTED" && <div className="mt-1 text-xs">Until approved, this bill counts in sales and can't be edited.</div>}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Customer">
          {o.customer ? (
            <div className="text-sm">
              <Link href={`/customers/${o.customer.id}`} className="font-semibold text-brand hover:underline">{o.customer.name}</Link>
              <div>{o.customer.phone}</div>
              <div className="text-muted">{[o.customer.flat, o.customer.area].filter(Boolean).join(", ")}</div>
              {o.customer.notes && <div className="mt-1 text-xs text-amber-800">Note: {o.customer.notes}</div>}
            </div>
          ) : <p className="text-sm text-muted">Walk-in (no customer)</p>}
          {o.notes && <p className="mt-2 rounded-lg bg-cream px-2 py-1 text-sm">📝 {o.notes}</p>}
        </Card>
        <Card title="Amount">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Items</dt><dd className="tabular-nums">{inr2(Number(o.itemsTotal))}</dd></div>
            {Number(o.itemDiscount) + Number(o.orderDiscount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{inr2(Number(o.itemDiscount) + Number(o.orderDiscount))}</dd></div>}
            {Number(o.deliveryCharge) > 0 && <div className="flex justify-between"><dt>Delivery</dt><dd>{inr2(Number(o.deliveryCharge))}</dd></div>}
            {Number(o.packingCharge) > 0 && <div className="flex justify-between"><dt>Packing</dt><dd>{inr2(Number(o.packingCharge))}</dd></div>}
            {Number(o.gstAmount) > 0 && <div className="flex justify-between"><dt>GST {Number(o.gstRate)}%</dt><dd>{inr2(Number(o.gstAmount))}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Total</dt><dd>{inr(Number(o.total))}</dd></div>
            <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>{inr2(paid)}</dd></div>
            {st.due > 0 && <div className="flex justify-between font-bold text-red-700"><dt>Due</dt><dd>{inr2(st.due)}</dd></div>}
            {canSeeCosts(u) && (
              <div className="mt-2 border-t border-dashed border-line pt-2 text-xs text-muted">
                Food + packaging cost ≈ {inr(Number(o.foodCost))} · margin ≈ <b className={margin < 0 ? "text-red-700" : "text-emerald-700"}>{inr(margin)}</b>
              </div>
            )}
          </dl>
        </Card>
      </div>
      <Card title="Items" className="mt-4">
        <table className="tbl">
          <thead><tr><th>Dish</th><th className="!text-right">Qty</th><th className="!text-right">Rate</th><th className="!text-right">Amount</th></tr></thead>
          <tbody>{o.items.map((i) => (
            <tr key={i.id}><td>{i.name}{Number(i.discount) > 0 && <span className="text-xs text-emerald-700"> (−{inr(Number(i.discount))})</span>}</td>
              <td className="num">{Number(i.qty)}</td><td className="num">{inr(Number(i.rate))}</td><td className="num">{inr2(Number(i.lineTotal))}</td></tr>
          ))}
</tbody>
        </table>
        {o.packaging.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-line bg-cream/60 p-3 text-sm">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">📦 Packaging used · {o.packagingCharged ? `charged on the bill (${inr2(Number(o.packingCharge))})` : "internal (not on the bill)"}</div>
            <ul className="space-y-0.5">{o.packaging.map((p) => (
              <li key={p.id} className="flex justify-between"><span>{p.name} × {Number(p.qty)}</span>{canSeeCosts(u) && <span className="tabular-nums text-muted">cost {inr2(Number(p.qty) * Number(p.unitCost))}</span>}</li>
            ))}</ul>
            {canSeeCosts(u) && <div className="mt-1 border-t border-line pt-1 text-xs text-muted">Packaging cost on this order: <b>{inr2(Number(o.packagingCost))}</b> (counted in food cost &amp; margin, taken off packaging stock)</div>}
          </div>
        )}
      </Card>
      <Card title="Payments" className="mt-4">
        {o.payments.length ? (
          <ul className="mb-3 divide-y divide-line text-sm">
            {o.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-1.5">
                <span>{fmtDate(p.date)} · {p.mode}{p.notes ? ` · ${p.notes}` : ""}</span>
                <span className="flex items-center gap-3"><b className={`tabular-nums ${Number(p.amount) < 0 ? "text-red-700" : ""}`}>{Number(p.amount) < 0 ? "−" + inr2(-Number(p.amount)) : inr2(Number(p.amount))}</b>{canEditAnyOrder(u) && <DeletePaymentBtn id={p.id} />}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mb-3 text-sm text-muted">No payment yet.</p>}
        {o.status === "ACTIVE" && st.due > 0 && <PaymentForm orderId={o.id} due={st.due} modes={modes} today={todayIST()} />}
        {o.status === "ACTIVE" && setting?.razorpayKeyId && (st.due > 0 || o.payLinkId) && (
          <div className="mt-3"><PayLinkPanel orderId={o.id} link={o.payLinkShort} linkStatus={o.payLinkStatus} due={st.due} phone={o.customer?.phone ?? ""} restaurant={setting.name} billNo={o.billNo} /></div>
        )}
      </Card>
      <Card title="Cancel bill" className="mt-4">
        <CancelPanel orderId={o.id} status={o.status} cancelStatus={o.cancelStatus} canApprove={can(u, "approveCancel")}
          paid={paid} payModes={[...new Set(o.payments.filter((p) => Number(p.amount) > 0).map((p) => p.mode))]} hasCustomer={!!o.customerId} />
      </Card>
    </div>
  );
}
