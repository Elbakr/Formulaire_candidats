"use client";

// Karim 2026-07-03 : génère un lien de pré-embauche pour un candidat pré-validé
// (hors formulaire). Le candidat remplit lui-même son statut + infos. Copier / envoyer.

import { useState, useTransition } from "react";
import { UserPlus, Loader2, Copy, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createPrevalidatedCandidateAction, sendPrevalidatedLinkAction } from "./prevalidated-actions";

export function PrevalidatedLinkButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Karim 2026-07-05 : mémorise l'adresse à laquelle le lien a déjà été envoyé,
  // pour que le bouton « Envoyer » bascule en « Lien envoyé ✓ — renvoyer ».
  const [sentTo, setSentTo] = useState<string | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setLink(null);
    setCandidateId(null);
    setCopied(false);
    setSentTo(null);
  }

  function generate() {
    start(async () => {
      const r = await createPrevalidatedCandidateAction({ fullName, email });
      if (r.ok && r.link) {
        setLink(r.link);
        setCandidateId(r.candidateId ?? null);
        toast.success("Lien généré");
      } else toast.error(r.error ?? "Échec de la création");
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible — sélectionne le lien manuellement");
    }
  }

  function sendMail() {
    if (!candidateId || !email.trim()) {
      toast.error("Renseigne un email pour l'envoyer");
      return;
    }
    start(async () => {
      const r = await sendPrevalidatedLinkAction({ candidateId, email: email.trim() });
      if (r.ok) {
        setSentTo(r.sentTo ?? email.trim());
        toast.success(`Lien envoyé à ${r.sentTo}`);
      } else toast.error(r.error ?? "Échec de l'envoi");
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>
        <UserPlus className="h-3.5 w-3.5" /> Candidat pré-validé
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Candidat pré-validé — lien de pré-embauche</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-ink-3">
              Crée un lien dynamique où le candidat renseigne lui-même son statut
              (étudiant / non-étudiant) et ses infos secrétariat social, à son rythme.
            </p>
            <div>
              <Label>Nom (optionnel)</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nom du candidat" disabled={!!link} />
            </div>
            <div>
              <Label>Email (optionnel — pour l&apos;envoyer)</Label>
              <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSentTo(null); }} placeholder="candidat@email.com" />
            </div>

            {!link ? (
              <Button variant="gold" onClick={generate} disabled={pending} className="w-full">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Générer le lien
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border border-line bg-surface-2 p-2 text-[11px] break-all font-mono">{link}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copy} className="flex-1">
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} Copier
                  </Button>
                  <Button
                    variant={sentTo ? "outline" : "gold"}
                    size="sm"
                    onClick={sendMail}
                    disabled={pending || !email.trim()}
                    className={`flex-1 ${sentTo ? "border-success text-success hover:bg-success-light" : ""}`}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : sentTo ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sentTo ? "Lien envoyé — renvoyer" : "Envoyer"}
                  </Button>
                </div>
                {sentTo ? (
                  <p className="text-[11px] text-success font-semibold flex items-center gap-1">
                    <Check className="h-3 w-3" /> Lien envoyé à {sentTo}. Tu peux le renvoyer si besoin.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
