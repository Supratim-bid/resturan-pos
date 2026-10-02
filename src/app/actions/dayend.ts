"use server";
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth";
import { closeShop, openShop } from "@/lib/dayend";

type R = { ok: true; emailed?: boolean; dev?: boolean; reason?: string } | { ok: false; error: string };

/** Red "Day end" button: close the shop + online orders and email today's report. */
export async function dayEndCloseAction(): Promise<R> {
  try {
    const u = await requireAction("dayEnd");
    const res = await closeShop(u.tenantId);
    revalidatePath("/", "layout");
    return { ok: true, emailed: res.sent, dev: "dev" in res ? res.dev : undefined, reason: "reason" in res ? res.reason : undefined };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/** Green "Open" button: re-open the shop; optionally re-open online orders too. */
export async function openShopAction(openOnline: boolean): Promise<R> {
  try {
    const u = await requireAction("dayEnd");
    await openShop(u.tenantId, openOnline);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
