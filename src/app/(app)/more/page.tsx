import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { MODULES, can, ROLE_LABEL, type ModuleKey } from "@/lib/permissions";
import { db, schema } from "@/db";
import { DayEndButton } from "@/components/nav";
import { OutletSwitcher } from "@/components/outlet-switcher";
import { getUserGroupAccess } from "@/lib/groups";
import { logout } from "../../actions/auth";

export default async function More() {
  const user = await requireUser();
  const keys = (Object.keys(MODULES) as ModuleKey[]).filter((k) => can(user, k));
  const setting = can(user, "dayEnd") ? await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, user.tenantId) }) : null;
  const access = user.features.includes("multiOutlet") ? await getUserGroupAccess(user.id) : null;
  return (
    <div>
      <div className="card mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-light text-xl font-bold">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><div className="text-lg font-bold">{user.name}</div><div className="text-sm text-muted">{ROLE_LABEL[user.role]} · @{user.username} · {user.tenantCode}</div></div>
      </div>
      {access && access.outlets.length > 1 && <div className="mb-4"><OutletSwitcher outlets={access.outlets} activeId={user.tenantId} groupName={access.group.name} showAll={access.role === "OWNER" || access.group.combinedOrdering} /></div>}
      {can(user, "dayEnd") && <div className="mb-4"><DayEndButton closed={!!setting?.closedNow} /></div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((k) => (
          <Link key={k} href={MODULES[k].href} className="card !p-3 text-sm font-semibold hover:border-brand">{MODULES[k].label}</Link>
        ))}
      </div>
      <form action={logout} className="mt-6"><button className="btn-ghost w-full">Log out</button></form>
    </div>
  );
}
