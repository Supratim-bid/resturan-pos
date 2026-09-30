export const TZ = "Asia/Kolkata";

/** Today's date in India as YYYY-MM-DD */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function monthStart(d: string) { return d.slice(0, 8) + "01"; }
export function monthEnd(d: string) {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
export function fmtDate(d?: string | null) {
  if (!d) return "";
  const x = new Date(d.slice(0, 10) + "T00:00:00Z");
  return x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
export function fmtDateTime(d?: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function inr(n?: number | null, decimals = 0) {
  const v = Number(n ?? 0);
  const s = "₹" + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return v < 0 && Math.abs(v) >= 0.5 / 10 ** decimals ? "−" + s : s;
}
export function inr2(n?: number | null) { return inr(n, 2); }
export function num(n?: number | null, d = 2) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-IN", { maximumFractionDigits: d });
}
export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function pctStr(n?: number | null) { return n == null || !isFinite(n) ? "" : (n * 100).toFixed(1) + "%"; }

/** "13:30" -> "1:30 PM" */
export function fmtTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  if (!m) return t || "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
