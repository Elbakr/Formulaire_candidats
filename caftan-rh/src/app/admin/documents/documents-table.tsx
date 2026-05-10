"use client";

// Client component : filtres + tri + viewer inline pour /admin/documents.
// Filtrage en mémoire (pas de re-fetch) — la page serveur a déjà cappé à 500 lignes.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Download,
  ExternalLink,
  Eye,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ImageIcon,
  Grid3x3,
  List,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime } from "@/lib/utils";
import { validateDocumentAction } from "@/app/rh/candidates/[id]/documents-actions";
import { getSignedDocUrlAction, bulkDownloadDocsAction } from "./actions";

export type DocumentRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
  catalog_slug: string | null;
  catalog_label: string | null;
  category: string | null;
  storage_path: string;
  is_external: boolean;
  validation_status: string | null;
  rejection_reason: string | null;
  created_at: string;
  validated_at: string | null;
  application_id: string | null;
  candidate: { id: string; full_name: string | null; email: string | null } | null;
  employee: { id: string; full_name: string | null; email: string | null } | null;
};

type TypeOption = { value: string; label: string };

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Validé",
  rejected: "Rejeté",
};

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return "—";
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

function isImageMime(mime: string | null, name: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(name);
}

function isPdfMime(mime: string | null, name: string): boolean {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(name);
}

export function DocumentsTable({
  rows,
  typeOptions,
  maxRows,
}: {
  rows: DocumentRow[];
  typeOptions: TypeOption[];
  maxRows: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Filtres
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all"); // all | candidate | employee
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [view, setView] = useState<"list" | "grid">("list");

  // Viewer
  const [viewerDoc, setViewerDoc] = useState<DocumentRow | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Sélection (bulk)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86_399_000 : null;

    return rows.filter((r) => {
      if (typeFilter !== "all") {
        const slug = r.catalog_slug ?? r.kind;
        if (slug !== typeFilter) return false;
      }
      if (statusFilter !== "all") {
        const s = r.validation_status ?? "pending";
        if (s !== statusFilter) return false;
      }
      if (sourceFilter === "candidate" && !r.candidate) return false;
      if (sourceFilter === "employee" && !r.employee) return false;

      if (fromTs && new Date(r.created_at).getTime() < fromTs) return false;
      if (toTs && new Date(r.created_at).getTime() > toTs) return false;

      if (q) {
        const hay = [
          r.file_name,
          r.candidate?.full_name ?? "",
          r.candidate?.email ?? "",
          r.employee?.full_name ?? "",
          r.employee?.email ?? "",
          r.catalog_label ?? "",
          r.kind,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, statusFilter, sourceFilter, dateFrom, dateTo]);

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setSourceFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  async function openViewer(doc: DocumentRow) {
    setViewerDoc(doc);
    setViewerUrl(null);
    setRejectReason("");
    setRejecting(false);
    setViewerLoading(true);
    try {
      if (doc.is_external) {
        setViewerUrl(doc.storage_path);
      } else {
        const res = await getSignedDocUrlAction(doc.id);
        if ("error" in res) {
          toast.error(res.error);
        } else {
          setViewerUrl(res.url);
        }
      }
    } finally {
      setViewerLoading(false);
    }
  }

  function closeViewer() {
    setViewerDoc(null);
    setViewerUrl(null);
    setRejectReason("");
    setRejecting(false);
  }

  function onValidate(documentId: string, accepted: boolean, reason?: string) {
    startTransition(async () => {
      const res = await validateDocumentAction(documentId, accepted, reason);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(accepted ? "Document validé." : "Document rejeté.");
        closeViewer();
        router.refresh();
      }
    });
  }

  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAllVisible() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  async function bulkDownload() {
    if (selected.size === 0) {
      toast.info("Aucun document sélectionné.");
      return;
    }
    const res = await bulkDownloadDocsAction(Array.from(selected));
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    // Télécharge séquentiellement (un onglet par document, ou un click programmatique)
    for (const it of res.items) {
      const a = document.createElement("a");
      a.href = it.url;
      a.download = it.file_name;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Petite pause pour ne pas saturer le navigateur
      await new Promise((r) => setTimeout(r, 250));
    }
    toast.success(`${res.items.length} téléchargement(s) lancé(s).`);
  }

  const allVisibleSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="p-3 border-b border-line space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
            <Input
              placeholder="Rechercher (nom de fichier, candidat, employé…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="accepted">Validés</SelectItem>
              <SelectItem value="rejected">Rejetés</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous (cand. + emp.)</SelectItem>
              <SelectItem value="candidate">Candidats</SelectItem>
              <SelectItem value="employee">Employés</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs"
              aria-label="Date de début"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs"
              aria-label="Date de fin"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="h-3.5 w-3.5 text-ink-3" />
          <span className="text-ink-3">
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
            {selected.size > 0 ? ` · ${selected.size} sélectionné${selected.size > 1 ? "s" : ""}` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={resetFilters} type="button">
            Réinitialiser
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 ? (
              <Button variant="outline" size="sm" onClick={bulkDownload} type="button">
                <Download className="h-3.5 w-3.5" /> Télécharger ({selected.size})
              </Button>
            ) : null}
            <div className="flex border-[1.5px] border-line rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-2 py-1 text-xs ${view === "list" ? "bg-ink text-white" : "bg-surface hover:bg-surface-2"}`}
                aria-label="Vue liste"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`px-2 py-1 text-xs ${view === "grid" ? "bg-ink text-white" : "bg-surface hover:bg-surface-2"}`}
                aria-label="Vue grille"
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-ink-3">
          Aucun document ne correspond aux filtres.
        </div>
      ) : view === "list" ? (
        <ListView
          rows={filtered}
          selected={selected}
          allSelected={allVisibleSelected}
          onToggle={toggleSelected}
          onToggleAll={toggleAllVisible}
          onOpen={openViewer}
          onValidate={onValidate}
          pending={pending}
        />
      ) : (
        <GridView rows={filtered} onOpen={openViewer} />
      )}

      {rows.length >= maxRows ? (
        <div className="p-3 text-center text-[11px] text-ink-3 border-t border-line">
          Limite : {maxRows} documents les plus récents affichés. Affine les filtres pour cibler des documents plus anciens.
        </div>
      ) : null}

      {/* Viewer dialog */}
      <Dialog open={!!viewerDoc} onOpenChange={(o) => !o && closeViewer()}>
        <DialogContent className="max-w-[1000px] w-[95vw]">
          {viewerDoc ? (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{viewerDoc.file_name}</DialogTitle>
                <DialogDescription>
                  {viewerDoc.catalog_label ?? viewerDoc.kind}
                  {" · "}
                  {viewerDoc.candidate?.full_name ??
                    viewerDoc.employee?.full_name ??
                    "—"}
                  {" · "}
                  {formatDateTime(viewerDoc.created_at)}
                  {viewerDoc.size_bytes ? ` · ${formatBytes(viewerDoc.size_bytes)}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="p-3 min-h-[420px] flex items-center justify-center bg-surface-2">
                {viewerLoading ? (
                  <div className="text-sm text-ink-3">Chargement…</div>
                ) : !viewerUrl ? (
                  <div className="text-sm text-danger">Aperçu indisponible.</div>
                ) : isImageMime(viewerDoc.mime_type, viewerDoc.file_name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={viewerUrl}
                    alt={viewerDoc.file_name}
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                ) : isPdfMime(viewerDoc.mime_type, viewerDoc.file_name) ? (
                  <iframe
                    src={viewerUrl}
                    title={viewerDoc.file_name}
                    className="w-full h-[70vh] border border-line rounded"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-sm text-ink-3">
                    <FileText className="h-10 w-10" />
                    <div>Aperçu non supporté pour ce format.</div>
                    <a
                      href={viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gold-dark underline text-xs"
                    >
                      Ouvrir dans un nouvel onglet
                    </a>
                  </div>
                )}
              </div>

              {rejecting ? (
                <div className="px-5 py-3 border-t border-line space-y-2">
                  <Label className="text-xs">Motif de rejet</Label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ex : illisible, document expiré…"
                    autoFocus
                  />
                </div>
              ) : null}

              <DialogFooter>
                {viewerUrl ? (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <a href={viewerUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={viewerUrl} download={viewerDoc.file_name}>
                        <Download className="h-3.5 w-3.5" /> Télécharger
                      </a>
                    </Button>
                  </>
                ) : null}

                {viewerDoc.validation_status !== "accepted" ? (
                  <Button
                    variant="success"
                    size="sm"
                    disabled={pending}
                    onClick={() => onValidate(viewerDoc.id, true)}
                  >
                    <Check className="h-3.5 w-3.5" /> Valider
                  </Button>
                ) : null}

                {viewerDoc.validation_status !== "rejected" ? (
                  rejecting ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={pending || !rejectReason.trim()}
                      onClick={() => onValidate(viewerDoc.id, false, rejectReason.trim())}
                    >
                      Confirmer rejet
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() => setRejecting(true)}
                    >
                      <X className="h-3.5 w-3.5" /> Rejeter
                    </Button>
                  )
                ) : null}

                <Button variant="ghost" size="sm" onClick={closeViewer}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  if (s === "accepted") {
    return (
      <Badge variant="hired" className="text-[10px] px-1.5 py-0.5">
        <CheckCircle2 className="h-3 w-3" /> {STATUS_LABELS[s]}
      </Badge>
    );
  }
  if (s === "rejected") {
    return (
      <Badge variant="refused" className="text-[10px] px-1.5 py-0.5">
        <XCircle className="h-3 w-3" /> {STATUS_LABELS[s]}
      </Badge>
    );
  }
  return (
    <Badge variant="new" className="text-[10px] px-1.5 py-0.5">
      <Clock className="h-3 w-3" /> {STATUS_LABELS[s] ?? s}
    </Badge>
  );
}

function OwnerCell({ row }: { row: DocumentRow }) {
  const owner = row.employee ?? row.candidate;
  if (!owner) return <span className="text-ink-3">—</span>;
  const name = owner.full_name ?? owner.email ?? "Sans nom";
  const href = row.employee
    ? `/planning/employees/${row.employee.id}`
    : row.application_id
      ? `/rh/candidates/${row.application_id}`
      : null;
  const inner = (
    <div className="flex items-center gap-2 min-w-0">
      <NameAvatar name={name} className="h-7 w-7 text-[10px] shrink-0" />
      <div className="min-w-0">
        <div className="text-xs font-bold truncate max-w-[160px]">{name}</div>
        <div className="text-[10px] text-ink-3 truncate max-w-[160px]">
          {row.employee ? "Employé" : "Candidat"}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function TypeIcon({ row }: { row: DocumentRow }) {
  if (isImageMime(row.mime_type, row.file_name)) {
    return <ImageIcon className="h-4 w-4 text-info" />;
  }
  if (isPdfMime(row.mime_type, row.file_name)) {
    return <FileText className="h-4 w-4 text-danger" />;
  }
  return <FileText className="h-4 w-4 text-ink-3" />;
}

function ListView({
  rows,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onOpen,
  onValidate,
  pending,
}: {
  rows: DocumentRow[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (d: DocumentRow) => void;
  onValidate: (id: string, accepted: boolean, reason?: string) => void;
  pending: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
          <tr>
            <th className="p-2 text-left w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Tout sélectionner"
              />
            </th>
            <th className="p-2 text-left">Document</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Propriétaire</th>
            <th className="p-2 text-left">Statut</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const typeLabel = r.catalog_label ?? r.kind;
            return (
              <tr
                key={r.id}
                className="hover:bg-surface-2 cursor-pointer"
                onClick={() => onOpen(r)}
              >
                <td className="p-2 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => onToggle(r.id)}
                    aria-label={`Sélectionner ${r.file_name}`}
                  />
                </td>
                <td className="p-2 align-middle">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon row={r} />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate max-w-[260px]">
                        {r.file_name}
                      </div>
                      <div className="text-[10px] text-ink-3">
                        {formatBytes(r.size_bytes)}
                        {r.is_external ? " · externe" : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-2 align-middle">
                  <Badge variant="muted" className="text-[10px]">
                    {typeLabel}
                  </Badge>
                </td>
                <td className="p-2 align-middle">
                  <OwnerCell row={r} />
                </td>
                <td className="p-2 align-middle">
                  <StatusBadge status={r.validation_status} />
                </td>
                <td className="p-2 align-middle text-xs text-ink-3 whitespace-nowrap">
                  {formatDate(r.created_at)}
                </td>
                <td
                  className="p-2 align-middle text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpen(r)}
                      title="Aperçu"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    {r.validation_status !== "accepted" ? (
                      <Button
                        variant="success"
                        size="sm"
                        disabled={pending}
                        onClick={() => onValidate(r.id, true)}
                        title="Valider"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    ) : null}
                    {r.validation_status !== "rejected" ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          const reason = prompt("Motif de rejet :");
                          if (reason && reason.trim()) onValidate(r.id, false, reason.trim());
                        }}
                        title="Rejeter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GridView({
  rows,
  onOpen,
}: {
  rows: DocumentRow[];
  onOpen: (d: DocumentRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {rows.map((r) => {
        const owner = r.employee ?? r.candidate;
        const ownerName = owner?.full_name ?? owner?.email ?? "—";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            className="text-left rounded-md border border-line bg-surface hover:border-gold transition-colors p-3 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <TypeIcon row={r} />
              <span className="text-[10px] uppercase font-bold tracking-wider text-ink-3 truncate">
                {r.catalog_label ?? r.kind}
              </span>
              <div className="ml-auto">
                <StatusBadge status={r.validation_status} />
              </div>
            </div>
            <div className="text-xs font-bold truncate" title={r.file_name}>
              {r.file_name}
            </div>
            <div className="text-[10px] text-ink-3 truncate">
              {ownerName} · {formatDate(r.created_at)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
