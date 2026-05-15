import { Settings2 } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { BulkEditTable, type EmpRow, type SiteOption } from "./bulk-edit-table";

export default async function EmployeesBulkEditPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: empsRaw }, { data: sitesRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        `id, full_name, status, contract_type, weekly_hours, default_pause_minutes,
         ot_eligible, ot_max_multiplier, fixed_off_days, preferred_site_ids, unavailable_site_ids, job_title`,
      )
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const employees = (empsRaw ?? []) as EmpRow[];
  const sites = (sitesRaw ?? []) as SiteOption[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Données solver — édition rapide
        </h1>
        <p className="text-sm text-ink-2">
          Modifie en un coup d œil les données dont le solver a besoin pour
          planifier efficacement. Une sauvegarde par ligne, la touche Échap
          annule les changements en cours. Les champs sensibles (paie, IBAN,
          NRN) restent sur la{" "}
          <Link
            href="/planning/employees"
            className="text-gold-dark font-bold hover:underline"
          >
            fiche employé
          </Link>
          .
        </p>
      </div>

      <Card>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Aucun employé actif.
          </div>
        ) : (
          <BulkEditTable employees={employees} sites={sites} />
        )}
      </Card>
    </div>
  );
}
