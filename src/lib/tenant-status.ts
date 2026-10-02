import { todayIST } from "./format";

/** A restaurant is usable only if it is active AND its paid/trial period hasn't ended. */
export function isLive(t: { active: boolean; validTill?: string | null }): boolean {
  if (!t.active) return false;
  if (t.validTill && t.validTill < todayIST()) return false;
  return true;
}

/** Why a restaurant can't be used right now (for login / order messages). */
export function notLiveReason(t: { active: boolean; validTill?: string | null }): string {
  if (!t.active) return "This restaurant's account is paused. Please contact support.";
  if (t.validTill && t.validTill < todayIST()) return "This restaurant's subscription has ended. Please contact support to renew.";
  return "";
}
