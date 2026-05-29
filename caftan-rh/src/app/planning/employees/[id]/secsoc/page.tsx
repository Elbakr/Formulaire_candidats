import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  loadSecsocEmployee,
  listMissingFields,
  getSecsocOrgs,
} from "./actions";
import { SecsocSendButton } from "./send-button";

/**
 * Karim 29/05 : page de generation et envoi de la fiche travailleur au
 * secretariat social. Pas d'API : envoi mail structure via EmailJS.
 *
 * Layout :
 *   - Recap des champs RH (read-only)
 *   - Si champs manquants : liste + lien vers fiche employe pour completer
 *   - Si OK : 2 boutons (AMD Megastore / Caftan Factory) avec preview avant envoi
 */
export default async function SecsocPage(
  props: PageProps<"/planning/employees/[id]/secsoc">,
) {
  const { id } = await props.params;
  await requireRole(["admin", "rh"]);

  const emp = await loadSecsocEmployee(id);
  if (!emp) notFound();

  const missing = listMissingFields(emp);
  const ready = missing.length === 0;
  const orgs = getSecsocOrgs();

  const fmtVal = (v: string | number | null) =>
    v === null || v === undefined || (typeof v === "string" && v.trim() === "")
      ? "—"
      : String(v);

  const ROWS: Array<{ label: string; val: string | number | null }> = [
    { label: "Nom complet", val: emp.full_name },
    { label: "Date de naissance", val: emp.birth_date },
    { label: "Lieu de naissance", val: emp.birth_place },
    { label: "NRN", val: emp.nrn },
    { label: "IBAN", val: emp.iban },
    { label: "Type contrat", val: emp.contract_type },
    { label: "Regime", val: emp.work_time_kind },
    { label: "Heures/semaine", val: emp.weekly_hours },
    { label: "Date debut", val: emp.start_date },
    { label: "Date fin", val: emp.end_date },
    { label: "Lieu signature", val: emp.signature_place },
    { label: "Transport — type", val: emp.transport_type },
    { label: "Transport — frequence", val: emp.transport_frequency },
    { label: "Transport — prix", val: emp.transport_price },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/planning/employees/${id}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour fiche
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-5 w-5 text-gold-dark" />
            <h1 className="text-xl font-bold">
              Fiche secretariat social — {emp.full_name ?? "?"}
            </h1>
          </div>
          <p className="text-sm text-ink-2 mt-1">
            Genere et envoie un mail structure au secretariat social
            (preview avant envoi). 2 entites possibles : <strong>AMD Megastore SRL</strong> (Schaerbeek)
            ou <strong>Caftan Factory</strong> (Bruxelles). CP 201 dans les deux cas.
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {ROWS.map((r) => {
              const isMissing =
                r.val === null ||
                r.val === undefined ||
                (typeof r.val === "string" && r.val.trim() === "");
              return (
                <div
                  key={r.label}
                  className="border-b border-line pb-1 flex items-baseline justify-between gap-2"
                >
                  <span className="text-[11px] uppercase tracking-wider text-ink-3">
                    {r.label}
                  </span>
                  <span
                    className={
                      isMissing
                        ? "text-warn text-xs italic"
                        : "font-medium text-sm"
                    }
                  >
                    {isMissing ? "[manquant]" : fmtVal(r.val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {ready ? (
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <h2 className="font-bold text-sm">Tous les champs requis sont remplis</h2>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-ink-2">
              Choisis l&apos;entite emettrice. La preview du mail s&apos;ouvrira avant envoi.
            </p>
            <div className="flex gap-2 flex-wrap">
              {orgs.map((o) => (
                <SecsocSendButton
                  key={o.key}
                  employeeId={id}
                  orgKey={o.key}
                  orgLabel={o.name}
                />
              ))}
            </div>
            <p className="text-[11px] text-ink-3">
              Destinataire defini par la variable d&apos;env{" "}
              <code className="font-mono">SOCIAL_SECRETARY_EMAIL</code>{" "}
              (fallback <code className="font-mono">elbazikarim@gmail.com</code>).
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-4 border-b border-line flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warn" />
            <h2 className="font-bold text-sm">
              {missing.length} champ{missing.length > 1 ? "s" : ""} manquant
              {missing.length > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-ink-2">
              Complete la fiche employe avant de pouvoir envoyer.
            </p>
            <ul className="text-sm text-ink-2 list-disc pl-5 space-y-0.5">
              {missing.map((m) => (
                <li key={m.key}>{m.label}</li>
              ))}
            </ul>
            <Button asChild variant="gold" size="sm">
              <Link href={`/planning/employees/${id}`}>
                <Mail className="h-3.5 w-3.5" /> Completer la fiche employe
              </Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
