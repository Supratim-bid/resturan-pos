import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { effectivePerms } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";
import { CrudManager } from "@/components/crud";
import { PaymentSettings, SettingsForm, UsersManager } from "@/components/settings-forms";
import { headers } from "next/headers";
import { LogoSettings, QrSettings } from "@/components/logo-settings";

const KIND_LABEL: Record<string, string> = {
  ORDER_TYPE: "Order types", PAYMENT_MODE: "Payment modes", EXPENSE_CATEGORY: "Expense categories", STAFF_ROLE: "Staff roles",
  INGREDIENT_CATEGORY: "Ingredient categories", PACKAGING_TYPE: "Packaging types", PLATFORM: "Delivery apps (must match an order type)", MEAL_SLOT: "Meal slots (pre-orders)",
};

export default async function Settings() {
  const me = await requirePage("settings");
  const T = me.tenantId;
  const [s, users, lookups, tenant] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, T) }),
    db.query.users.findMany({ where: eq(schema.users.tenantId, T), orderBy: [asc(schema.users.name)] }),
    db.query.lookups.findMany({ where: eq(schema.lookups.tenantId, T), orderBy: [asc(schema.lookups.kind), asc(schema.lookups.sortOrder), asc(schema.lookups.value)] }),
    db.query.tenants.findFirst({ where: and(eq(schema.tenants.id, T)) }),
  ]);
  const SECRET = ["razorpayKeySecret", "razorpayWebhookSecret"];
  const init = Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => !SECRET.includes(k)).map(([k, v]) => [k, v == null ? "" : String(v)]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "your-app"}`;
  const lf = ENTITIES.lookups.fields;
  const lo = await resolveOptions(T, lf);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings & Users" subtitle={<>Restaurant code for staff login: <b className="font-mono text-ink">{tenant?.code}</b> · login link: <a className="font-mono text-brand underline" href={`/${tenant?.code}`}>{origin.replace(/^https?:\/\//, "")}/{tenant?.code}</a></>} />
      <Card title="Logo"><LogoSettings custom={!!s?.logoImageId} /></Card>
      <Card title="Payment QR on bills"><QrSettings imageId={s?.qrImageId ?? null} upiId={s?.upiId ?? ""} /></Card>
      <Card title="Logins & access">
        <UsersManager meId={me.id} features={me.features} users={users.map((u) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, role: u.role, active: u.active, perms: effectivePerms(u.role, u.permissions) }))} />
      </Card>
      <Card title="Restaurant, bills & theme"><SettingsForm initial={init} /></Card>
      <Card title="Online payments">
        <PaymentSettings initial={{ payLinkUrl: s?.payLinkUrl ?? "", razorpayKeyId: s?.razorpayKeyId ?? "" }} hasSecret={!!s?.razorpayKeySecret} hasWebhook={!!s?.razorpayWebhookSecret}
          webhookUrl={`${origin}/api/pay/razorpay`} />
      </Card>
      <Card title="Dropdown lists">
        <p className="mb-3 text-xs text-muted">Add or rename options used across the app. “Credit” payment mode = not paid yet (used for vendor purchases).</p>
        <CrudManager entity="lookups" title="list value" fields={lf} options={lo} path="/settings" addLabel="Value"
          rows={lookups.map((l) => ({ ...l, list: KIND_LABEL[l.kind] ?? l.kind }))}
          columns={[{ key: "list", label: "List" }, { key: "value", label: "Value", primary: true }, { key: "sortOrder", label: "Order", kind: "num" }]} />
      </Card>
    </div>
  );
}
