import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";
import { APP_NAME, currentCode } from "@/lib/pwa";

export async function generateMetadata(): Promise<Metadata> {
  const code = await currentCode().catch(() => "");
  return {
    title: APP_NAME,
    description: "Orders, billing, recipes, stock and accounts for restaurants",
    applicationName: APP_NAME,
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
    manifest: "/manifest.webmanifest",
    icons: { apple: `/pwa/${code || "_"}/apple-180.png` },
    formatDetection: { telephone: false },
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9a1c1f", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}<PwaRegister /></body>
    </html>
  );
}
