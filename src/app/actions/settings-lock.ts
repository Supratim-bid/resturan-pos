"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";

const UNLOCK_MINUTES = 30;

/** Owner enters the 8-digit OTP the super admin gave them. On success, Settings opens for a short while.
 *  The OTP is one-time: it is cleared immediately so it can't be reused, and a new one is needed next time. */
export async function unlockSettingsAction(otp: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const u = await requireAction("settings");
    const code = String(otp ?? "").replace(/\D/g, "");
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, u.tenantId), columns: { settingsOtp: true } });
    if (!t?.settingsOtp) return { ok: false, error: "No access code is active. Ask the platform admin to generate one for you." };
    if (code.length !== 8 || code !== t.settingsOtp) return { ok: false, error: "That code is not correct. Ask the platform admin for the current 8-digit code." };
    // Rotate to a fresh code immediately, so the one just used can never be reused.
    const next = String(Math.floor(10000000 + Math.random() * 90000000));
    await db.update(schema.tenants).set({ settingsOtp: next, settingsUnlockedUntil: new Date(Date.now() + UNLOCK_MINUTES * 60_000) }).where(eq(schema.tenants.id, u.tenantId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
