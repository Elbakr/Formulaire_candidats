"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  upsertConductItemAction,
  deleteConductItemAction,
  toggleConductItemAction,
  type ConductInput,
} from "./actions";

export type ConductItem = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  phase: string | null;
  severity: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-info-light text-info" },
  important: { label: "Important", className: "bg-warn-light text-warn" },
  critique: { label: "Critique", className: "bg-danger-light text-danger" },
};

type Draft = {
  id?: string;
  category: string;
  title: string;
  description: string;
  phase: string;
  severity: string;
  sort_order: string;
  is_active: boolean;
};

function toDraft(item?: ConductItem, defaultCategory = ""): Draft {
  return {
    id: item?.id,
    category: item?.category ?? defaultCategory,
    title: item?.title ?? "",
    description: item?.description ?? "",
    phase: item?.phase ?? "",
    severity: item?.severity ?? "important",
    sort_order: String(item?.sort_order ?? 0),
    is_active: item?.is_active ?? true,
  };
}

export function ConductManager({ items }: { items: ConductItem[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft());

  // Regroupe par catégorie en conservant l'ordre d'apparition (déjà trié serveur).
  const groups = useMemo(() => {
    const map = new Map<string, ConductItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return [...map.entries()];
  }, [items]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, "fr")),
    [items],
  );

  function openAdd(category = "") {
    // Pré-remplit sort_order = max de la catégorie + 1 si connue.
    let nextOrder = 0;
    if (category) {
      const inCat = items.filter((i) => i.category === category);
      nextOrder = inCat.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1;
    }
    setDraft({ ...toDraft(undefined, category), sort_order: String(nextOrder) });
    setOpen(true);
  }

  function openEdit(item: ConductItem) {
    setDraft(toDraft(item));
    setOpen(true);
  }

  function save() {
    if (!draft.category.trim()) return toast.error("La catégorie est requise.");
    if (!draft.title.trim()) return toast.error("L'intitulé est requis.");
    const input: ConductInput = {
      id: draft.id,
      category: draft.category,
      title: draft.title,
      description: draft.description || null,
      phase: draft.phase || null,
      severity: draft.severity,
      sort_order: parseInt(draft.sort_order, 10) || 0,
      is_active: draft.is_active,
    };
    start(async () => {
      const r = await upsertConductItemAction(input);
      if (r.ok) {
        toast.success(draft.id ? "Élément modifié." : "Élément ajouté.");
        setOpen(false);
      } else {
        toast.error(r.error ?? "Échec de l'enregistrement.");
      }
    });
  }

  function remove(item: ConductItem) {
    if (!confirm(`Supprimer « ${item.title} » ?`)) return;
    start(async () => {
      const r = await deleteConductItemAction(item.id);
      if (r.ok) toast.success("Élément supprimé.");
      else toast.error(r.error ?? "Échec de la suppression.");
    });
  }

  function toggle(item: ConductItem) {
    start(async () => {
      const r = await toggleConductItemAction(item.id, !item.is_active);
      if (r.ok) toast.success(item.is_active ? "Désactivé." : "Réactivé.");
      else toast.error(r.error ?? "Échec.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-3">
          {items.length} élément{items.length > 1 ? "s" : ""} · {groups.length} catégorie
          {groups.length > 1 ? "s" : ""}
        </p>
        <Button variant="gold" size="sm" onClick={() => openAdd()} disabled={pending}>
          <Plus className="h-4 w-4" /> Ajouter un élément
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-ink-3 text-sm">
          Aucun élément pour le moment. Clique sur « Ajouter un élément » pour commencer.
        </Card>
      ) : (
        groups.map(([category, rows]) => (
          <Card key={category} className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line bg-surface-2">
              <div className="font-bold text-sm">
                {category}{" "}
                <span className="text-ink-3 font-normal">({rows.length})</span>
              </div>
              <button
                onClick={() => openAdd(category)}
                className="text-xs text-gold-dark hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((item) => {
                const sev = SEVERITY_META[item.severity] ?? SEVERITY_META.important;
                return (
                  <li
                    key={item.id}
                    className={`p-3 flex items-start gap-3 ${item.is_active ? "" : "opacity-55"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{item.title}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold tracking-wide ${sev.className}`}>
                          {sev.label}
                        </span>
                        {item.phase ? <Badge variant="muted">{item.phase}</Badge> : null}
                        {!item.is_active ? <Badge variant="draft">Inactif</Badge> : null}
                      </div>
                      {item.description ? (
                        <p className="text-xs text-ink-2 mt-1 leading-relaxed">{item.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggle(item)}
                        disabled={pending}
                        title={item.is_active ? "Désactiver" : "Réactiver"}
                        className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        {item.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        disabled={pending}
                        title="Modifier"
                        className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(item)}
                        disabled={pending}
                        title="Supprimer"
                        className="p-1.5 rounded-md text-danger hover:bg-danger-light"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Modifier l'élément" : "Ajouter un élément"}</DialogTitle>
            <DialogDescription>
              Comportement attendu ou erreur de débutant à éviter. Tous les champs sont éditables.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-3">
            <label className="block text-xs font-medium text-ink-2">
              Catégorie *
              <Input
                list="rci-categories"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="ex. Pauses, Vente, Relations collègues…"
                className="mt-1"
              />
              <datalist id="rci-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label className="block text-xs font-medium text-ink-2">
              Intitulé *
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Intitulé court de la règle / erreur"
                className="mt-1"
              />
            </label>

            <label className="block text-xs font-medium text-ink-2">
              Description
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Explication : ce qu'on attend, pourquoi…"
                className="mt-1"
                rows={3}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block text-xs font-medium text-ink-2">
                Phase
                <select
                  value={draft.phase}
                  onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
                  className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-2 text-sm focus:border-gold outline-none"
                >
                  <option value="">— (aucune)</option>
                  <option value="Jour 1">Jour 1</option>
                  <option value="Jour 2">Jour 2</option>
                  <option value="Jour 3">Jour 3</option>
                  <option value="Jour 4">Jour 4</option>
                  <option value="Général">Général</option>
                </select>
              </label>

              <label className="block text-xs font-medium text-ink-2">
                Gravité
                <select
                  value={draft.severity}
                  onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
                  className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-2 text-sm focus:border-gold outline-none"
                >
                  <option value="info">Info</option>
                  <option value="important">Important</option>
                  <option value="critique">Critique</option>
                </select>
              </label>

              <label className="block text-xs font-medium text-ink-2">
                Ordre
                <Input
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                  className="mt-1"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="h-4 w-4 accent-gold"
              />
              Actif (visible dans le référentiel)
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="gold" size="sm" onClick={save} loading={pending}>
              {draft.id ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
