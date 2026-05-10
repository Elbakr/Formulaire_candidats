import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ContractBar } from "./contract-bar";
import { ContractForm, type ContractEditable } from "./contract-form";
import { ContractDocument, type ContractFullData } from "./contract-document";

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
  const org = (orgRaw ?? {}) as {
    org_name?: string | null;
    org_address?: string | null;
    org_phone?: string | null;
    org_email?: string | null;
  };

  const docData: ContractFullData = {
    contract,
    org: {
      name: org.org_name ?? "Caftan Factory SRL",
      address: org.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek (Bruxelles)",
      phone: org.org_phone ?? null,
      email: org.org_email ?? null,
    },
  };

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
            <ContractForm contract={contract} />
          ) : (
            <ReadOnlyView contract={contract} />
          )}
        </div>
      </Card>

      <Card className="print:hidden">
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Aperçu contrat</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Aperçu du document tel qu&apos;il sera imprimé. Utilise le bouton « Imprimer / PDF »
            pour obtenir le document final.
          </p>
        </div>
        <div className="p-4 sm:p-6 bg-white text-black overflow-x-auto">
          <ContractDocument data={docData} />
        </div>
      </Card>

      {/* Document seul, en mode impression : occupe toute la page */}
      <div className="hidden print:block bg-white text-black">
        <ContractDocument data={docData} />
      </div>
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
