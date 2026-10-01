import { fmtDate, fmtTime } from "@/lib/format";

type Item = { id: number; name: string; qty: string | number };
type Props = {
  restaurant: string; kotNo: number; billNo: string; date: string; at: Date | null; orderType: string; tableNo: string;
  customer?: string | null; address?: string; phone?: string; notes: string; items: Item[]; updated: boolean; cancelled: boolean;
  isPreorder?: boolean; mealSlot?: string; slotTime?: string; widthClass: string; pageBreak?: boolean;
};

/** Kitchen order ticket: dishes and quantities only (no prices) - for thermal rolls or half A4 */
export function KotSlip(p: Props) {
  const time = p.at ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(p.at) : "";
  return (
    <div className={`kot-slip mx-auto bg-white text-black shadow print:shadow-none ${p.widthClass} ${p.pageBreak ? "print:break-before-page mt-4 print:mt-0" : ""}`}>
      <div className="text-center text-[0.9em]">{p.restaurant}</div>
      <div className="my-1 border-y-2 border-black py-0.5 text-center text-[1.5em] font-extrabold tracking-wide">KOT #{p.kotNo}</div>
      {p.cancelled && <div className="my-1 border-2 border-black text-center font-extrabold">CANCELLED - DO NOT COOK</div>}
      {p.updated && !p.cancelled && <div className="my-1 border-2 border-black text-center font-extrabold">UPDATED ORDER</div>}
      <div className="flex justify-between gap-2"><span>{fmtDate(p.date)}</span><span>{time}</span></div>
      <div className="flex justify-between gap-2 font-bold"><span>{p.orderType}{p.tableNo ? ` · Table ${p.tableNo}` : ""}</span><span>{p.billNo}</span></div>
      {p.customer && <div>{p.customer}{p.phone ? ` · ${p.phone}` : ""}</div>}
      {p.address && <div className="my-0.5 border border-black px-1 py-0.5 font-bold">📍 {p.address}</div>}
      {p.isPreorder && <div className="font-bold">PRE-ORDER{p.mealSlot ? ` · ${p.mealSlot}` : ""}{p.slotTime ? ` · ${fmtTime(p.slotTime)}` : ""}</div>}
      <div className="mt-1 border-y border-dashed border-black py-1">
        {p.items.map((i) => (
          <div key={i.id} className="flex gap-2 py-0.5 text-[1.25em] font-bold leading-tight">
            <span className="w-[2.2em] shrink-0 text-right tabular-nums">{Number(i.qty)} ×</span><span>{i.name}</span>
          </div>
        ))}
      </div>
      {p.notes && <div className="mt-1 border border-black px-1 py-0.5 font-bold">Note: {p.notes}</div>}
      <div className="mt-1 text-center text-[0.85em]">Items: {p.items.reduce((a, i) => a + Number(i.qty), 0)}</div>
    </div>
  );
}

export const kotWidth = (size: string) =>
  size === "80" ? "w-[80mm] p-2 text-[12px]" : size === "half" ? "w-[105mm] min-h-[140mm] px-[7mm] py-[6mm] text-[13px] border-r border-dashed border-stone-400" : "w-[58mm] p-1.5 text-[11px]";
