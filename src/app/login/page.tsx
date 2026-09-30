import { cookies } from "next/headers";
import { TENANT_COOKIE } from "@/lib/session";
import { LoginScreen } from "./screen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const code = ((await searchParams).r || (await cookies()).get(TENANT_COOKIE)?.value || "").trim().toLowerCase();
  return <LoginScreen code={code} />;
}

