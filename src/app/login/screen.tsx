import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LoginForm } from "./form";

/** Shared by /login and the restaurant link /<code> */
export async function LoginScreen({ code }: { code: string }) {
  const t = code ? await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) }) : null;
  const s = t ? await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) }) : null;
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src={t ? `/logo?r=${t.code}` : "/platform-logo.svg"} alt={s?.name ?? app} className="mx-auto h-36 w-36 rounded-full bg-white object-cover shadow-[0_0_0_4px_#fff,0_0_0_6px_var(--color-gold)]" />
          <h1 className="mt-4 font-display text-2xl font-bold text-brand">{s?.name ?? app}</h1>
          {s?.name && <p className="text-sm text-muted">{app}</p>}
          <div className="gold-rule mx-auto mt-2 w-40" />
        </div>
        <LoginForm code={t?.code ?? code} known={!!t} />
        <p className="mt-6 text-center text-xs text-muted">Accounts are created by your restaurant owner. Forgot password? Ask the owner to reset it.</p>
      </div>
    </main>
  );
}
