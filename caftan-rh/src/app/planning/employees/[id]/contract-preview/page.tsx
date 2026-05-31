// Karim 2026-05-30 : preview du contrat tel qu il sera reçu par le candidat,
// rendu dans une iframe pour isolation CSS totale (pas de styles de l app).
// URL : /planning/employees/[id]/contract-preview?tpl=employee_pt

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { previewContractHtmlAction } from "./action";

export const dynamic = "force-dynamic";

type SearchParams = { tpl?: string };

export default async function ContractPreviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "rh"]);
  const { id } = await props.params;
  const { tpl } = await props.searchParams;
  const tplCode = (tpl ?? "employee") as "employee" | "employee_pt" | "student";

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("full_name, contract_type").eq("id", id).single();
  const empName = (emp as { full_name?: string } | null)?.full_name ?? "Employé";

  const res = await previewContractHtmlAction(id, tplCode);

  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 py-2 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">Aperçu contrat — {empName}</h1>
          <p className="text-xs text-muted-foreground">Template : {tplCode}</p>
        </div>
        <a href={`/planning/employees/${id}`} className="text-xs text-blue-700 hover:underline">
          ← Retour fiche employé
        </a>
      </div>
      {res.ok ? (
        <iframe
          srcDoc={res.html}
          title="Aperçu contrat"
          className="flex-1 w-full border-0 bg-white"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-red-700 text-sm">
          Erreur : {res.error}
        </div>
      )}
    </div>
  );
}
