import type { NextConfig } from "next";

// Security headers on every page and API route
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },                                   // no one can show the app inside their site (clickjacking)
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }, // HTTPS only (browsers ignore it on http://localhost)
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // bundle the receipt fonts with the thermal-bill image route on Vercel
  // files loaded indirectly, so Vercel must be told to upload them: our receipt fonts, and the PDF library's built-in fonts
  outputFileTracingIncludes: {
    "/bill/[id]/png": ["./assets/fonts/**"],
    "/bill/[id]/pdf": ["./assets/fonts/**", "./node_modules/pdfkit/js/**"],
    "/[code]/order/[token]/bill": ["./assets/fonts/**", "./node_modules/pdfkit/js/**"],
  },
  serverExternalPackages: ["@react-pdf/renderer"],
  // app details (manifest, icons) always in <head>, so phones can install the app (no streamed metadata)
  htmlLimitedBots: /.*/,
  async headers() {
    // the Cashfree checkout page hands over to Cashfree's own payment page, so it may not keep "form-action 'self'"
    const checkout = securityHeaders.map((h) => h.key === "Content-Security-Policy" ? { ...h, value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" } : h);
    return [
      { source: "/((?!api/pay/checkout/).*)", headers: securityHeaders },
      { source: "/api/pay/checkout/:id", headers: checkout },
    ];
  },
};
export default nextConfig;
