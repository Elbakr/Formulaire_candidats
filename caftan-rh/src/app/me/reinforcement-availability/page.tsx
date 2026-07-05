import { AlertCircle, CalendarCheck, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { getMyAvailability, dayLabel, fmtTime } from "@/lib/scheduling/employee-availability";
import { AvailabilityForm } from "./availability-form";
import { RemoveButton } from "./remove-button";

export const dynamic = "force-dynamic";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun→Dim (affichage naturel FR)

export default async function ReinforcementAvailabilityPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  // Mapping profile → employé actif
  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const employee = empRaw as unknown as { id: string; full_name: string } | null;

  if (!employee?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Mes disponibilités renfort</h1>
        </div>
        <Card>
          <div className="p-10 text-center">
            <AlertCircle className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">
              Tu n&apos;es pas enregistré comme employé actif.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const slots = await getMyAvailability(employee.id);

  const recurring = slots
    .filter((s) => s.day_of_week != null)
    .sort((a, b) => DAY_ORDER.indexOf(a.day_of_week!) - DAY_ORDER.indexOf(b.day_of_week!));

  const specific = slots
    .filter((s) => s.specific_date != null)
    .sort((a, b) => (a.specific_date! < b.specific_date! ? -1 : 1));

  return (
    <div className="space-y-4 max-w-2xl pb-safe">
      <div>
        <h1 className="text-2xl font-bold">Mes disponibilités renfort</h1>
        <p className="text-sm text-ink-2">
          Déclare les créneaux où tu es disponible pour un renfort ou un remplacement.
          Ces informations aident l&apos;équipe à te contacter rapidement.
        </p>
      </div>

      {/* ── Formulaire d'ajout ── */}
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Ajouter un créneau de disponibilité</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Choisis un jour récurrent (ex : chaque mardi) ou une date précise.
          </p>
        </div>
        <AvailabilityForm />
      </Card>

      {/* ── Créneaux récurrents ── */}
      <Card>
        <div className="p-4 border-b border-line flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-gold-dark" />
          <h2 className="font-bold text-sm">Récurrents</h2>
          <span className="ml-auto text-xs text-ink-3 tabular-nums">
            {recurring.length} créneau{recurring.length !== 1 ? "x" : ""}
          </span>
        </div>
        {recurring.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun créneau récurrent déclaré.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recurring.map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="w-24 shrink-0 font-bold text-ink capitalize">
                  {dayLabel(s.day_of_week!, "fr")}
                </div>
                <div className="font-mono text-xs flex-1">
                  {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                </div>
                {s.note && (
                  <div className="text-xs text-ink-3 truncate max-w-[120px]" title={s.note}>
                    {s.note}
                  </div>
                )}
                <RemoveButton id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Dates ponctuelles ── */}
      <Card>
        <div className="p-4 border-b border-line flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-ink-2" />
          <h2 className="font-bold text-sm">Dates précises</h2>
          <span className="ml-auto text-xs text-ink-3 tabular-nums">
            {specific.length} créneau{specific.length !== 1 ? "x" : ""}
          </span>
        </div>
        {specific.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucune date ponctuelle déclarée.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {specific.map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="w-24 shrink-0 font-mono text-xs font-bold text-ink">
                  {new Date(s.specific_date! + "T12:00:00Z").toLocaleDateString("fr-BE", {
                    timeZone: "Europe/Brussels",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </div>
                <div className="font-mono text-xs flex-1">
                  {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                </div>
                {s.note && (
                  <div className="text-xs text-ink-3 truncate max-w-[120px]" title={s.note}>
                    {s.note}
                  </div>
                )}
                <RemoveButton id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
