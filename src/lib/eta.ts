import "server-only";

/** Straight-line distance between two lat/lng points, in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const ROAD_FACTOR = 1.4;   // roads are longer than a straight line
const SPEED_KMH = 18;      // average city/traffic speed (Gurugram-ish)
const BUFFER_MIN = 8;      // hand-off time at the door, parking, etc.

/** Estimated minutes for the rider to reach the customer, including a buffer. Returns null if coords are missing. */
export function estimateEtaMin(riderLat?: number | null, riderLng?: number | null, destLat?: number | null, destLng?: number | null): number | null {
  if (![riderLat, riderLng, destLat, destLng].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const km = haversineKm(riderLat!, riderLng!, destLat!, destLng!) * ROAD_FACTOR;
  const travel = (km / SPEED_KMH) * 60;
  return Math.max(2, Math.round(travel) + BUFFER_MIN);
}

/** A friendly range like "15–20 min" from a single estimate. */
export function etaRange(min: number): string {
  const lo = Math.max(2, Math.round((min - 5) / 5) * 5);
  const hi = Math.round((min + 5) / 5) * 5;
  return lo === hi ? `${hi} min` : `${lo}–${hi} min`;
}
