import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadStorefront } from "@/lib/online";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { todayIST } from "@/lib/format";
import { Storefront } from "@/components/storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = (await params).code.toLowerCase();
  const store = isRestaurantPath(code) ? await loadStorefront(code) : null;
  return store ? { title: `Order online · ${store.config.name}`, description: store.config.tagline || `Order from ${store.config.name}` } : {};
}

// Public menu for customers: https://<site>/<restaurant-code>/order
export default async function OrderPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!isRestaurantPath(code)) notFound();
  const store = await loadStorefront(code);
  if (!store) notFound();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss(store.config.primary, store.config.accent) }} />
      <Storefront code={store.tenant.code} config={store.config} dishes={store.dishes} today={todayIST()} />
    </>
  );
}
