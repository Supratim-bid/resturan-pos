import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { paidByOrder, payStatus } from "@/lib/orders";
import { lookupValues } from "@/lib/options";
import { fmtDate, inr, todayIST } from "@/lib/format";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ReceivePayment } from "@/components/receive-payment";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("customers");
  const T = u.tenantId;
  const id = Number((await params).id);
  const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, id), eq(schema.customers.tenantId, T)) });
  const setting = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, T) });
  if (!c) notFound();
  const [ords, pays, modes] = await Promise.all([
    db.query.orders.findMany({ where: and(eq(schema.orders.tenantId, T), eq(schema.orders.customerId, id)), with: { items: true }, orderBy: [desc(schema.orders.date), desc(schema.orders.id)] }),
    db.query.payments.findMany({ where: and(eq(schema.payments.tenantId, T), eq(schema.payments.customerId, id)), orderBy: [desc(schema.payments.date), desc(schema.payments.id)] }),
    lookupValues(T, "PAYMENT_MODE"),
  ]);
  const active = ords.filter((o) => o.status === "ACTIVE");
  const paid = await paidByOrder(T, active.map((o) => o.id));
  const billed = active.reduce((s, o) => s + Number(o.total), 0);
  const cancelledIds = new Set(ords.filter((o) => o.status !== "ACTIVE").map((o) => o.id));
  const received = pays.filter((p) => !p.orderId || !cancelledIds.has(p.orderId)).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.round((billed - received) * 100) / 100;
  const fav = new Map<string, number>();
  for (const o of active) for (const i of o.items) fav.set(i.name, (fav.get(i.name) ?? 0) + Number(i.qty));
  const favs = [...fav].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const phone = c.phone.replace(/\D/g, "");
  const wa = `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(`Namaskar ${c.name.split(" (")[0]}! Your pending amount with ${setting?.name ?? "us"} is ₹${balance}. Thank you!`)}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={c.name} subtitle={[c.phone, c.flat, c.area].filter(Boolean).join(" · ")}
        actions={<><Link href="/orders/new" className="btn-primary">+ New order</Link>{balance > 0 && phone && <a href={wa} target="_blank" className="btn-ghost">Send due reminder</a>}</>} />
      {c.notes && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">📝 {c.notes}</p>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Orders" value={active.length} />
        <Stat label="Total billed" value={inr(billed)} />
        <Stat label="Received" value={inr(received)} tone="green" />
        <Stat label={balance < 0 ? "Advance" : "Balance due"} value={inr(Math.abs(balance))} tone={balance > 0.5 ? "red" : "green"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Receive payment"><ReceivePayment customerId={id} due={Math.max(0, balance)} modes={modes.filter((m) => m !== "Credit")} today={todayIST()} /></Card>
        <Card title="Favourite dishes">
          {favs.length ? <ul className="text-sm">{favs.map(([n, q]) => <li key={n} className="flex justify-between py-0.5"><span>{n}</span><b>{q}</b></li>)}</ul> : <p className="text-sm text-muted">No orders yet.</p>}
          {c.birthday && <p className="mt-2 text-sm">🎂 Birthday: {fmtDate(c.birthday)}</p>}
        </Card>
      </div>
      <Card title="Orders" className="mt-4">
        {ords.length ? (
          <ul className="divide-y divide-line">
            {ords.map((o) => {
              const s = payStatus(Number(o.total), paid.get(o.id) ?? 0);
              return (
                <li key={o.id}><Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand">
                  <span><b>{o.billNo}</b> · {fmtDate(o.date)} · {o.orderType}</span>
                  <span className="flex items-center gap-2"><b className="tabular-nums">{inr(Number(o.total))}</b>
                    {o.status === "CANCELLED" ? <Badge>Cancelled</Badge> : <Badge tone={s.tone}>{s.label}</Badge>}</span>
                </Link></li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted">No orders yet.</p>}
      </Card>
      <Card title="Payments received" className="mt-4">
        {pays.length ? (
          <ul className="divide-y divide-line text-sm">
            {pays.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5"><span>{fmtDate(p.date)} · {p.mode}{p.orderId ? "" : " · advance"}{p.notes ? ` · ${p.notes}` : ""}</span><b className="tabular-nums">{inr(Number(p.amount))}</b></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No payments yet.</p>}
      </Card>
    </div>
  );
}
