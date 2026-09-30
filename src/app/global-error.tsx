"use client";

// Last-resort page when even the app layout fails. Plain styles so it always renders.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fbf7f1", color: "#2b1a14", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ color: "#9a1c1f", fontSize: 22 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#6f5a4f" }}>Your saved data is safe. Please try again{error.digest ? ` (code ${error.digest})` : ""}.</p>
          <button onClick={() => reset()} style={{ background: "#9a1c1f", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
