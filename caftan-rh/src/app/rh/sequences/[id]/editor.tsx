"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, ChevronDown, ChevronUp, Mail, BellRing, FileText, Hourglass, ArrowRightCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { STATUS_LABELS } from "@/components/ui/badge";
import {
  updateSequenceAction,
  deleteSequenceAction,
  addStepAction,
  updateStepAction,
  deleteStepAction,
} from "../actions";
import { toast } from "sonner";

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  trigger_status: string | null;
  is_active: boolean;
};

type Step = {
  id: string;
  position: number;
  kind: "email" | "notification" | "note" | "wait" | "set_status";
  delay_days: number | null;
  email_template_slug: string | null;
  email_subject_override: string | null;
  email_custom_message: string | null;
  notification_target: string | null;
  notification_title: string | null;
  notification_body: string | null;
  note_body: string | null;
  set_status_to: string | null;
};

type Template = { slug: string; label: string };

const STATUSES = ["new", "contacted", "rdv_scheduled", "rdv_done", "wait_decision", "hired", "refused"] as const;

const KIND_ICONS: Record<Step["kind"], React.ComponentType<{ className?: string }>> = {
  email: Mail,
  notification: BellRing,
  note: FileText,
  wait: Hourglass,
  set_status: ArrowRightCircle,
};

const KIND_LABELS: Record<Step["kind"], string> = {
  email: "Email",
  notification: "Notification",
  note: "Note interne",
  wait: "Attendre",
  set_status: "Changer statut",
};

export function SequenceEditor({
  sequence,
  steps,
  templates,
}: {
  sequence: Sequence;
  steps: Step[];
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(sequence.name);
  const [description, setDescription] = useState(sequence.description ?? "");
  const [trigger, setTrigger] = useState<string>(sequence.trigger_status ?? "manual");

  function saveSequence() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("trigger_status", trigger);
    start(async () => {
      const r = await updateSequenceAction(sequence.id, fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Séquence enregistrée.");
        router.refresh();
      }
    });
  }

  function destroySequence() {
    if (!confirm("Supprimer cette séquence ? Les exécutions en cours seront supprimées.")) return;
    start(async () => {
      const r = await deleteSequenceAction(sequence.id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Séquence supprimée.");
        router.push("/rh/sequences");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Paramètres</h2>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label htmlFor="seq-name">Nom *</Label>
            <Input id="seq-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="seq-desc">Description</Label>
            <Textarea
              id="seq-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Statut déclencheur</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Aucun (déclenchement manuel)</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="p-3 border-t border-line flex justify-end gap-2">
          <Button variant="danger" size="sm" disabled={pending} onClick={destroySequence}>
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </Button>
          <Button variant="gold" size="sm" disabled={pending} onClick={saveSequence}>
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="font-bold text-sm">Étapes ({steps.length})</h2>
          <AddStepButton sequenceId={sequence.id} templates={templates} nextPos={steps.length + 1} />
        </div>
        {steps.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">
            Aucune étape. Ajoute la première pour rendre cette séquence active.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {steps.map((s) => (
              <StepRow key={s.id} step={s} templates={templates} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AddStepButton({
  sequenceId,
  templates,
}: {
  sequenceId: string;
  templates: Template[];
  nextPos: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<Step["kind"]>("email");
  const [delay, setDelay] = useState<number>(0);
  const [tmplSlug, setTmplSlug] = useState<string>(templates[0]?.slug ?? "");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [target, setTarget] = useState<string>("rh");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [statusTo, setStatusTo] = useState<string>("contacted");

  function submit() {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("delay_days", String(delay));
    fd.set("email_template_slug", tmplSlug);
    fd.set("email_subject_override", subjectOverride);
    fd.set("email_custom_message", customMessage);
    fd.set("notification_target", target);
    fd.set("notification_title", notifTitle);
    fd.set("notification_body", notifBody);
    fd.set("note_body", noteBody);
    fd.set("set_status_to", statusTo);
    start(async () => {
      const r = await addStepAction(sequenceId, fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Étape ajoutée.");
        setOpen(false);
        setKind("email");
        setDelay(0);
        setSubjectOverride("");
        setCustomMessage("");
        setNotifTitle("");
        setNotifBody("");
        setNoteBody("");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="gold">
          <Plus className="h-3.5 w-3.5" /> Ajouter étape
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle étape</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Step["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email (template)</SelectItem>
                  <SelectItem value="notification">Notification interne</SelectItem>
                  <SelectItem value="note">Ajouter une note</SelectItem>
                  <SelectItem value="wait">Attendre</SelectItem>
                  <SelectItem value="set_status">Changer le statut</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Délai (jours)</Label>
              <Input
                type="number"
                min={0}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {kind === "email" ? (
            <>
              <div>
                <Label>Template</Label>
                <Select value={tmplSlug} onValueChange={setTmplSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sujet personnalisé (optionnel)</Label>
                <Input value={subjectOverride} onChange={(e) => setSubjectOverride(e.target.value)} />
              </div>
              <div>
                <Label>Message custom</Label>
                <Textarea
                  rows={3}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {kind === "notification" ? (
            <>
              <div>
                <Label>Destinataire</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rh">Tous les RH/admin</SelectItem>
                    <SelectItem value="manager">Manager assigné</SelectItem>
                    <SelectItem value="candidate">Candidat (compte associé)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Titre</Label>
                <Input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea rows={2} value={notifBody} onChange={(e) => setNotifBody(e.target.value)} />
              </div>
            </>
          ) : null}

          {kind === "note" ? (
            <div>
              <Label>Texte de la note</Label>
              <Textarea rows={3} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            </div>
          ) : null}

          {kind === "set_status" ? (
            <div>
              <Label>Nouveau statut</Label>
              <Select value={statusTo} onValueChange={setStatusTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button variant="gold" disabled={pending} onClick={submit}>
            {pending ? "..." : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({ step, templates }: { step: Step; templates: Template[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Step["kind"]>(step.kind);
  const [delay, setDelay] = useState<number>(step.delay_days ?? 0);
  const [tmplSlug, setTmplSlug] = useState<string>(step.email_template_slug ?? templates[0]?.slug ?? "");
  const [subjectOverride, setSubjectOverride] = useState(step.email_subject_override ?? "");
  const [customMessage, setCustomMessage] = useState(step.email_custom_message ?? "");
  const [target, setTarget] = useState(step.notification_target ?? "rh");
  const [notifTitle, setNotifTitle] = useState(step.notification_title ?? "");
  const [notifBody, setNotifBody] = useState(step.notification_body ?? "");
  const [noteBody, setNoteBody] = useState(step.note_body ?? "");
  const [statusTo, setStatusTo] = useState(step.set_status_to ?? "contacted");

  const Icon = KIND_ICONS[step.kind];

  function save() {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("delay_days", String(delay));
    fd.set("email_template_slug", tmplSlug);
    fd.set("email_subject_override", subjectOverride);
    fd.set("email_custom_message", customMessage);
    fd.set("notification_target", target);
    fd.set("notification_title", notifTitle);
    fd.set("notification_body", notifBody);
    fd.set("note_body", noteBody);
    fd.set("set_status_to", statusTo);
    start(async () => {
      const r = await updateStepAction(step.id, fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Étape enregistrée.");
        router.refresh();
      }
    });
  }

  function destroy() {
    if (!confirm("Supprimer cette étape ?")) return;
    start(async () => {
      const r = await deleteStepAction(step.id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Étape supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span className="font-mono text-xs text-ink-3 w-6">#{step.position}</span>
        <Icon className="h-4 w-4 text-gold-dark" />
        <span className="flex-1 min-w-0">
          <span className="font-bold text-sm">{KIND_LABELS[step.kind]}</span>
          <span className="text-xs text-ink-3 ml-2">
            {step.delay_days && step.delay_days > 0 ? `+${step.delay_days}j` : "immédiat"}
            {summarizeStep(step)}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="p-4 bg-surface-2 border-t border-line space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Type d'étape</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Step["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email (template)</SelectItem>
                  <SelectItem value="notification">Notification interne</SelectItem>
                  <SelectItem value="note">Ajouter une note</SelectItem>
                  <SelectItem value="wait">Attendre</SelectItem>
                  <SelectItem value="set_status">Changer le statut</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`d-${step.id}`}>Délai (jours)</Label>
              <Input
                id={`d-${step.id}`}
                type="number"
                min={0}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value) || 0)}
              />
              <p className="text-[11px] text-ink-3 mt-1">Nombre de jours après le démarrage de la séquence.</p>
            </div>
          </div>

          {kind === "email" ? (
            <div className="space-y-3">
              <div>
                <Label>Template</Label>
                <Select value={tmplSlug} onValueChange={setTmplSlug}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`subj-${step.id}`}>Sujet personnalisé (optionnel)</Label>
                <Input
                  id={`subj-${step.id}`}
                  value={subjectOverride}
                  onChange={(e) => setSubjectOverride(e.target.value)}
                  placeholder="Laisser vide pour utiliser le sujet du template"
                />
              </div>
              <div>
                <Label htmlFor={`cust-${step.id}`}>Message custom (variable {"{{custom}}"})</Label>
                <Textarea
                  id={`cust-${step.id}`}
                  rows={3}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-ink-3">
                Note : la séquence enregistre l'email comme message sortant dans l'historique du candidat. L'envoi réel se fait manuellement via la fiche candidat (EmailJS).
              </p>
            </div>
          ) : null}

          {kind === "notification" ? (
            <div className="space-y-3">
              <div>
                <Label>Destinataire</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rh">Tous les RH/admin</SelectItem>
                    <SelectItem value="manager">Manager assigné</SelectItem>
                    <SelectItem value="candidate">Candidat (compte associé)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`nt-${step.id}`}>Titre</Label>
                <Input
                  id={`nt-${step.id}`}
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`nb-${step.id}`}>Message</Label>
                <Textarea
                  id={`nb-${step.id}`}
                  rows={2}
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {kind === "note" ? (
            <div>
              <Label htmlFor={`note-${step.id}`}>Texte de la note</Label>
              <Textarea
                id={`note-${step.id}`}
                rows={3}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Variables disponibles : {{firstname}}, {{fullname}}, {{org_name}}…"
              />
            </div>
          ) : null}

          {kind === "wait" ? (
            <p className="text-sm text-ink-3">
              Cette étape ne fait qu'attendre {delay} jour{delay > 1 ? "s" : ""}. Utile pour espacer visuellement deux actions.
            </p>
          ) : null}

          {kind === "set_status" ? (
            <div>
              <Label>Nouveau statut</Label>
              <Select value={statusTo} onValueChange={setStatusTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="danger" size="sm" disabled={pending} onClick={destroy}>
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </Button>
            <Button variant="gold" size="sm" disabled={pending} onClick={save}>
              <Save className="h-3.5 w-3.5" /> Enregistrer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function summarizeStep(s: Step): string {
  switch (s.kind) {
    case "email":
      return ` · ${s.email_template_slug ?? "(aucun template)"}`;
    case "notification":
      return ` · ${s.notification_target ?? "rh"} : ${s.notification_title ?? ""}`;
    case "note":
      return s.note_body ? ` · "${s.note_body.slice(0, 40)}…"` : "";
    case "wait":
      return "";
    case "set_status":
      return ` · → ${s.set_status_to ?? "?"}`;
    default:
      return "";
  }
}
