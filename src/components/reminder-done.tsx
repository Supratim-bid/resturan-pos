"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reminderDoneAction } from "@/app/actions/ops";
export function ReminderDone({ id, repeat }: { id: number; repeat: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await reminderDoneAction(id); router.refresh(); })}>{repeat === "NONE" ? "✓ Done" : "✓ Done · next"}</button>;
}
