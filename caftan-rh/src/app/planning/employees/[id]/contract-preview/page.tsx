// Karim 2026-05-30 : preview du contrat tel qu il sera reçu par le candidat,
// rendu dans une iframe pour isolation CSS totale (pas de styles de l app).
// URL : /planning/employees/[id]/contract-preview?tpl=employee_pt
// Karim 2026-06-15 : CloseBar sticky (window.close + repli href) pour PWA iOS.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { previewContractHtmlAction } from "./action";
import CloseBar from "./close-bar";

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
      <CloseBar
        fallbackHref={`/planning/employees/${id}`}
        title={`Aperçu contrat — ${empName}`}
        subtitle={`Template : ${tplCode}`}
      />
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
