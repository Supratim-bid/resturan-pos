"use client";
import { useEffect, useRef, useState } from "react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = LEAFLET_CSS; document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script"); s.src = LEAFLET_JS; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("map failed to load"));
    document.head.appendChild(s);
  });
}

/** Live delivery map: shows the rider (polled) and the customer's own location. Free OpenStreetMap tiles, no API key. */
export function TrackMap({ code, token }: { code: string; token: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null); const riderM = useRef<any>(null); const meM = useRef<any>(null);
  const [rider, setRider] = useState<{ lat: number; lng: number; at: string } | null>(null);
  const [err, setErr] = useState("");

  // init map once
  useEffect(() => {
    let dead = false;
    loadLeaflet().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (dead || !boxRef.current || map.current) return;
      map.current = L.map(boxRef.current, { zoomControl: true }).setView([28.4595, 77.0266], 12); // default: Gurugram
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
      // the customer's own location, if they allow it
      navigator.geolocation?.getCurrentPosition((pos) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const LL = (window as any).L;
        if (!map.current) return;
        meM.current = LL.circleMarker([pos.coords.latitude, pos.coords.longitude], { radius: 8, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.9 }).addTo(map.current).bindPopup("You");
        if (!riderM.current) map.current.setView([pos.coords.latitude, pos.coords.longitude], 14);
      }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 });
    }).catch(() => setErr("Map couldn't load. Check your internet."));
    return () => { dead = true; };
  }, []);

  // poll rider location
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const fetchLoc = async () => {
      try {
        const r = await fetch(`/${code}/order/${token}/loc`, { cache: "no-store" });
        const d = await r.json();
        if (d && typeof d.lat === "number" && typeof d.lng === "number") setRider({ lat: d.lat, lng: d.lng, at: d.at });
        else setRider(null);
      } catch { /* ignore */ }
    };
    fetchLoc(); timer = setInterval(fetchLoc, 15000);
    return () => clearInterval(timer);
  }, [code, token]);

  // move rider marker
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L || !map.current || !rider) return;
    if (!riderM.current) {
      const icon = L.divIcon({ html: "🛵", className: "text-2xl", iconSize: [28, 28], iconAnchor: [14, 14] });
      riderM.current = L.marker([rider.lat, rider.lng], { icon }).addTo(map.current).bindPopup("Your delivery");
      map.current.setView([rider.lat, rider.lng], 15);
    } else {
      riderM.current.setLatLng([rider.lat, rider.lng]);
    }
    // keep both in view if we have the customer location too
    if (meM.current) {
      const b = L.latLngBounds([riderM.current.getLatLng(), meM.current.getLatLng()]).pad(0.3);
      map.current.fitBounds(b);
    }
  }, [rider]);

  return (
    <section className="card space-y-2">
      <h2 className="font-bold">🛵 Live delivery tracking</h2>
      <div ref={boxRef} className="h-64 w-full overflow-hidden rounded-xl bg-cream ring-1 ring-line" />
      {err ? <p className="text-xs text-red-700">{err}</p>
        : rider ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>Rider updated {rider.at ? new Date(rider.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "just now"}</span>
            <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${rider.lat},${rider.lng}`}>Open rider in Google Maps</a>
          </div>
        ) : <p className="text-xs text-muted">Waiting for the rider to start sharing their location…</p>}
    </section>
  );
}

/** Customer shares their exact delivery location so the rider gets a live ETA. */
export function SetMyLocation({ code, token, has }: { code: string; token: string; has: boolean }) {
  const [note, setNote] = useState(has ? "✓ Your delivery location is shared." : "");
  const [busy, setBusy] = useState(false);
  function share() {
    if (!navigator.geolocation) { setNote("Location isn't available on this phone."); return; }
    setBusy(true); setNote("Getting your location…");
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const r = await fetch(`/${code}/order/${token}/setloc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }) });
        setNote(r.ok ? "✓ Location shared - you'll see a live ETA once the rider is on the way." : "Couldn't save your location. Please try again.");
      } catch { setNote("Couldn't save your location. Please try again."); }
      finally { setBusy(false); }
    }, () => { setNote("Couldn't get your location. Allow location access and try again."); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  return (
    <div className="text-center">
      <button type="button" className={has ? "btn-ghost btn-sm" : "btn-gold"} disabled={busy} onClick={share}>📍 {has ? "Update my location" : "Share my location for a live ETA"}</button>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
