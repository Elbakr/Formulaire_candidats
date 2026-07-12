"use client";

import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, Loader2, Save, X, BookOpen, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveModuleAction,
  addModuleAction,
  deleteModuleAction,
  moveModuleAction,
  type ExamQuestion,
} from "./actions";

export type ModuleRow = {
  id: string;
  seq: number;
  kind: string;
  category: string | null;
  title_fr: string;
  title_nl: string | null;
  body_fr: string;
  body_nl: string | null;
  exam_level: number | null;
  questions: ExamQuestion[] | null;
  is_active: boolean;
};

export function TrainingManager({ initial }: { initial: ModuleRow[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<ModuleRow | null>(null);

  function refresh() {
    // Les server actions revalident la page ; on recharge pour refléter l'ordre.
    window.location.reload();
  }

  function move(id: string, dir: "up" | "down") {
    start(async () => {
      const r = await moveModuleAction(id, dir);
      if (r.ok) refresh();
      else toast.error(r.error ?? "Échec");
    });
  }
  function del(id: string) {
    if (!confirm("Supprimer ce module ? La numérotation se réajuste automatiquement.")) return;
    start(async () => {
      const r = await deleteModuleAction(id);
      if (r.ok) refresh();
      else toast.error(r.error ?? "Échec");
    });
  }
  function add(kind: "lesson" | "exam", afterId: string | null) {
    start(async () => {
      const r = await addModuleAction(kind, afterId);
      if (r.ok) refresh();
      else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => add("lesson", null)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une section
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => add("exam", null)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un examen
        </Button>
      </div>

      {initial.map((m, i) => (
        <Card key={m.id} className={`p-3 ${m.is_active ? "" : "opacity-60"}`}>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-ink text-canvas text-xs font-bold shrink-0">
              {m.seq}
            </span>
            {m.kind === "exam" ? <HelpCircle className="h-4 w-4 text-gold-dark shrink-0" /> : <BookOpen className="h-4 w-4 text-ink-3 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{m.title_fr}</div>
              <div className="text-[11px] text-ink-3 truncate">
                {m.kind === "exam" ? `Examen niv. ${m.exam_level ?? "?"} · ${m.questions?.length ?? 0} questions` : m.category}
                {m.title_nl ? " · NL ✓" : " · NL manquant"}
                {m.is_active ? "" : " · INACTIF"}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" disabled={pending || i === 0} onClick={() => move(m.id, "up")} className="p-1 disabled:opacity-30 hover:bg-surface-2 rounded" title="Monter">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" disabled={pending || i === initial.length - 1} onClick={() => move(m.id, "down")} className="p-1 disabled:opacity-30 hover:bg-surface-2 rounded" title="Descendre">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setEditing(m)} className="p-1 hover:bg-surface-2 rounded text-gold-dark" title="Éditer">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" disabled={pending} onClick={() => del(m.id)} className="p-1 hover:bg-danger-light rounded text-danger" title="Supprimer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      ))}

      {editing ? <EditDialog module={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </div>
  );
}

function EditDialog({ module: m, onClose, onSaved }: { module: ModuleRow; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [titleFr, setTitleFr] = useState(m.title_fr);
  const [titleNl, setTitleNl] = useState(m.title_nl ?? "");
  const [bodyFr, setBodyFr] = useState(m.body_fr);
  const [bodyNl, setBodyNl] = useState(m.body_nl ?? "");
  const [category, setCategory] = useState(m.category ?? "");
  const [examLevel, setExamLevel] = useState(m.exam_level ?? 1);
  const [active, setActive] = useState(m.is_active);
  const [questions, setQuestions] = useState<ExamQuestion[]>(m.questions ?? []);
  const isExam = m.kind === "exam";

  function save() {
    start(async () => {
      const r = await saveModuleAction({
        id: m.id,
        category: category || null,
        title_fr: titleFr,
        title_nl: titleNl || null,
        body_fr: bodyFr,
        body_nl: bodyNl || null,
        exam_level: isExam ? examLevel : null,
        is_active: active,
        questions: isExam ? questions : null,
      });
      if (r.ok) {
        toast.success("Module enregistré.");
        onSaved();
      } else toast.error(r.error ?? "Échec");
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-start justify-center p-4 overflow-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Module {m.seq} — {isExam ? "Examen" : "Section"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-2 rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          {!isExam ? (
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Catégorie</label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Niveau (crescendo)</label>
              <Input type="number" min={1} value={examLevel} onChange={(e) => setExamLevel(Number(e.target.value) || 1)} className="max-w-[100px]" />
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Titre (FR)</label>
              <Input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Titre (NL)</label>
              <Input value={titleNl} onChange={(e) => setTitleNl(e.target.value)} placeholder="Néerlandais…" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Contenu (FR)</label>
              <textarea value={bodyFr} onChange={(e) => setBodyFr(e.target.value)} rows={10} className="w-full rounded-lg border border-line text-sm p-2 outline-none focus:border-gold font-mono" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-2">Contenu (NL)</label>
              <textarea value={bodyNl} onChange={(e) => setBodyNl(e.target.value)} rows={10} className="w-full rounded-lg border border-line text-sm p-2 outline-none focus:border-gold font-mono" placeholder="Néerlandais…" />
            </div>
          </div>

          {isExam ? <QuestionsEditor questions={questions} setQuestions={setQuestions} /> : null}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            Actif (envoyé aux travailleurs)
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button>
            <Button variant="gold" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionsEditor({ questions, setQuestions }: { questions: ExamQuestion[]; setQuestions: (q: ExamQuestion[]) => void }) {
  const upd = (i: number, patch: Partial<ExamQuestion>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const addQ = () => setQuestions([...questions, { q_fr: "", q_nl: null, choices_fr: ["", "", ""], choices_nl: null, correct: 0 }]);
  const delQ = (i: number) => setQuestions(questions.filter((_, j) => j !== i));

  return (
    <div className="border border-line rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold">Questions ({questions.length})</span>
        <Button size="sm" variant="outline" onClick={addQ}><Plus className="h-3.5 w-3.5 mr-1" /> Question</Button>
      </div>
      {questions.map((q, i) => (
        <div key={i} className="rounded-lg bg-surface-2/50 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-ink-3">Q{i + 1}</span>
            <button onClick={() => delQ(i)} className="text-danger p-0.5"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <Input value={q.q_fr} onChange={(e) => upd(i, { q_fr: e.target.value })} placeholder="Question (FR)" />
          <Input value={q.q_nl ?? ""} onChange={(e) => upd(i, { q_nl: e.target.value || null })} placeholder="Question (NL)" />
          {q.choices_fr.map((ch, ci) => (
            <div key={ci} className="flex items-center gap-2">
              <input type="radio" name={`correct-${i}`} checked={q.correct === ci} onChange={() => upd(i, { correct: ci })} title="Bonne réponse" />
              <Input value={ch} onChange={(e) => upd(i, { choices_fr: q.choices_fr.map((c, k) => (k === ci ? e.target.value : c)) })} placeholder={`Réponse ${ci + 1} (FR)`} className="flex-1" />
              <Input value={q.choices_nl?.[ci] ?? ""} onChange={(e) => { const arr = [...(q.choices_nl ?? q.choices_fr.map(() => ""))]; arr[ci] = e.target.value; upd(i, { choices_nl: arr }); }} placeholder="(NL)" className="flex-1" />
            </div>
          ))}
          <button onClick={() => upd(i, { choices_fr: [...q.choices_fr, ""] })} className="text-[11px] text-gold-dark">+ réponse</button>
        </div>
      ))}
    </div>
  );
}
