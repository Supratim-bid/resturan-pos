"use client";
import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) return resolve();
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = LEAFLET_CSS; document.head.appendChild(l);
    }
    let s = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.src = LEAFLET_JS; document.body.appendChild(s); }
    s.addEventListener("load", () => resolve()); if ((s as HTMLScriptElement & { _loaded?: boolean })) s.addEventListener("error", () => resolve());
  });
}

/** Lets anyone with the link pin the exact delivery spot on a map (tap or drag), with a one-tap "use my GPS" button. */
export function PinLocation({ token, start }: { token: string; start?: { lat: number; lng: number } | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null); const marker = useRef<any>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(start ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let dead = false;
    loadLeaflet().then(() => {
      if (dead || !boxRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L; if (!L) return;
      const c = start ?? { lat: 28.4595, lng: 77.0266 }; // default: Gurugram
      map.current = L.map(boxRef.current, { zoomControl: true }).setView([c.lat, c.lng], start ? 16 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
      const place = (lat: number, lng: number) => {
        if (!marker.current) {
          marker.current = L.marker([lat, lng], { draggable: true }).addTo(map.current);
          marker.current.on("dragend", () => { const p = marker.current.getLatLng(); setPos({ lat: p.lat, lng: p.lng }); });
        } else marker.current.setLatLng([lat, lng]);
        setPos({ lat, lng });
      };
      if (start) place(start.lat, start.lng);
      map.current.on("click", (e: { latlng: { lat: number; lng: number } }) => place(e.latlng.lat, e.latlng.lng));
      if (!start) navigator.geolocation?.getCurrentPosition((p) => { if (!dead) { map.current.setView([p.coords.latitude, p.coords.longitude], 16); place(p.coords.latitude, p.coords.longitude); } }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    });
    return () => { dead = true; if (map.current) { map.current.remove(); map.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useGps() {
    if (!navigator.geolocation) { setNote("Location isn't available on this phone."); return; }
    setNote("Getting your location…");
    navigator.geolocation.getCurrentPosition((p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (map.current && L) { map.current.setView([lat, lng], 16); if (!marker.current) { marker.current = L.marker([lat, lng], { draggable: true }).addTo(map.current); marker.current.on("dragend", () => { const q = marker.current.getLatLng(); setPos({ lat: q.lat, lng: q.lng }); }); } else marker.current.setLatLng([lat, lng]); }
      setPos({ lat, lng }); setNote("Got it — drag the pin to fine-tune, then confirm.");
    }, () => setNote("Couldn't get your location. Allow location access, or tap the map to drop a pin."), { enableHighAccuracy: true, timeout: 15000 });
  }

  async function confirm() {
    if (!pos) { setNote("Tap the map or use your GPS to drop the pin first."); return; }
    setBusy(true); setNote("Saving…");
    try {
      const r = await fetch(`/loc/${token}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pos) });
      if (r.ok) { setSaved(true); setNote(""); } else setNote("Couldn't save. Please try again.");
    } catch { setNote("Couldn't save. Please try again."); }
    finally { setBusy(false); }
  }

  if (saved) return (
    <div className="rounded-2xl bg-emerald-50 p-5 text-center">
      <div className="text-4xl">✅</div>
      <p className="mt-2 font-semibold text-emerald-800">Location shared — thank you!</p>
      <p className="text-sm text-emerald-700">The restaurant now has your exact delivery spot. You can close this page.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <button type="button" className="btn-gold w-full" onClick={useGps}>📍 Use my current location</button>
      <div ref={boxRef} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />
      <p className="text-center text-xs text-muted">Tap the map or drag the pin to the exact gate / building.</p>
      {note && <p className="text-center text-sm text-muted">{note}</p>}
      <button type="button" className="btn-primary w-full" disabled={busy || !pos} onClick={confirm}>{busy ? "Saving…" : "Confirm this location"}</button>
    </div>
  );
}
