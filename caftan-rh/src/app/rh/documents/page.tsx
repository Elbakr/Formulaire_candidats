// Karim 2026-06-02 : valise documents centralisee. Liste TOUS les documents
// (payslips, contrats, ruptures, CV) avec filtres par worker / periode / type.
// Vue groupee par travailleur + section par type au sein de chaque worker.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Briefcase, Mail, FileText, FileSignature, FileX, ImageIcon, Wallet } from "lucide-react";
import { DocumentsFilters } from "./filters";
import { DownloadLink } from "./download-link";

export const dynamic = "force-dynamic";

interface DocRow {
  doc_type: "payslip" | "contract" | "termination" | "cv" | "screening";
  employee_id: string | null;
  employee_name: string | null;
  doc_id: string;
  title: string;
  date: string; // ISO
  period: string | null;
  bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  status: string | null;
}

const TYPE_META: Record<string, { label: string; icon: typeof Wallet; cls: string }> = {
  payslip: { label: "Fiche de paie", icon: Wallet, cls: "bg-green-100 text-green-800 border-green-200" },
  contract: { label: "Contrat", icon: FileSignature, cls: "bg-purple-100 text-purple-800 border-purple-200" },
  termination: { label: "Rupture amiable", icon: FileX, cls: "bg-amber-100 text-amber-800 border-amber-200" },
  cv: { label: "CV", icon: FileText, cls: "bg-blue-100 text-blue-800 border-blue-200" },
  screening: { label: "Screening", icon: ImageIcon, cls: "bg-pink-100 text-pink-800 border-pink-200" },
};

export default async function DocumentsValisePage({ searchParams }: { searchParams: Promise<{ employee?: string; year?: string; month?: string; types?: string }> }) {
  await requireRole(["admin", "rh"]);
  const params = await searchParams;
  const employeeFilter = params.employee ?? "";
  const yearFilter = params.year ?? "";
  const monthFilter = params.month ?? "";
  const typesFilter = (params.types ?? "").split(",").filter(Boolean);
  const allTypes = typesFilter.length === 0;

  const admin = createAdminClient();

  // Karim 2026-06-02 : liste TOUS les employees (actifs + on_leave + ex-travailleurs)
  // pour acceder aux docs historiques d'employees archives.
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name, status")
    .order("status")
    .order("full_name");

  const docs: DocRow[] = [];

  // 1. Payslips
  if (allTypes || typesFilter.includes("payslip")) {
    let q = admin
      .from("payslips")
      .select("id, employee_id, period_label, period_year, period_month, pdf_storage_path, pdf_filename, payment_status, created_at, employee:employees(full_name)")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(500);
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
    if (yearFilter) q = q.eq("period_year", Number(yearFilter));
    if (monthFilter) q = q.eq("period_month", Number(monthFilter));
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ id: string; employee_id: string | null; period_label: string | null; period_year: number; period_month: number; pdf_storage_path: string | null; pdf_filename: string | null; payment_status: string | null; created_at: string; employee?: { full_name: string } | null }>) {
      docs.push({
        doc_type: "payslip",
        employee_id: r.employee_id,
        employee_name: r.employee?.full_name ?? null,
        doc_id: r.id,
        title: r.pdf_filename ?? (r.period_label ?? `Fiche ${r.period_year}-${String(r.period_month).padStart(2, "0")}`),
        date: r.created_at,
        period: `${r.period_year}-${String(r.period_month).padStart(2, "0")}`,
        bucket: "payslips",
        storage_path: r.pdf_storage_path,
        external_url: null,
        status: r.payment_status,
      });
    }
  }

  // 2. Contracts (employee_contracts si table existe)
  if (allTypes || typesFilter.includes("contract")) {
    try {
      let q = admin
        .from("employee_contracts")
        .select("id, employee_id, contract_type, start_date, end_date, signed_pdf_url, signed_at, created_at, docuseal_status, employee:employees(full_name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (employeeFilter) q = q.eq("employee_id", employeeFilter);
      const { data } = await q;
      for (const r of (data ?? []) as Array<{ id: string; employee_id: string | null; contract_type: string | null; start_date: string | null; signed_pdf_url: string | null; signed_at: string | null; created_at: string; docuseal_status: string | null; employee?: { full_name: string } | null }>) {
        const dt = r.signed_at ?? r.start_date ?? r.created_at;
        const dtObj = new Date(dt);
        if (yearFilter && String(dtObj.getFullYear()) !== yearFilter) continue;
        if (monthFilter && String(dtObj.getMonth() + 1).padStart(2, "0") !== String(monthFilter).padStart(2, "0")) continue;
        docs.push({
          doc_type: "contract",
          employee_id: r.employee_id,
          employee_name: r.employee?.full_name ?? null,
          doc_id: r.id,
          title: `Contrat ${r.contract_type ?? ""}${r.start_date ? ` (début ${r.start_date})` : ""}`.trim(),
          date: dt,
          period: dt.slice(0, 7),
          bucket: null,
          storage_path: null,
          external_url: r.signed_pdf_url,
          status: r.docuseal_status ?? (r.signed_at ? "signed" : "pending"),
        });
      }
    } catch { /* table peut ne pas exister */ }
  }

  // 3. Terminations
  if (allTypes || typesFilter.includes("termination")) {
    let q = admin
      .from("contract_terminations")
      .select("id, employee_id, status, effective_date, signed_pdf_storage_path, requested_at, employer_signed_at, employee:employees(full_name)")
      .order("requested_at", { ascending: false })
      .limit(500);
    if (employeeFilter) q = q.eq("employee_id", employeeFilter);
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ id: string; employee_id: string; status: string; effective_date: string | null; signed_pdf_storage_path: string | null; requested_at: string; employer_signed_at: string | null; employee?: { full_name: string } | null }>) {
      const dt = r.employer_signed_at ?? r.requested_at;
      const dtObj = new Date(dt);
      if (yearFilter && String(dtObj.getFullYear()) !== yearFilter) continue;
      if (monthFilter && String(dtObj.getMonth() + 1).padStart(2, "0") !== String(monthFilter).padStart(2, "0")) continue;
      const isStored = r.signed_pdf_storage_path && !r.signed_pdf_storage_path.startsWith("http");
      docs.push({
        doc_type: "termination",
        employee_id: r.employee_id,
        employee_name: r.employee?.full_name ?? null,
        doc_id: r.id,
        title: `Rupture amiable${r.effective_date ? ` (fin ${r.effective_date})` : ""}`,
        date: dt,
        period: dt.slice(0, 7),
        bucket: isStored ? "terminations" : null,
        storage_path: isStored ? r.signed_pdf_storage_path : null,
        external_url: !isStored ? r.signed_pdf_storage_path : null,
        status: r.status,
      });
    }
  }

  // 4. Candidats CV (si filtre type cv OU pas de filtre actif)
  if (allTypes || typesFilter.includes("cv") || typesFilter.includes("screening")) {
    try {
      let q = admin
        .from("candidates")
        .select("id, full_name, cv_storage_path, screening_pdf_path, created_at, status")
        .not("cv_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (employeeFilter) q = q.eq("id", "00000000-0000-0000-0000-000000000000"); // pas de match si employeeFilter
      const { data } = await q;
      for (const r of (data ?? []) as Array<{ id: string; full_name: string; cv_storage_path: string | null; screening_pdf_path: string | null; created_at: string; status: string }>) {
        const dt = r.created_at;
        const dtObj = new Date(dt);
        if (yearFilter && String(dtObj.getFullYear()) !== yearFilter) continue;
        if (monthFilter && String(dtObj.getMonth() + 1).padStart(2, "0") !== String(monthFilter).padStart(2, "0")) continue;
        if (r.cv_storage_path && (allTypes || typesFilter.includes("cv"))) {
          docs.push({
            doc_type: "cv",
            employee_id: null,
            employee_name: r.full_name,
            doc_id: r.id,
            title: `CV — ${r.full_name}`,
            date: dt,
            period: dt.slice(0, 7),
            bucket: "candidate-docs",
            storage_path: r.cv_storage_path,
            external_url: null,
            status: r.status,
          });
        }
        if (r.screening_pdf_path && (allTypes || typesFilter.includes("screening"))) {
          docs.push({
            doc_type: "screening",
            employee_id: null,
            employee_name: r.full_name,
            doc_id: r.id + "-screening",
            title: `Questionnaire — ${r.full_name}`,
            date: dt,
            period: dt.slice(0, 7),
            bucket: "candidate-docs",
            storage_path: r.screening_pdf_path,
            external_url: null,
            status: r.status,
          });
        }
      }
    } catch { /* table can have different cols */ }
  }

  // Sort + group par employee
  docs.sort((a, b) => (a.date > b.date ? -1 : 1));
  const grouped = new Map<string, DocRow[]>();
  for (const d of docs) {
    const key = d.employee_name ?? "(orphelin)";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  // Stats
  const counts = new Map<string, number>();
  for (const d of docs) counts.set(d.doc_type, (counts.get(d.doc_type) ?? 0) + 1);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="w-6 h-6" />
          Valise documents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tous les documents archivés (fiches paie, contrats, ruptures, CV, screening) par travailleur, période et type.
        </p>
      </div>

      <DocumentsFilters
        employees={(employees ?? []) as Array<{ id: string; full_name: string; status?: string }>}
        currentEmployee={employeeFilter}
        currentYear={yearFilter}
        currentMonth={monthFilter}
        currentTypes={typesFilter}
        counts={counts}
      />

      <div className="text-xs text-ink-3 flex flex-wrap items-center gap-3">
        <span><strong>{docs.length}</strong> document{docs.length > 1 ? "s" : ""}</span>
        <span>·</span>
        <span><strong>{grouped.size}</strong> travailleur{grouped.size > 1 ? "s" : ""}</span>
        {Array.from(counts.entries()).map(([t, n]) => {
          const meta = TYPE_META[t] ?? { label: t, cls: "" };
          return (
            <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] ${meta.cls}`}>
              {n} {meta.label}
            </span>
          );
        })}
      </div>

      {grouped.size === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucun document pour ces filtres.
        </Card>
      )}

      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([empName, items]) => {
          // Sous-grouper par type au sein du travailleur
          const byType = new Map<string, DocRow[]>();
          for (const it of items) {
            if (!byType.has(it.doc_type)) byType.set(it.doc_type, []);
            byType.get(it.doc_type)!.push(it);
          }
          const empId = items.find((i) => i.employee_id)?.employee_id ?? null;
          return (
            <Card key={empName} className="p-0 overflow-hidden">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm">{empName}</h2>
                  {empId && (
                    <a href={`/planning/employees/${empId}`} className="text-[10px] text-blue-700 underline hover:text-blue-900">
                      Voir fiche →
                    </a>
                  )}
                </div>
                <span className="text-xs text-ink-3">{items.length} doc{items.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-line/30">
                {Array.from(byType.entries()).map(([type, list]) => {
                  const meta = TYPE_META[type] ?? { label: type, icon: FileText, cls: "" };
                  const Icon = meta.icon;
                  return (
                    <div key={type} className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-3.5 h-3.5 text-ink-3" />
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-ink-3">({list.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 ml-5">
                        {list.map((d) => (
                          <DocumentRow key={d.doc_id} doc={d} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DocumentRow({ doc }: { doc: DocRow }) {
  // Karim 2026-06-02 : badge etat signature pour contrats + ruptures
  const sigBadge = (() => {
    if (doc.doc_type !== "contract" && doc.doc_type !== "termination") return null;
    const s = (doc.status ?? "").toLowerCase();
    if (s === "fully_signed" || s === "signed" || s === "completed" || s === "executed") {
      return { label: "✓ Signé", cls: "bg-green-100 text-green-800 border-green-300" };
    }
    if (s === "signed_employee" || s === "signed_employer") {
      return { label: "⏳ Signature partielle", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" };
    }
    if (s === "sent_for_signature" || s === "pending") {
      return { label: "📨 En attente signature", cls: "bg-blue-100 text-blue-800 border-blue-300" };
    }
    if (s === "refused" || s === "declined" || s === "cancelled") {
      return { label: "✗ Refusé/Annulé", cls: "bg-red-100 text-red-800 border-red-300" };
    }
    if (s === "approved" || s === "pending_admin") {
      return { label: "⌛ À envoyer", cls: "bg-gray-100 text-gray-800 border-gray-300" };
    }
    return null;
  })();

  // Badge paiement pour fiches de paie
  const paidBadge = (() => {
    if (doc.doc_type !== "payslip") return null;
    const s = (doc.status ?? "").toLowerCase();
    if (s === "paid") return { label: "✓ Payée", cls: "bg-green-100 text-green-800 border-green-300" };
    if (s === "scheduled") return { label: "⏳ Différée", cls: "bg-amber-100 text-amber-800 border-amber-300" };
    return { label: "💰 À payer", cls: "bg-blue-100 text-blue-800 border-blue-300" };
  })();

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-line/40 bg-surface text-xs">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1.5">
          <span className="truncate">{doc.title}</span>
        </div>
        <div className="text-[10px] text-ink-3 flex items-center gap-2 flex-wrap mt-0.5">
          <span>{new Date(doc.date).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" })}</span>
          {sigBadge && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] border ${sigBadge.cls}`}>
              {sigBadge.label}
            </span>
          )}
          {paidBadge && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] border ${paidBadge.cls}`}>
              {paidBadge.label}
            </span>
          )}
        </div>
      </div>
      <DownloadLink
        bucket={doc.bucket}
        storagePath={doc.storage_path}
        externalUrl={doc.external_url}
        title={doc.title}
      />
    </div>
  );
}
