import { OtpLogin } from "@/components/admin";
export const dynamic = "force-dynamic";
export default function AdminLogin() {
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/platform-logo.svg" alt="" className="mx-auto h-24 w-24" />
          <h1 className="mt-3 font-display text-2xl font-bold text-brand">{app}</h1>
          <p className="text-sm text-muted">Super admin</p>
        </div>
        <OtpLogin passwordOn={!!process.env.SUPERADMIN_PASSWORD} />
        <p className="mt-6 text-center text-xs text-muted">Restaurant staff? <a href="/login" className="font-semibold text-brand">Log in here</a></p>
      </div>
    </main>
  );
}
