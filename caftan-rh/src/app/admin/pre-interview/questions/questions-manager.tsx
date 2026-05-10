"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Save, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  upsertPreInterviewQuestionAction,
  deletePreInterviewQuestionAction,
  togglePreInterviewQuestionActiveAction,
} from "./actions";
import {
  POSITION_ROLE_OPTIONS,
  type PreInterviewQuestion,
  type PreInterviewQuestionKind,
} from "@/lib/pre-interview-types";

const KIND_OPTIONS: Array<{ value: PreInterviewQuestionKind; label: string }> = [
  { value: "text", label: "Texte libre" },
  { value: "single_choice", label: "Choix unique" },
  { value: "multi_choice", label: "Choix multiples" },
  { value: "scale_1_5", label: "Échelle 1–5" },
  { value: "video", label: "Vidéo (caméra)" },
];

export function QuestionsManager({
  initialQuestions,
}: {
  initialQuestions: PreInterviewQuestion[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PreInterviewQuestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    setEditing(null);
    setCreating(false);
  }

  function onToggle(id: string) {
    startTransition(async () => {
      const r = await togglePreInterviewQuestionActiveAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("Désactiver cette question ?")) return;
    startTransition(async () => {
      const r = await deletePreInterviewQuestionAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Question désactivée.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold">Questions ({initialQuestions.length})</h2>
        <Button variant="gold" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nouvelle question
        </Button>
      </div>

      {creating || editing ? (
        <QuestionForm
          question={editing}
          onClose={close}
          onSaved={() => {
            close();
            router.refresh();
          }}
        />
      ) : null}

      <ul className="divide-y divide-line border border-line rounded-md">
        {initialQuestions.length === 0 ? (
          <li className="p-6 text-center text-sm text-ink-3 italic">
            Aucune question. Cliquez sur « Nouvelle question » pour commencer.
          </li>
        ) : (
          initialQuestions.map((q) => (
            <li
              key={q.id}
              className={
                "p-3 sm:p-4 flex items-start gap-3 flex-wrap " +
                (q.is_active ? "" : "opacity-60")
              }
            >
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-semibold leading-relaxed">{q.prompt}</div>
                <div className="text-[11px] text-ink-3 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    <code className="font-mono bg-surface-2 px-1 rounded">{q.slug}</code>
                  </span>
                  <span>
                    Profil:{" "}
                    <b>
                      {POSITION_ROLE_OPTIONS.find((o) => o.value === q.position_role)?.label ??
                        q.position_role}
                    </b>
                  </span>
                  <span>Type: {KIND_OPTIONS.find((k) => k.value === q.kind)?.label ?? q.kind}</span>
                  <span>Tri: {q.sort_order}</span>
                  {q.is_required ? <span className="text-danger">obligatoire</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onToggle(q.id)}
                  disabled={pending}
                  title={q.is_active ? "Désactiver" : "Activer"}
                >
                  {q.is_active ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(q)}
                  disabled={pending}
                >
                  <Pencil className="h-3.5 w-3.5" /> Éditer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(q.id)}
                  disabled={pending}
                  title="Désactiver"
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function QuestionForm({
  question,
  onClose,
  onSaved,
}: {
  question: PreInterviewQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<PreInterviewQuestionKind>(question?.kind ?? "text");
  const [positionRole, setPositionRole] = useState<string>(question?.position_role ?? "all");

  return (
    <div className="bg-surface-2 rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-sm">
          {question ? "Éditer la question" : "Nouvelle question"}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
          Annuler
        </Button>
      </div>

      <form
        action={(fd) => {
          if (question) fd.set("id", question.id);
          fd.set("kind", kind);
          fd.set("position_role", positionRole);
          startTransition(async () => {
            const r = await upsertPreInterviewQuestionAction(fd);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Question enregistrée.");
            onSaved();
          });
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="prompt">Question *</Label>
          <Textarea
            id="prompt"
            name="prompt"
            rows={2}
            required
            defaultValue={question?.prompt ?? ""}
            placeholder="Pourquoi souhaitez-vous rejoindre Caftan Factory ?"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="slug">Slug (auto si vide)</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={question?.slug ?? ""}
              placeholder="motivation_caftan"
            />
          </div>
          <div>
            <Label>Profil de poste</Label>
            <Select value={positionRole} onValueChange={setPositionRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITION_ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as PreInterviewQuestionKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="language_code">Langue</Label>
            <Input
              id="language_code"
              name="language_code"
              defaultValue={question?.language_code ?? "fr"}
              maxLength={5}
            />
          </div>
        </div>

        {kind === "single_choice" || kind === "multi_choice" ? (
          <div>
            <Label htmlFor="choices">
              Options (une par ligne, format <code className="font-mono">value=Label</code> ou{" "}
              <code className="font-mono">Label</code>)
            </Label>
            <Textarea
              id="choices"
              name="choices"
              rows={4}
              defaultValue={
                question?.choices
                  ? question.choices.map((c) => `${c.value}=${c.label}`).join("\n")
                  : ""
              }
              placeholder={`oui=Oui, j'ai déjà travaillé en boutique\nnon=Non, jamais`}
              required
            />
          </div>
        ) : null}

        {kind === "text" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="min_chars">Longueur min</Label>
              <Input
                id="min_chars"
                name="min_chars"
                type="number"
                min={0}
                defaultValue={question?.min_chars ?? 0}
              />
            </div>
            <div>
              <Label htmlFor="max_chars">Longueur max</Label>
              <Input
                id="max_chars"
                name="max_chars"
                type="number"
                min={0}
                defaultValue={question?.max_chars ?? 2000}
              />
            </div>
          </div>
        ) : null}

        {kind === "video" ? (
          <div>
            <Label htmlFor="video_max_seconds">Durée max de la vidéo (secondes)</Label>
            <Input
              id="video_max_seconds"
              name="video_max_seconds"
              type="number"
              min={10}
              max={180}
              defaultValue={question?.video_max_seconds ?? 90}
            />
            <p className="text-[11px] text-ink-3 mt-1">
              Le candidat enregistre en 1 seule prise (pas de re-record). Vidéo
              stockée 30 jours après la décision RH puis purgée (RGPD).
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sort_order">Ordre</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              defaultValue={question?.sort_order ?? 100}
            />
          </div>
          <div className="flex items-end gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                name="is_required"
                defaultChecked={question?.is_required ?? true}
              />
              Obligatoire
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={question?.is_active ?? true}
              />
              Active
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" variant="gold" disabled={pending}>
            <Save className="h-4 w-4" /> {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
