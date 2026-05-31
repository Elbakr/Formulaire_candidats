// Karim 2026-05-31 : version IMPRIMABLE du contrat - sans pré-signature
// Karim ni signature-fields DocuSeal. Juste des lignes vides pour signature
// manuelle. Print-ready (CSS print + zone signature appropriée).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { previewContractHtmlAction } from "../contract-preview/action";

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
      <div className="px-4 py-2 border-b bg-white flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-sm font-semibold">
            Imprimer pour signature manuelle — {empName}
          </h1>
          <p className="text-xs text-muted-foreground">Template : {tplCode}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/planning/employees/${id}`}
            className="text-xs text-blue-700 hover:underline px-3 py-1"
          >
            ← Retour fiche
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-blue-700"
            suppressHydrationWarning
          >
            🖨️ Imprimer / PDF
          </button>
        </div>
      </div>
      <iframe
        srcDoc={res.html}
        title="Contrat imprimable"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}
