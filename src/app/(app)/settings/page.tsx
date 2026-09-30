import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { effectivePerms } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";
import { CrudManager } from "@/components/crud";
import { featureInfo, tenantWithPlan } from "@/lib/plans";
import { POLICY_KINDS, POLICY_PAGES, defaultPolicy } from "@/lib/policies";
import { OwnFeatures, PaymentSettings, PolicyPages, SettingsForm, UsersManager } from "@/components/settings-forms";
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
  const tp = await tenantWithPlan({ id: T });
  const fi = tp ? featureInfo(tp.t, tp.plan) : null;
  const SECRET = ["razorpayKeySecret", "razorpayWebhookSecret", "instamojoClientSecret", "instamojoSalt", "cashfreeSecret"];
  const init = Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => !SECRET.includes(k)).map(([k, v]) => [k, v == null ? "" : String(v)]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "your-app"}`;
  const lf = ENTITIES.lookups.fields;
  const lo = await resolveOptions(T, lf);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings & Users" subtitle={<>Restaurant code for staff login: <b className="font-mono text-ink">{tenant?.code}</b> · login link: <a className="font-mono text-brand underline" href={`/${tenant?.code}`}>{origin.replace(/^https?:\/\//, "")}/{tenant?.code}</a></>} />
      <Card title={`Your plan: ${fi?.plan?.name ?? tenant?.plan ?? "-"}`}>
        <p className="mb-3 text-sm text-muted">Logins in use: <b className="text-ink">{users.filter((x) => x.active).length}{fi?.maxUsers ? ` of ${fi.maxUsers}` : ""}</b>. Switch off anything you don&apos;t need right now; ask the platform admin to add more features or logins.</p>
        <OwnFeatures allowed={fi?.allowed ?? []} off={tenant?.featuresOff ?? []} />
      </Card>
      <Card title="Logo"><LogoSettings custom={!!s?.logoImageId} /></Card>
      <Card title="Payment QR on bills"><QrSettings imageId={s?.qrImageId ?? null} upiId={s?.upiId ?? ""} /></Card>
      <Card title="Logins & access">
        <UsersManager meId={me.id} features={me.features} users={users.map((u) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone, role: u.role, active: u.active, perms: effectivePerms(u.role, u.permissions) }))} />
      </Card>
      <Card title="Restaurant, bills & theme"><SettingsForm initial={init} /></Card>
      {s && (me.features.includes("onlineOrders") || me.features.includes("paymentGateways")) && (
        <Card title="Website & policy pages (for payment gateways)">
          <PolicyPages orderUrl={`${origin}/${tenant?.code}/order`} rows={POLICY_KINDS.map((k) => ({
            kind: k, title: POLICY_PAGES[k].title, field: POLICY_PAGES[k].field, url: `${origin}/${tenant?.code}/info/${k}`,
            value: String((s as Record<string, unknown>)[POLICY_PAGES[k].field] ?? ""), ready: defaultPolicy(k, s, tenant?.code ?? "", origin),
          }))} />
        </Card>
      )}
      <Card title="Online payments">
        <PaymentSettings gatewaysAllowed={me.features.includes("paymentGateways")} origin={origin}
          initial={{ payLinkUrl: s?.payLinkUrl ?? "", payGateway: s?.payGateway ?? "", razorpayKeyId: s?.razorpayKeyId ?? "", instamojoClientId: s?.instamojoClientId ?? "", instamojoTest: !!s?.instamojoTest, cashfreeAppId: s?.cashfreeAppId ?? "", cashfreeTest: !!s?.cashfreeTest }}
          saved={{ razorpaySecret: !!s?.razorpayKeySecret, razorpayWebhook: !!s?.razorpayWebhookSecret, instamojoSecret: !!s?.instamojoClientSecret, instamojoSalt: !!s?.instamojoSalt, cashfreeSecret: !!s?.cashfreeSecret }} />
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
