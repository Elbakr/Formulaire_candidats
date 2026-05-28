// Page de confirmation/decalage des dates Aid (Saghir + Kabir). Karim 20/05 :
// la date precise n est confirmee que quelques jours avant. L admin peut
// confirmer ou decaler de +/-1 jour. Une notif Push + mail est envoyee J-7
// pour rappeler la tache.

import Link from "next/link";
import { ArrowLeft, CalendarCheck, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AidConfirmRow } from "./aid-confirm-row";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Aid = {
  kind: "fitr" | "adha";
  hijriYear: number;
  jMinus1: { id: string; date: string; label: string; notes: string | null } | null;
  jDay: { id: string; date: string; label: string; notes: string | null; staff_multiplier: number | null } | null;
  jPlus1: { id: string; date: string; label: string; notes: string | null } | null;
};

export default async function AidDatesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, date, label, kind, shops_closed, staff_multiplier, notes")
    .or("label.ilike.%Aïd al-Fitr%,label.ilike.%Aïd al-Adha%")
    .gte("date", todayISO)
    .order("date");

  // Group par (kind, hijriYear)
  const groups = new Map<string, Aid>();
  type HRow = {
    id: string;
    date: string;
    label: string;
    shops_closed: boolean | null;
    staff_multiplier: number | null;
    notes: string | null;
  };
  for (const h of ((holidays ?? []) as HRow[])) {
    const m = h.label.match(/(Aïd al-Fitr|Aïd al-Adha)\s+(\d{4})/);
    if (!m) continue;
    const kind: "fitr" | "adha" = m[1].includes("Fitr") ? "fitr" : "adha";
    const hijriYear = parseInt(m[2]);
    const key = `${kind}-${hijriYear}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind, hijriYear, jMinus1: null, jDay: null, jPlus1: null };
      groups.set(key, g);
    }
    const entry = { id: h.id, date: h.date, label: h.label, notes: h.notes };
    if (h.label.includes("j-1")) g.jMinus1 = entry;
    else if (h.label.includes("j+1")) g.jPlus1 = entry;
    else g.jDay = { ...entry, staff_multiplier: h.staff_multiplier };
  }

  const aidList = [...groups.values()]
    .filter((g) => g.jDay)
    .sort((a, b) => (a.jDay!.date < b.jDay!.date ? -1 : 1));

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/settings"
          className="text-xs text-ink-3 hover:text-gold-dark inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Paramètres
        </Link>
        <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-gold-dark" />
          Dates des Aïd
        </h1>
        <p className="text-sm text-ink-2 mt-0.5">
          La date exacte des Aïd n'est officiellement annoncée que quelques jours
          à l'avance. Confirme la date prévue ou décale-la d'un jour selon
          l'annonce.
        </p>
      </div>

      <Card className="border-l-4 border-l-info bg-info-light/30">
        <div className="p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-info shrink-0 mt-0.5" />
          <div>
            <strong>Rappel</strong> : décaler la date du J décale aussi
            automatiquement J-1 (rush ×2) et J+1 (post-Aïd). Tu reçois un mail à
            J-7 et un push à J-3 pour ne pas oublier de vérifier l'annonce
            officielle.
          </div>
        </div>
      </Card>

      {aidList.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3 italic">
            Aucun Aïd à venir dans la base. Vérifie /admin/holidays.
          </div>
        </Card>
      ) : (
        aidList.map((aid) => (
          <AidConfirmRow
            key={`${aid.kind}-${aid.hijriYear}`}
            kind={aid.kind}
            hijriYear={aid.hijriYear}
            jMinus1Date={aid.jMinus1?.date ?? null}
            jDate={aid.jDay!.date}
            jPlus1Date={aid.jPlus1?.date ?? null}
            jLabel={aid.jDay!.label}
            jNotes={aid.jDay!.notes}
            staffMultiplier={aid.jDay!.staff_multiplier}
            todayISO={todayISO}
          />
        ))
      )}
    </div>
  );
}
