import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { isRestaurantPath } from "@/lib/reserved";
import { LoginScreen } from "../login/screen";

// Restaurant login link: https://your-app/<restaurant-code>, e.g. /my-restaurant
export default async function RestaurantLogin({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toLowerCase();
  if (!isRestaurantPath(code)) notFound();
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t) notFound();
  const u = await getUser().catch(() => null);
  if (u && u.tenantId === t.id) redirect("/");
  return <LoginScreen code={t.code} />;
}
