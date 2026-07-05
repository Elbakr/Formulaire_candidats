import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ContractBar } from "./contract-bar";
import { ContractForm, type ContractEditable } from "./contract-form";
import { resolveWageBareme } from "@/lib/wage-bareme";
import { ContractIframe } from "./contract-iframe";
import { previewContractHtmlAction } from "../../contract-preview/action";

type Status = "draft" | "ready_to_sign" | "signed" | "archived";

const STATUS_LABEL: Record<Status, string> = {
  draft: "Brouillon",
  ready_to_sign: "Prêt à signer",
  signed: "Signé",
  archived: "Archivé",
};
const STATUS_CLASS: Record<Status, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready_to_sign: "bg-amber-100 text-amber-800",
  signed: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-500",
};

export default async function ContractDetailPage(
  props: PageProps<"/planning/employees/[id]/contract/[contractId]">,
) {
  const { id, contractId } = await props.params;
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: contractRaw }, { data: orgRaw }] = await Promise.all([
    supabase
      .from("employee_contracts")
      .select("*")
      .eq("id", contractId)
      .eq("employee_id", id)
      .maybeSingle(),
    supabase
      .from("org_settings")
      .select("org_name, org_address, org_phone, org_email")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (!contractRaw) notFound();

  const contract = contractRaw as ContractEditable & {
    status: Status;
    signed_at: string | null;
    prepared_at: string | null;
  };
  // Barème plancher (défaut + minimum) résolu selon type de contrat + âge.
  const bareme = await resolveWageBareme(supabase, contract.contract_kind, contract.birth_date);

  // Karim 2026-07-04 : le document affiché/imprimé = LE SUPER LAYOUT (aligné avec
  // l'aperçu d'envoi + le PDF signé), plus jamais le composant ContractDocument
  // divergent. Signé/prêt -> rendered_body figé ; brouillon -> construit à l'identique.
  // Karim 2026-07-05 : option "sans logo/filigrane" via ?brand=off (ex. besoins
  // spécifiques). Ne s'applique qu'au brouillon (un contrat signé garde son corps figé).
  const sp = await props.searchParams;
  const withBranding = (Array.isArray(sp?.brand) ? sp.brand[0] : sp?.brand) !== "off";
  let contractHtml = (contract as unknown as { rendered_body: string | null }).rendered_body ?? null;
  if (!contractHtml) {
    const tplCode = contract.contract_kind === "Étudiant" ? "student" : Number(contract.weekly_hours) < 38 ? "employee_pt" : "employee";
    try {
      const res = await previewContractHtmlAction(id, tplCode, { manualSign: true, withBranding });
      if (res.ok) contractHtml = res.html;
    } catch { /* aperçu best-effort */ }
  }
  void orgRaw; // (org détaillé désormais intégré au super layout via l'entité résolue)

  return (
    <div className="space-y-4">
      <ContractBar
        contractId={contractId}
        employeeId={id}
        status={contract.status}
      />

      <Card className="print:hidden">
        <div className="p-4 border-b border-line">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Contrat {contract.contract_kind}</h1>
            <span className="text-sm text-ink-3">— {contract.full_name}</span>
            <span
              className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[contract.status]}`}
            >
              {STATUS_LABEL[contract.status]}
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1">
            {contract.status === "draft"
              ? "Édite les champs ci-dessous, puis clique sur « Marquer prêt à signer » quand tout est correct."
              : contract.status === "ready_to_sign"
                ? "Le contrat est prêt. Imprime-le, signe-le avec l'employé, puis clique sur « Marquer signé »."
                : contract.status === "signed"
                  ? `Contrat signé${contract.signed_at ? ` le ${new Date(contract.signed_at).toLocaleDateString("fr-BE")}` : ""}. Vue lecture seule.`
                  : "Contrat archivé."}
          </p>
        </div>

        <div className="p-5">
          {contract.status === "draft" ? (
            <ContractForm contract={contract} bareme={{ hourlyFloor: bareme.hourlyFloor, source: bareme.source }} />
          ) : (
            <ReadOnlyView contract={contract} />
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <a
          href={`?brand=${withBranding ? "off" : "on"}`}
          className="text-xs font-semibold text-gold-dark hover:underline"
        >
          {withBranding ? "Générer une version SANS logo/filigrane" : "↩ Revenir à la version AVEC logo"}
        </a>
      </div>

      <Card>
        <ContractIframe html={contractHtml} />
      </Card>
    </div>
  );
}

function ReadOnlyView({ contract }: { contract: ContractEditable }) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Nom complet", contract.full_name],
    ["Date de naissance", contract.birth_date],
    ["Lieu de naissance", contract.birth_place],
    ["NRN", contract.nrn],
    ["Adresse", [contract.address, contract.postal_code, contract.city].filter(Boolean).join(", ")],
    ["Type de contrat", contract.contract_kind],
    ["Période", `${contract.start_date}${contract.end_date ? ` → ${contract.end_date}` : " (sans terme)"}`],
    ["Période d'essai", contract.trial_period_weeks ? `${contract.trial_period_weeks} semaines` : "—"],
    ["Fonction", contract.position_title],
    ["Lieu de travail", contract.workplace],
    ["Heures / sem", String(contract.weekly_hours)],
    ["Salaire mensuel brut", contract.gross_monthly_salary ? `${contract.gross_monthly_salary} €` : "—"],
    ["Taux horaire brut", contract.gross_hourly_rate ? `${contract.gross_hourly_rate} €/h` : "—"],
    ["Chèques-repas", contract.meal_voucher_eur_per_day ? `${contract.meal_voucher_eur_per_day} €/j` : "—"],
    ["Transport", contract.transport_allowance],
    ["CP", contract.joint_committee],
    ["Congés / an", contract.paid_holidays_days ? `${contract.paid_holidays_days} j` : "—"],
    ["Jour de repos", contract.weekly_rest_day],
    ["Notes", contract.notes],
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2 border-b border-line pb-1">
          <dt className="text-ink-3 min-w-[140px]">{k}</dt>
          <dd className="font-medium flex-1">{v && String(v).trim() ? v : <span className="text-ink-3 italic">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
