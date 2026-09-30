import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { SuperAdmins } from "@/components/admin";

export default async function Admins() {
  const me = await requireAdmin();
  const list = await db.query.superAdmins.findMany({ orderBy: [asc(schema.superAdmins.email)] });
  return (
    <div>
      <PageHeader title="Super admins" subtitle="They log in with their email and a one-time code. They can create restaurants and owners." />
      <Card><SuperAdmins meId={me.id} list={list.map((a) => ({ id: a.id, email: a.email, name: a.name, active: a.active }))} /></Card>
    </div>
  );
}
