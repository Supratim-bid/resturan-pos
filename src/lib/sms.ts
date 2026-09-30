import "server-only";

// SMS for customer OTPs. Not connected yet: OTP stays switched off until a provider is added here.
// To connect one later (e.g. MSG91 / Message Central / 2Factor): add a branch in sendSms() that calls the
// provider's API, add it to READY below, and set SMS_PROVIDER (+ its API key) in the environment.
//   SMS_PROVIDER=console  -> development only: the code is printed in the server log instead of sent.
const READY = ["console"];

export function smsProvider() {
  return (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
}

/** True when OTP by SMS can actually be sent */
export function smsReady() {
  const p = smsProvider();
  if (!READY.includes(p)) return false;
  if (p === "console") return process.env.NODE_ENV !== "production";
  return true;
}

export async function sendSms(phone10: string, text: string) {
  const p = smsProvider();
  if (p === "console" && process.env.NODE_ENV !== "production") {
    console.log(`[SMS to ${phone10}] ${text}`);
    return;
  }
  throw new Error("SMS is not set up yet.");
}
