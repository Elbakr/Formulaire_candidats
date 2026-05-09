import { fetchApplications } from "@/lib/queries";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CandidatesTable } from "../../rh/candidates/candidates-table";

export default async function ManagerCandidatesPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const [apps, { data: tmpls }] = await Promise.all([
    fetchApplications({ managerId: profile.id }),
    supabase.from("email_templates").select("slug, label, subject, body_html, needs_dates, needs_times").eq("is_active", true).order("label"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mes candidats</h1>
        <p className="text-sm text-ink-2">{apps.length} candidat·e·s assigné·e·s.</p>
      </div>
      <CandidatesTable initialData={apps} templates={(tmpls ?? []) as never} />
    </div>
  );
}
