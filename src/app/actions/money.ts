"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { round2, todayIST } from "@/lib/format";
import { ENTRY_TYPES, type EntryType } from "@/lib/money";

type R = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: String((e as Error)?.message ?? e).replace(/^Error:\s*/, "") });

export async function addMoneyEntryAction(v: { type: string; account: string; amount: string | number; date: string; category?: string; notes?: string }): Promise<R> {
  try {
    const u = await requireAction("money");
    const type = v.type as EntryType;
    if (!(type in ENTRY_TYPES)) throw new Error("Pick what this entry is.");
    const amount = round2(Number(v.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount more than 0.");
    if (amount > 1e9) throw new Error("Amount is too large.");
    const date = String(v.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) throw new Error("Pick a date up to today.");
    const account = v.account === "BANK" ? "BANK" : "CASH";
    const base = { tenantId: u.tenantId, date, amount, category: String(v.category ?? "").trim().slice(0, 60), notes: String(v.notes ?? "").trim().slice(0, 200), createdById: u.id };
    if (type === "DEPOSIT") await db.insert(schema.moneyEntries).values({ ...base, kind: "TRANSFER", account: "CASH", toAccount: "BANK" });
    else if (type === "WITHDRAW") await db.insert(schema.moneyEntries).values({ ...base, kind: "TRANSFER", account: "BANK", toAccount: "CASH" });
    else await db.insert(schema.moneyEntries).values({ ...base, kind: type, account });
    revalidatePath("/money"); revalidatePath("/cash"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteMoneyEntryAction(id: number): Promise<R> {
  try {
    const u = await requireAction("money");
    const [r] = await db.delete(schema.moneyEntries).where(and(eq(schema.moneyEntries.id, id), eq(schema.moneyEntries.tenantId, u.tenantId))).returning({ id: schema.moneyEntries.id });
    if (!r) throw new Error("Entry not found.");
    revalidatePath("/money"); revalidatePath("/cash"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}
