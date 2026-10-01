import { cashfreeCheckout } from "@/lib/gateway";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (title: string, body: string, script = "") => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fbf7f0;color:#2a1b14;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}main{padding:24px;max-width:360px}h1{font-size:20px;margin:8px 0}p{color:#6b5b50;font-size:15px}a.b{display:inline-block;margin-top:12px;background:#9b1c1f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><main>${body}</main>${script}</body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Opens Cashfree's secure checkout for one order (bills / online orders / staff "Show QR to scan").
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^cfo_[\w-]{1,41}$/.test(id)) return page("Payment", "<h1>Payment link not found</h1>");
  const c = await cashfreeCheckout(id).catch((e) => { console.error("cashfree checkout", e); return undefined; });
  if (c === null) return page("Payment", "<h1>Payment link not found</h1>");
  if (!c) return page("Payment", "<h1>Couldn't open the payment page</h1><p>Please try again in a minute, or pay the restaurant directly.</p>");
  const back = c.returnUrl ? `<a class="b" href="${esc(c.returnUrl)}">Back to your order</a>` : "";
  if (c.status === "PAID") return page("Paid", `<h1>✓ Already paid</h1><p>₹${c.amount} to ${esc(c.name)} is received.</p>${back}`);
  if (c.status !== "ACTIVE" || !c.session) return page("Payment", `<h1>This payment link has expired</h1><p>Please ask ${esc(c.name)} for a new one.</p>${back}`);
  return page(`Pay ${c.name}`, `<h1>Pay ₹${c.amount} to ${esc(c.name)}</h1><p id="m">Opening the secure Cashfree payment page…</p><a class="b" id="go" href="#" style="display:none">Pay now</a>`,
    `<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script>
(function(){var s=${JSON.stringify(c.session)},m=${JSON.stringify(c.test ? "sandbox" : "production")};
function go(){try{Cashfree({mode:m}).checkout({paymentSessionId:s,redirectTarget:"_self"});}catch(e){document.getElementById("m").textContent="Tap the button to pay.";document.getElementById("go").style.display="inline-block";}}
document.getElementById("go").onclick=function(e){e.preventDefault();go();};
if(window.Cashfree){go();}else{document.getElementById("m").textContent="Couldn't load the payment page. Check your internet and tap below.";document.getElementById("go").style.display="inline-block";}})();
</script>`);
}
