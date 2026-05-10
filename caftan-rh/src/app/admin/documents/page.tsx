// Vue centralisée des documents — admin/RH.
// Server component : fetch ALL documents (limite 500 par défaut) + jointures
// candidat / employé + catalogue + statistiques globales.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { DocumentsTable, type DocumentRow } from "./documents-table";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

type DbDoc = {
  id: string;
  application_id: string | null;
  candidate_id: string | null;
  employee_id: string | null;
  kind: string;
  catalog_slug: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  validation_status: string | null;
  rejection_reason: string | null;
  created_at: string;
  validated_at: string | null;
};

type CandidateRow = { id: string; full_name: string | null; email: string | null };
type EmployeeRow = { id: string; full_name: string | null; email: string | null };

export default async function AdminDocumentsPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  // 1) Fetch des documents les plus récents (cap MAX_ROWS) + count global.
  const docsQuery = await admin
    .from("documents")
    .select(
      "id, application_id, candidate_id, employee_id, kind, catalog_slug, storage_path, file_name, mime_type, size_bytes, validation_status, rejection_reason, created_at, validated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  const docs = (docsQuery.data ?? []) as unknown as DbDoc[];
  const totalCount = docsQuery.count ?? docs.length;

  // 2) Jointures manuelles (évite les soucis FK + permet de mélanger candidate/employee).
  const candidateIds = Array.from(
    new Set(docs.map((d) => d.candidate_id).filter((x): x is string => !!x)),
  );
  const employeeIds = Array.from(
    new Set(docs.map((d) => d.employee_id).filter((x): x is string => !!x)),
  );
  const applicationIds = Array.from(
    new Set(docs.map((d) => d.application_id).filter((x): x is string => !!x)),
  );
  const slugs = Array.from(
    new Set(docs.map((d) => d.catalog_slug).filter((x): x is string => !!x)),
  );

  const [candidatesRes, employeesRes, applicationsRes, catalogRes] = await Promise.all([
    candidateIds.length
      ? admin.from("candidates").select("id, full_name, email").in("id", candidateIds)
      : Promise.resolve({ data: [] as CandidateRow[] }),
    employeeIds.length
      ? admin.from("employees").select("id, full_name, email").in("id", employeeIds)
      : Promise.resolve({ data: [] as EmployeeRow[] }),
    applicationIds.length
      ? admin
          .from("applications")
          .select("id, candidate_id")
          .in("id", applicationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; candidate_id: string | null }> }),
    slugs.length
      ? admin.from("document_catalog").select("slug, label, category").in("slug", slugs)
      : Promise.resolve({ data: [] as Array<{ slug: string; label: string; category: string }> }),
  ]);

  const candidates = ((candidatesRes.data ?? []) as unknown) as CandidateRow[];
  const employees = ((employeesRes.data ?? []) as unknown) as EmployeeRow[];
  const applications = ((applicationsRes.data ?? []) as unknown) as Array<{
    id: string;
    candidate_id: string | null;
  }>;
  const catalog = ((catalogRes.data ?? []) as unknown) as Array<{
    slug: string;
    label: string;
    category: string;
  }>;

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const applicationMap = new Map(applications.map((a) => [a.id, a]));
  const catalogMap = new Map(catalog.map((c) => [c.slug, c]));

  // 3) Build des rows enrichies passées au client.
  const rows: DocumentRow[] = docs.map((d) => {
    // Résolution du candidat : priorité au champ direct, sinon via application.
    let candidate: CandidateRow | undefined;
    if (d.candidate_id) candidate = candidateMap.get(d.candidate_id);
    if (!candidate && d.application_id) {
      const app = applicationMap.get(d.application_id);
      if (app?.candidate_id) candidate = candidateMap.get(app.candidate_id);
    }
    const employee = d.employee_id ? employeeMap.get(d.employee_id) : undefined;
    const catItem = d.catalog_slug ? catalogMap.get(d.catalog_slug) : undefined;

    return {
      id: d.id,
      file_name: d.file_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      kind: d.kind,
      catalog_slug: d.catalog_slug,
      catalog_label: catItem?.label ?? null,
      category: (catItem?.category as string | undefined) ?? null,
      storage_path: d.storage_path,
      is_external: /^https?:\/\//i.test(d.storage_path),
      validation_status: d.validation_status,
      rejection_reason: d.rejection_reason,
      created_at: d.created_at,
      validated_at: d.validated_at,
      application_id: d.application_id,
      candidate: candidate
        ? { id: candidate.id, full_name: candidate.full_name, email: candidate.email }
        : null,
      employee: employee
        ? { id: employee.id, full_name: employee.full_name, email: employee.email }
        : null,
    };
  });

  // 4) Stats (sur l'ensemble visible).
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const counts = {
    total: totalCount,
    visible: rows.length,
    cv: 0,
    id: 0,
    iban: 0,
    contract: 0,
    diploma: 0,
    other: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    last7d: 0,
    fromCandidates: 0,
    fromEmployees: 0,
  };
  for (const r of rows) {
    // Bucket par "famille" (catalog_slug ou kind)
    const slug = (r.catalog_slug ?? r.kind ?? "").toLowerCase();
    if (slug === "cv") counts.cv += 1;
    else if (slug.startsWith("id_card") || slug === "id_card" || slug === "nrn_proof") counts.id += 1;
    else if (slug === "iban") counts.iban += 1;
    else if (slug === "contract_signed" || slug.includes("contract")) counts.contract += 1;
    else if (slug === "diploma") counts.diploma += 1;
    else counts.other += 1;

    if (r.validation_status === "accepted") counts.accepted += 1;
    else if (r.validation_status === "rejected") counts.rejected += 1;
    else counts.pending += 1;

    if (new Date(r.created_at).getTime() > sevenDaysAgo) counts.last7d += 1;

    if (r.candidate && !r.employee) counts.fromCandidates += 1;
    if (r.employee) counts.fromEmployees += 1;
  }

  // 5) Liste des slugs disponibles (pour le filtre type) — avec fallback sur les kinds.
  const typeOptions = Array.from(
    new Map<string, string>([
      ...catalog.map((c) => [c.slug, c.label] as [string, string]),
      // kinds enum, présents même sans catalog_slug
      ["cv", "CV"],
      ["cover_letter", "Lettre de motivation"],
      ["id_card", "Carte d'identité"],
      ["diploma", "Diplôme"],
      ["other", "Autre"],
    ]).entries(),
  )
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Documents centralisés</h1>
          <p className="text-sm text-ink-2">
            Vue unifiée de tous les documents — candidats &amp; employés. {totalCount} document
            {totalCount > 1 ? "s" : ""} au total
            {totalCount > MAX_ROWS ? ` · ${MAX_ROWS} affichés (les plus récents)` : ""}.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Total visible"
          value={counts.visible}
          tone="default"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="En attente"
          value={counts.pending}
          tone="warn"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Validés"
          value={counts.accepted}
          tone="success"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="Rejetés"
          value={counts.rejected}
          tone="danger"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="7 derniers jours"
          value={counts.last7d}
          tone="info"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Candidats / Employés"
          value={`${counts.fromCandidates} · ${counts.fromEmployees}`}
          tone="default"
        />
      </div>

      {/* Familles */}
      <Card className="p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase font-bold tracking-wider text-ink-3 mr-1">
          Familles
        </span>
        <Badge variant="gold">{counts.cv} CV</Badge>
        <Badge variant="contacted">{counts.id} carte d&apos;identité</Badge>
        <Badge variant="muted">{counts.iban} IBAN</Badge>
        <Badge variant="muted">{counts.contract} contrat</Badge>
        <Badge variant="muted">{counts.diploma} diplôme</Badge>
        <Badge variant="muted">{counts.other} autre</Badge>
      </Card>

      {/* Table client (filtres + tri + viewer) */}
      <Card>
        <DocumentsTable rows={rows} typeOptions={typeOptions} maxRows={MAX_ROWS} />
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "default" | "warn" | "success" | "danger" | "info";
}) {
  const toneClass = {
    default: "text-ink-2",
    warn: "text-warn",
    success: "text-success",
    danger: "text-danger",
    info: "text-info",
  }[tone];
  return (
    <Card className="p-3">
      <div className={`flex items-center gap-2 text-[11px] font-semibold ${toneClass}`}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
