import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
export const metadata: Metadata = {
  title: APP,
  description: "Orders, billing, recipes, stock and accounts for restaurants",
  appleWebApp: { capable: true, title: APP, statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9a1c1f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
