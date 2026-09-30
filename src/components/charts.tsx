"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

// Validated categorical palette (light surface): sales, expenses, profit
export const SERIES = { sales: "#b3342c", expenses: "#2f6fa3", profit: "#5e8f2a" };
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const short = (n: number) => (Math.abs(n) >= 100000 ? (n / 100000).toFixed(1) + "L" : Math.abs(n) >= 1000 ? (n / 1000).toFixed(0) + "k" : String(Math.round(n)));
const axis = { fontSize: 11, fill: "#7a6655" };

function Tip({ active, payload, label, title }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; title?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{title ? title(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span><b className="ml-auto tabular-nums">{inr(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function DailySalesChart({ data, monthLabel }: { data: { label: string; sales: number }[]; monthLabel?: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#ecdcc6" strokeDasharray="0" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#ecdcc6" }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={short} width={44} />
          <Tooltip cursor={{ fill: "rgba(200,150,46,.12)" }} content={<Tip title={(l) => (monthLabel ? `${l} ${monthLabel}` : l)} />} />
          <Bar dataKey="sales" name="Sales" fill={SERIES.sales} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyTrendChart({ data }: { data: { label: string; sales: number; expenses: number; profit: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#ecdcc6" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#ecdcc6" }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={short} width={44} />
          <ReferenceLine y={0} stroke="#cbbfb3" />
          <Tooltip cursor={{ stroke: "#cbbfb3" }} content={<Tip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#341503" }} />
          <Line type="monotone" dataKey="sales" name="Sales" stroke={SERIES.sales} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="expenses" name="Expenses" stroke={SERIES.expenses} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="profit" name="Profit" stroke={SERIES.profit} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal magnitude bars (HTML) - for category breakdowns */
export function HBars({ rows, color = SERIES.expenses }: { rows: { label: string; value: number; note?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${inr(r.value)}`}>
          <div className="flex justify-between text-xs"><span className="text-ink">{r.label}</span><span className="tabular-nums text-ink"><b>{inr(r.value)}</b>{r.note && <span className="ml-1 text-muted">{r.note}</span>}</span></div>
          <div className="mt-1 h-2 rounded-full bg-cream"><div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  );
}
