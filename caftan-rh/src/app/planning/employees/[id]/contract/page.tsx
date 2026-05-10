import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Eye } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prepareContractAction } from "../contract-actions";
import { PrepareContractButton } from "./prepare-button";

type ContractRow = {
  id: string;
  contract_kind: string;
  start_date: string;
  end_date: string | null;
  status: "draft" | "ready_to_sign" | "signed" | "archived";
  signed_at: string | null;
  prepared_at: string | null;
  position_title: string;
  workplace: string;
};

const STATUS_LABEL: Record<ContractRow["status"], string> = {
  draft: "Brouillon",
  ready_to_sign: "Prêt à signer",
  signed: "Signé",
  archived: "Archivé",
};
const STATUS_CLASS: Record<ContractRow["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  ready_to_sign: "bg-amber-100 text-amber-800",
  signed: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-500",
};

export default async function EmployeeContractListPage(
  props: PageProps<"/planning/employees/[id]/contract">,
) {
  const { id } = await props.params;
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: emp }, { data: contractsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, job_title")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("employee_contracts")
      .select(
        "id, contract_kind, start_date, end_date, status, signed_at, prepared_at, position_title, workplace",
      )
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!emp) notFound();
  const employee = emp as { id: string; full_name: string; job_title: string | null };
  const contracts = (contractsRaw ?? []) as ContractRow[];
  const draft = contracts.find((c) => c.status === "draft");
  const hasOpen = contracts.some(
    (c) => c.status === "draft" || c.status === "ready_to_sign",
  );

  async function prepareNew() {
    "use server";
    const r = await prepareContractAction(id);
    if (r.contractId) {
      redirect(`/planning/employees/${id}/contract/${r.contractId}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/planning/employees/${id}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour fiche
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/planning/employees/${id}/dimona`}>
            Dimona ONSS
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">Contrat &amp; dossier</h1>
            <span className="text-sm text-ink-3">— {employee.full_name}</span>
          </div>
          <p className="text-sm text-ink-2 mt-1">
            Prépare le contrat de travail belge, imprime-le pour signature, puis marque-le signé
            pour activer automatiquement le compte employé.
          </p>
        </div>

        <div className="p-4">
          {draft ? (
            <Button asChild variant="gold">
              <Link href={`/planning/employees/${id}/contract/${draft.id}`}>
                <FileText className="h-3.5 w-3.5" /> Reprendre le brouillon
              </Link>
            </Button>
          ) : (
            <form action={prepareNew}>
              <PrepareContractButton disabled={hasOpen} />
              {hasOpen ? (
                <p className="text-xs text-ink-3 mt-2">
                  Un contrat est déjà en cours de signature. Termine-le ou archive-le avant d&apos;en
                  préparer un nouveau.
                </p>
              ) : null}
            </form>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Historique</h2>
        </div>
        {contracts.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            Aucun contrat préparé pour cet employé.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {contracts.map((c) => (
              <li
                key={c.id}
                className="p-4 flex items-center gap-3 flex-wrap hover:bg-surface-2 transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-ink-2" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{c.contract_kind}</span>
                    <span className="text-xs text-ink-3">{c.position_title}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    Début {c.start_date}
                    {c.end_date ? ` → ${c.end_date}` : ""}
                    {" · "}
                    {c.workplace}
                    {c.signed_at
                      ? ` · signé le ${new Date(c.signed_at).toLocaleDateString("fr-BE")}`
                      : ""}
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/planning/employees/${id}/contract/${c.id}`}>
                    <Eye className="h-3.5 w-3.5" /> Voir / Imprimer
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
