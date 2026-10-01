import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, COOKIE, verifyAdmin, verifySession } from "@/lib/session";
import { isPublicOrderPath, isRestaurantPath } from "@/lib/reserved";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const url = req.nextUrl.clone();
  url.search = "";
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (await verifyAdmin(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }
  if (path === "/install") return NextResponse.next(); // how to install the staff app (before login too)
  if (path.startsWith("/b/")) return NextResponse.next(); // shared bill link (its own signed token, no login)
  // restaurant login link: /<restaurant-code>
  const seg = path.split("/").filter(Boolean);
  if (seg.length === 1 && isRestaurantPath(seg[0].toLowerCase())) return NextResponse.next();
  // customers' online ordering pages (no login)
  if (isPublicOrderPath(seg.map((x) => x.toLowerCase()))) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = {
  matcher: ["/((?!login|admin/login|_next|img/|logo|platform-logo.svg|demo-alooposto-logo.jpg|icon|apple-icon|manifest.webmanifest|favicon.ico|api/health|api/pay/|sw.js|offline.html|pwa/).*)"],
};
