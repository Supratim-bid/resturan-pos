"use client";
import { useOptimistic, useTransition } from "react";
import { setAttendanceAction } from "@/app/actions/ops";
const OPTS = [["P", "Present", "bg-emerald-600"], ["H", "Half", "bg-amber-500"], ["A", "Absent", "bg-red-600"], ["L", "Leave", "bg-stone-500"]] as const;
export function AttendanceRow({ staffId, date, status }: { staffId: number; date: string; status: string }) {
  const [s, setS] = useOptimistic(status);
  const [, start] = useTransition();
  return (
    <div className="flex gap-1">
      {OPTS.map(([k, label, color]) => (
        <button key={k} type="button" title={label}
          onClick={() => start(async () => { const v = s === k ? "" : k; setS(v); await setAttendanceAction(staffId, date, v); })}
          className={`h-9 w-9 rounded-lg text-sm font-bold ${s === k ? `${color} text-white` : "border border-line bg-white text-muted"}`}>{k}</button>
      ))}
    </div>
  );
}
