// JWT helpers usable from middleware (edge) and server
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./permissions";

export const COOKIE = "ap_session";
export const ADMIN_COOKIE = "ap_admin";
export const TENANT_COOKIE = "ap_rest"; // remembers the restaurant code on this device
export type SessionPayload = { uid: number; tid: number; role: Role; name: string; v: number; imp?: boolean };
export type AdminPayload = { admin: string; aid: number };

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return new TextEncoder().encode(s);
}
export async function signSession(p: SessionPayload) {
  return new SignJWT({ ...p, typ: "user" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
}
export async function signAdmin(p: AdminPayload) {
  return new SignJWT({ ...p, typ: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
}
export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.typ === "user" ? (payload as unknown as SessionPayload) : null;
  } catch { return null; }
}
export async function verifyAdmin(token?: string): Promise<AdminPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.typ === "admin" ? (payload as unknown as AdminPayload) : null;
  } catch { return null; }
}

// Shareable bill link: a signed token so a customer can open ONE bill (no login) at /b/<token>
export async function signBill(tid: number, oid: number) {
  return new SignJWT({ tid, oid, typ: "bill" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("365d").sign(key());
}
export async function verifyBill(token?: string): Promise<{ tid: number; oid: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.typ === "bill" && typeof payload.tid === "number" && typeof payload.oid === "number" ? { tid: payload.tid, oid: payload.oid } : null;
  } catch { return null; }
}

// Shareable "pin your delivery location" link for ANY order (online or made by staff): /loc/<token>
export async function signLoc(tid: number, oid: number) {
  return new SignJWT({ tid, oid, typ: "loc" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
}
export async function verifyLoc(token?: string): Promise<{ tid: number; oid: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.typ === "loc" && typeof payload.tid === "number" && typeof payload.oid === "number" ? { tid: payload.tid, oid: payload.oid } : null;
  } catch { return null; }
}

// customer's verified mobile (after SMS OTP) for online orders - per restaurant
export const PHONE_COOKIE = "ao_phone";
export async function signPhone(tid: number, phone: string) {
  return new SignJWT({ tid, phone, typ: "phone" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("90d").sign(key());
}
export async function verifyPhone(token: string | undefined, tid: number): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.typ === "phone" && payload.tid === tid && typeof payload.phone === "string" ? payload.phone : null;
  } catch { return null; }
}
