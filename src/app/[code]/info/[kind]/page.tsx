import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { restaurantPhones } from "@/lib/format";
import { featureInfo, tenantWithPlan } from "@/lib/plans";
import { POLICY_KINDS, POLICY_PAGES, policyText, type PolicyKind } from "@/lib/policies";

export const dynamic = "force-dynamic";

async function load(codeRaw: string, kindRaw: string) {
  const code = codeRaw.toLowerCase(), kind = kindRaw.toLowerCase() as PolicyKind;
  if (!isRestaurantPath(code) || !POLICY_KINDS.includes(kind)) return null;
  const tp = await tenantWithPlan({ code });
  if (!tp || !tp.t.active) return null;
  const f = featureInfo(tp.t, tp.plan).active;
  if (!f.includes("onlineOrders") && !f.includes("paymentGateways")) return null; // only restaurants that take money online
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tp.t.id) });
  return s ? { code, kind, s, online: f.includes("onlineOrders") } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ code: string; kind: string }> }): Promise<Metadata> {
  const p = await params; const d = await load(p.code, p.kind);
  return d ? { title: `${POLICY_PAGES[d.kind].title} · ${d.s.name}` } : {};
}

/** Very small formatter: "## Heading", "- point", paragraphs */
function Body({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) {
          const [h, ...rest] = b.split("\n");
          return <div key={i}><h2 className="mt-5 font-display text-lg font-bold text-brand">{h.slice(3)}</h2>{rest.length ? <Body text={rest.join("\n")} /> : null}</div>;
        }
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j ? <br /> : null}{l}</span>)}</p>;
      })}
    </div>
  );
}

// Public policy pages for payment gateways and customers: /<code>/info/contact|terms|refund|delivery|privacy
export default async function PolicyPage({ params }: { params: Promise<{ code: string; kind: string }> }) {
  const p = await params;
  const d = await load(p.code, p.kind);
  if (!d) notFound();
  const { s, code, kind } = d;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const phones = restaurantPhones(s);
  return (
    <div className="min-h-dvh bg-cream pb-12">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s.primaryColor, s.accentColor) }} />
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{s.name}</div>
        <div className="text-sm opacity-90">{POLICY_PAGES[kind].title}</div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-5">
        <article className="card">
          <h1 className="mb-3 font-display text-2xl font-bold">{POLICY_PAGES[kind].title}</h1>
          {kind === "contact" ? (
            <div className="space-y-2 text-[15px]">
              <p><b>{s.name}</b></p>
              {s.address && <p>{s.address}</p>}
              {phones.map((x) => <p key={x}>Phone: <a className="text-brand underline" href={`tel:${x.replace(/[^\d+]/g, "")}`}>{x}</a></p>)}
              {s.whatsapp && <p>WhatsApp: {s.whatsapp}</p>}
              {s.email && <p>Email: <a className="text-brand underline" href={`mailto:${s.email}`}>{s.email}</a></p>}
              {s.gstin && <p>GSTIN: {s.gstin}</p>}
              {s.fssai && <p>FSSAI licence: {s.fssai}</p>}
              {s.policyContactNote && <Body text={s.policyContactNote} />}
            </div>
          ) : <Body text={policyText(kind, s, code, origin)} />}
        </article>
        <nav className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
          {d.online && <Link className="font-semibold text-brand underline" href={`/${code}/order`}>Order online</Link>}
          {POLICY_KINDS.filter((k) => k !== kind).map((k) => <Link key={k} className="text-muted underline" href={`/${code}/info/${k}`}>{POLICY_PAGES[k].title}</Link>)}
        </nav>
      </main>
    </div>
  );
}
