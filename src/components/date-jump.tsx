"use client";
import { useRouter, usePathname } from "next/navigation";
export function DateJump({ value, param = "date", type = "date" }: { value: string; param?: string; type?: "date" | "month" }) {
  const router = useRouter();
  const path = usePathname();
  return <input type={type} className="input !w-auto !py-2" value={value} onChange={(e) => e.target.value && router.push(`${path}?${param}=${e.target.value}`)} />;
}
