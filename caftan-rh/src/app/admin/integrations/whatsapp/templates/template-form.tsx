"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  upsertWhatsAppTemplateAction,
  deleteWhatsAppTemplateAction,
} from "./actions";

export type TemplateFormInitial = {
  id?: string;
  slug?: string;
  language_code?: string;
  category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body?: string;
  twilio_content_sid?: string | null;
  status?: "draft" | "pending" | "approved" | "rejected";
  is_active?: boolean;
  notes?: string | null;
};

export function WhatsAppTemplateForm({
  initial,
  onDone,
}: {
  initial?: TemplateFormInitial;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(initial?.body ?? "");
  const isEdit = !!initial?.id;

  const variableCount = (body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length;

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (initial?.id) fd.set("id", initial.id);
          const r = await upsertWhatsAppTemplateAction(fd);
          if (r.error) toast.error(r.error);
          else {
            toast.success(isEdit ? "Template mis à jour." : "Template créé.");
            onDone?.();
          }
        })
      }
      className="space-y-3"
    >
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tpl_slug">Slug</Label>
          <Input
            id="tpl_slug"
            name="slug"
            defaultValue={initial?.slug ?? ""}
            placeholder="interview_invite_v1"
            className="font-mono"
            required
            disabled={isEdit}
          />
          <p className="text-[11px] text-ink-3 mt-1">
            Identifiant unique. <strong>Doit correspondre exactement</strong> au slug Meta.
          </p>
        </div>
        <div>
          <Label htmlFor="tpl_lang">Langue</Label>
          <Input
            id="tpl_lang"
            name="language_code"
            defaultValue={initial?.language_code ?? "fr"}
            placeholder="fr"
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="tpl_cat">Catégorie</Label>
          <select
            id="tpl_cat"
            name="category"
            defaultValue={initial?.category ?? "UTILITY"}
            className="w-full h-10 rounded-md border border-line bg-canvas px-3 text-sm"
          >
            <option value="UTILITY">UTILITY (notif candidat)</option>
            <option value="MARKETING">MARKETING</option>
            <option value="AUTHENTICATION">AUTHENTICATION</option>
          </select>
          <p className="text-[11px] text-ink-3 mt-1">
            Pour les notifs candidat (entretien, doc) → toujours UTILITY.
          </p>
        </div>
        <div>
          <Label htmlFor="tpl_status">Statut</Label>
          <select
            id="tpl_status"
            name="status"
            defaultValue={initial?.status ?? "draft"}
            className="w-full h-10 rounded-md border border-line bg-canvas px-3 text-sm"
          >
            <option value="draft">draft</option>
            <option value="pending">pending (soumis Meta)</option>
            <option value="approved">approved (validé Meta)</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="tpl_body">Corps du template</Label>
        <Textarea
          id="tpl_body"
          name="body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bonjour {{1}}, votre entretien est confirmé pour le {{2}} à {{3}}."
          maxLength={1024}
          required
        />
        <p className="text-[11px] text-ink-3 mt-1">
          Variables détectées : <strong>{variableCount}</strong> · {body.length}/1024 caractères.
          Ce texte doit être <em>identique</em> à celui que tu fais valider par Meta.
        </p>
      </div>

      <div>
        <Label htmlFor="tpl_csid">Twilio Content SID</Label>
        <Input
          id="tpl_csid"
          name="twilio_content_sid"
          defaultValue={initial?.twilio_content_sid ?? ""}
          placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="font-mono"
        />
        <p className="text-[11px] text-ink-3 mt-1">
          À remplir <strong>après</strong> approval Meta — visible dans Twilio Console → Content Editor.
        </p>
      </div>

      <div>
        <Label htmlFor="tpl_notes">Notes internes (optionnel)</Label>
        <Textarea
          id="tpl_notes"
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ""}
          placeholder="Quand l'utiliser, contexte, exemples…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={initial?.is_active ?? true}
          className="rounded border-line h-4 w-4"
        />
        Template actif
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Créer le template"}
        </Button>
        {isEdit && initial?.id ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!confirm("Supprimer ce template ? Cette action est définitive.")) return;
              startTransition(async () => {
                const r = await deleteWhatsAppTemplateAction(initial.id!);
                if (r.error) toast.error(r.error);
                else {
                  toast.success("Template supprimé.");
                  onDone?.();
                }
              });
            }}
          >
            Supprimer
          </Button>
        ) : null}
      </div>
    </form>
  );
}
