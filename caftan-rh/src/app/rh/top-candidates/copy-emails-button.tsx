"use client";

import { useState } from "react";
import { Mail, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  const valid = emails.filter(Boolean);
  if (valid.length === 0) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(valid.join(", "));
      setCopied(true);
      toast.success(`${valid.length} email(s) copié(s) dans le presse-papier`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier — utilise le bouton Mailto à la place");
    }
  };

  // Mailto en BCC. Beaucoup de clients limitent à ~50 destinataires, on
  // affiche un warning au-dela.
  const mailtoUrl = `mailto:?bcc=${encodeURIComponent(valid.join(","))}`;
  const tooMany = valid.length > 50;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-line hover:bg-surface-2 text-xs font-bold"
        title={`Copier les ${valid.length} emails (séparés par virgule)`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        Copier emails ({valid.length})
      </button>
      <a
        href={mailtoUrl}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gold text-[#1a1a0d] hover:bg-gold-dark text-xs font-bold"
        title={
          tooMany
            ? `${valid.length} destinataires — beaucoup de clients limitent à 50. Préfère "Copier emails" + coller dans Gmail.`
            : `Ouvrir un nouveau mail BCC avec les ${valid.length} candidats`
        }
      >
        <Mail className="h-3.5 w-3.5" />
        Mail BCC <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
