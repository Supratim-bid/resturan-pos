import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadStorefront } from "@/lib/online";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { qrDataUrl } from "@/lib/bill";
import { InstallGuide } from "@/components/pwa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get the app" };

// Customers: how to put this restaurant's ordering app on the home screen: /<code>/order/app
export default async function GetApp({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!isRestaurantPath(code)) notFound();
  const store = await loadStorefront(code);
  if (!store) notFound();
  const c = store.config;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const here = `${origin}/${code}/order/app`;
  const qr = await qrDataUrl(here, 240);
  return (
    <div className="min-h-dvh bg-cream pb-12">
      <style dangerouslySetInnerHTML={{ __html: themeCss(c.primary, c.accent) }} />
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{c.name}</div>
        <div className="text-sm opacity-90">Get our app</div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <section className="card"><InstallGuide name={c.name} icon={`/pwa/${code}/icon-192.png`} /></section>
        <section className="card space-y-2 text-sm">
          <h2 className="font-bold">With the app you can</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Order in one tap from your home screen</li>
            <li>See your past orders and their status</li>
            <li>Pay by UPI and get your bill as a PDF</li>
          </ul>
        </section>
        <section className="card flex items-center gap-4 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for this page" className="h-28 w-28 rounded-lg border border-line" />
          <p>On a computer? Scan this with your phone camera to open this page on your phone.</p>
        </section>
        <Link href={`/${code}/order`} className="btn-primary block text-center">Order now</Link>
      </main>
    </div>
  );
}
