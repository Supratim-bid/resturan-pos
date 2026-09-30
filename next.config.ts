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
  outputFileTracingIncludes: { "/bill/[id]/png": ["./assets/fonts/**"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
