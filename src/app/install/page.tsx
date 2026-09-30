import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, brandOf, currentCode } from "@/lib/pwa";
import { InstallGuide } from "@/components/pwa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Install ${APP_NAME}` };

// Staff: install the restaurant app on a phone, tablet or counter computer
export default async function InstallStaff() {
  const code = await currentCode();
  const b = await brandOf(code);
  const name = b?.s.name ?? APP_NAME;
  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-4 py-6">
      <h1 className="font-display text-2xl font-bold text-brand">Install the app</h1>
      <p className="text-sm text-muted">Put {name} on the home screen of the counter phone, the kitchen tablet or the billing computer. It opens full screen like any app, and you can get a notification for every new online order.</p>
      <section className="card"><InstallGuide name={name} icon={`/pwa/${b ? code : "_"}/icon-192.png`} /></section>
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">After installing</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open the app from the home screen and log in.</li>
          <li>On <b>Online Orders</b>, tap <b>🔔 Notify this phone</b> so new orders ring even when the app is closed.</li>
          <li>Kitchen tablet: open <b>Kitchen (KOT)</b> and keep it on screen.</li>
        </ol>
      </section>
      <Link href={b ? `/${code}` : "/login"} className="btn-ghost block text-center">← Back to login</Link>
    </main>
  );
}
