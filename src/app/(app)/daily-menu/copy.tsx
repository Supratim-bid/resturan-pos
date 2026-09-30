"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyDailyMenuAction } from "@/app/actions/stock";
export function CopyMenuButton({ from, to }: { from: string; to: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { const n = await copyDailyMenuAction(from, to); if (!n) alert("Previous day had no menu to copy."); router.refresh(); })}>Copy previous day's menu</button>;
}
