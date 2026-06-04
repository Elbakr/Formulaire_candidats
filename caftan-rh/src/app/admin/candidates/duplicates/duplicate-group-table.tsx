"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { mergeCandidatesAction } from "./actions";

type Candidate = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  birth_date: string | null;
  postal_code: string | null;
  city: string | null;
  source: string | null;
  applied_at: string | null;
  created_at: string | null;
  gf_entry_id: string | null;
  profile_id: string | null;
  cv_url: string | null;
};

export function DuplicateGroupTable({
  criterion,
  groupKey,
  candidates,
}: {
  criterion: string;
  groupKey: string;
  candidates: Candidate[];
}) {
  const [keeperId, setKeeperId] = useState<string>(candidates[0]?.id ?? "");
  const [merged, setMerged] = useState(false);
  const [pending, startTransition] = useTransition();

  if (merged) return null;

  function handleMerge() {
    const duplicateIds = candidates.filter((c) => c.id !== keeperId).map((c) => c.id);
    if (duplicateIds.length === 0) {
      toast.error("Aucun duplicate selectionne");
      return;
    }
    const kept = candidates.find((c) => c.id === keeperId);
    if (!confirm(
      `Fusionner ${duplicateIds.length} doublon(s) vers ${kept?.full_name} (${kept?.email}) ?\n\n` +
      `Les FK seront transferees (applications, documents, screening, etc.) puis ${duplicateIds.length} row(s) supprimees.`
    )) return;

    startTransition(async () => {
      const r = await mergeCandidatesAction({ keeperId, duplicateIds });
      if (r.ok) {
        const tr = r.transferred ?? {};
        const summary = Object.entries(tr).filter(([, v]) => v && v > 0).map(([k, v]) => `${k}:${v}`).join(", ");
        toast.success(`✓ ${r.deleted} doublon(s) fusionne(s). FK transferes : ${summary || "aucun"}`);
        setMerged(true);
      } else {
        toast.error(r.error ?? "Erreur fusion");
      }
    });
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between">
        <div className="text-xs">
          <span className="font-semibold text-amber-900">{criterion}</span>
          <span className="text-amber-700 ml-2">→ {groupKey}</span>
          <span className="ml-2 text-amber-700">({candidates.length} rows)</span>
        </div>
        <button
          type="button"
          onClick={handleMerge}
          disabled={pending}
          className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 text-white text-xs font-semibold rounded hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Fusionner
        </button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-surface border-b border-line">
          <tr className="text-left">
            <th className="px-2 py-1 w-8">Keep</th>
            <th className="px-2 py-1">Nom / Email</th>
            <th className="px-2 py-1">Tel</th>
            <th className="px-2 py-1">Naissance</th>
            <th className="px-2 py-1">Ville</th>
            <th className="px-2 py-1">Source</th>
            <th className="px-2 py-1">Postule</th>
            <th className="px-2 py-1">CV</th>
            <th className="px-2 py-1">Profile</th>
            <th className="px-2 py-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => {
            const isKeeper = c.id === keeperId;
            const isRecommended = i === 0;
            return (
              <tr key={c.id} className={isKeeper ? "bg-emerald-50" : "hover:bg-surface"}>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="radio"
                    name={`keeper-${groupKey}`}
                    checked={isKeeper}
                    onChange={() => setKeeperId(c.id)}
                    className="cursor-pointer"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-semibold flex items-center gap-1">
                    {c.full_name ?? "?"}
                    {isRecommended && <span title="Keeper recommandé"><CheckCircle2 className="h-3 w-3 text-emerald-600" /></span>}
                  </div>
                  <div className="text-ink-3 text-[10px]">{c.email ?? "—"}</div>
                </td>
                <td className="px-2 py-1.5">{c.phone ?? "—"}</td>
                <td className="px-2 py-1.5">{c.birth_date ?? "—"}</td>
                <td className="px-2 py-1.5">
                  {c.city ?? "—"}
                  {c.postal_code && <span className="text-ink-3"> ({c.postal_code})</span>}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${c.source === "gravity_forms" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-700"}`}>
                    {c.source ?? "?"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-[10px] text-ink-3">
                  {c.applied_at ? new Date(c.applied_at).toLocaleDateString("fr-BE") : "—"}
                </td>
                <td className="px-2 py-1.5">{c.cv_url ? "✓" : "—"}</td>
                <td className="px-2 py-1.5">{c.profile_id ? "✓" : "—"}</td>
                <td className="px-2 py-1.5">
                  <a
                    href={`/rh/candidates/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
