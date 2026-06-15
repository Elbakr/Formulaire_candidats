// Karim 2026-05-31 : version IMPRIMABLE du contrat - sans pré-signature
// Karim ni signature-fields DocuSeal. Juste des lignes vides pour signature
// manuelle. Print-ready (CSS print + zone signature appropriée).
// Karim 2026-06-15 : CloseBar sticky (window.close + repli href) pour PWA iOS.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { previewContractHtmlAction } from "../contract-preview/action";
import CloseBar from "../contract-preview/close-bar";

export const dynamic = "force-dynamic";

export default async function ContractPrintPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tpl?: string }>;
}) {
  await requireRole(["admin", "rh"]);
  const { id } = await props.params;
  const { tpl } = await props.searchParams;
  const tplCode = (tpl ?? "employee") as "employee" | "employee_pt" | "student";

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("full_name").eq("id", id).single();
  const empName = (emp as { full_name?: string } | null)?.full_name ?? "Employé";

  // Force mode "manual sign" : pas de signature stockée, pas de signature-field
  const res = await previewContractHtmlAction(id, tplCode, { manualSign: true });

  if (!res.ok) {
    return (
      <div className="p-8 text-red-700">Erreur : {res.error}</div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <CloseBar
        fallbackHref={`/planning/employees/${id}`}
        title={`Imprimer pour signature manuelle — ${empName}`}
        subtitle={`Template : ${tplCode}`}
        showPrintButton
      />
      <iframe
        srcDoc={res.html}
        title="Contrat imprimable"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}
