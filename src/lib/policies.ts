import "server-only";
import { restaurantPhones } from "./format";
import type { schema } from "@/db";

type S = typeof schema.settings.$inferSelect;

// Public pages payment gateways (Instamojo, Razorpay, Cashfree…) ask for when a restaurant takes money online.
export const POLICY_PAGES = {
  contact: { title: "Contact us", field: "policyContactNote" },
  terms: { title: "Terms & conditions", field: "policyTerms" },
  refund: { title: "Refund & cancellation policy", field: "policyRefund" },
  delivery: { title: "Delivery policy", field: "policyDelivery" },
  privacy: { title: "Privacy policy", field: "policyPrivacy" },
} as const;
export type PolicyKind = keyof typeof POLICY_PAGES;
export const POLICY_KINDS = Object.keys(POLICY_PAGES) as PolicyKind[];

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

/** Ready-made text (simple format: "## Heading", "- point", blank line between paragraphs). The owner can replace any of it. */
export function defaultPolicy(kind: PolicyKind, s: S, code: string, origin: string) {
  const n = s.name || "the restaurant";
  const phones = restaurantPhones(s).join(" / ");
  const contactLine = [phones && `phone ${phones}`, s.whatsapp && `WhatsApp ${s.whatsapp}`, s.email && `email ${s.email}`].filter(Boolean).join(", ");
  const ways = [s.onlinePayUpi && "UPI (paid before we prepare the food)", s.onlinePayCash && "cash on delivery or at pickup"].filter(Boolean).join(" or ");
  switch (kind) {
    case "contact":
      return "";
    case "terms":
      return `These terms apply to orders placed with ${n} through ${origin}/${code}/order.

## Orders
- An order is confirmed only after the restaurant accepts it. You will see the status on your order page.
- We may decline an order, for example if a dish is sold out or the address is outside our delivery area. If you already paid, see the Refund & cancellation policy.
- Prices are shown on the menu in Indian Rupees and include applicable taxes${Number(s.gstRate) > 0 ? ` (GST ${Number(s.gstRate)}%)` : ""}. Delivery charges, if any, are shown before you place the order.${Number(s.onlineMinOrder) > 0 ? `\n- The minimum order value is ${inr(Number(s.onlineMinOrder))}.` : ""}

## Payment
- You can pay by ${ways || "the methods shown at checkout"}.
- Online payments are processed by our payment partner; we never see or store your card or bank details.

## Food
- Our food is freshly cooked. Please tell us about allergies in the order note; we cannot guarantee a kitchen free of any ingredient.
- Please eat delivered food within a reasonable time, as reheating or storing it is at your own discretion.

## Contact
Questions about an order: ${contactLine || "use the contact details on our Contact page"}.

These terms are governed by the laws of India.`;
    case "refund":
      return `## Cancelling an order
- Before the restaurant accepts your order, call or message us and we will cancel it. If you paid online, you get a full refund.
- After the order is accepted and the food is being prepared, it cannot be cancelled, because the food is made fresh for you.

## Orders we cannot accept
If we decline your order after you paid online, we refund the full amount.

## Problems with your food
If a dish is missing, wrong or not in good condition, contact us within 2 hours of delivery or pickup with a photo. We will replace the dish or refund its price.

## How refunds are paid
- Refunds go back to the same payment method (UPI, card or bank account) you paid with.
- They are started within 2 working days of approval and usually reach you in 5–7 working days, depending on your bank.
- Cash payments are refunded in cash or by UPI.

Contact for refunds: ${contactLine || "see our Contact page"}.`;
    case "delivery":
      return `We deliver freshly cooked food from ${n}${s.address ? `, ${s.address}` : ""}.${s.onlineTakeaway ? " You can also pick up your order from the restaurant." : ""}

## Delivery area and time
- We deliver to nearby areas only. If your address is too far, we will tell you before accepting the order.
- Orders for "as soon as possible" are usually delivered within 45–60 minutes of being accepted; busy times can take longer.${s.onlinePreorder ? "\n- Pre-orders are delivered for the date and meal (breakfast, lunch or dinner) you choose." : ""}

## Charges
${Number(s.defaultDeliveryCharge) > 0 ? `- Delivery charge: ${inr(Number(s.defaultDeliveryCharge))} per order, shown before you place the order.` : "- Any delivery charge is shown before you place the order."}

## Who delivers
Orders are delivered by our own staff or a delivery partner. Please keep your phone reachable; if we cannot reach you or the address is wrong, we may not be able to redeliver.

## Delays
If your order is late or has not arrived, call us: ${contactLine || "see our Contact page"}.`;
    case "privacy":
      return `${n} collects only what is needed to prepare and deliver your order.

## What we collect
- Your name, mobile number and delivery address, and the dishes you order.
- If you pay online, the payment is handled by our payment partner; we receive only the payment status and reference number.

## How we use it
- To prepare, deliver and bill your order, and to contact you about it.
- To show your past orders on this device (the "My orders" page).
We do not sell your details or use them for advertising by others.

## Keeping it safe
Your details are stored securely with access limited to our staff. We keep order records as required for tax and accounting.

## Your choices
You can ask us to correct or delete your details (except records we must keep by law): ${contactLine || "see our Contact page"}.`;
  }
}

/** The text shown on the page: the owner's own text, or the ready-made one */
export function policyText(kind: PolicyKind, s: S, code: string, origin: string) {
  const own = String((s as Record<string, unknown>)[POLICY_PAGES[kind].field] ?? "").trim();
  return own || defaultPolicy(kind, s, code, origin);
}
