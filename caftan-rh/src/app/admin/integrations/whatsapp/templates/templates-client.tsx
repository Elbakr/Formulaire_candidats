"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WhatsAppTemplateForm, type TemplateFormInitial } from "./template-form";

type TemplateRow = {
  id: string;
  slug: string;
  language_code: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body: string;
  variables_count: number;
  twilio_content_sid: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_BADGE: Record<TemplateRow["status"], string> = {
  draft: "bg-surface-2 text-ink-2",
  pending: "bg-warn-light text-warn",
  approved: "bg-success-light text-success",
  rejected: "bg-danger-light text-danger",
};

export function TemplatesClient({ templates }: { templates: TemplateRow[] }) {
  const [editing, setEditing] = useState<TemplateFormInitial | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-bold">Templates WhatsApp ({templates.length})</h2>
        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          Nouveau template
        </Button>
      </div>

      {creating ? (
        <Card>
          <div className="p-4 space-y-3">
            <h3 className="font-bold text-base">Nouveau template</h3>
            <WhatsAppTemplateForm
              onDone={() => {
                setCreating(false);
              }}
            />
          </div>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <div className="p-4 space-y-3">
            <h3 className="font-bold text-base">Édition — {editing.slug}</h3>
            <WhatsAppTemplateForm
              initial={editing}
              onDone={() => setEditing(null)}
            />
          </div>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-ink-3 text-center">
            Aucun template. Crée ton premier template (catégorie UTILITY pour les
            notifications candidats).
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="font-mono font-bold text-sm">{t.slug}</code>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      STATUS_BADGE[t.status]
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-info-light text-info">
                    {t.category}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-ink-2">
                    {t.language_code}
                  </span>
                  {t.is_active ? null : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-ink-3">
                      inactif
                    </span>
                  )}
                  <span className="ml-auto text-xs text-ink-3">
                    {t.variables_count} variable(s)
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed bg-surface-2 rounded-md p-2 font-mono">
                  {t.body}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-ink-3">
                  {t.twilio_content_sid ? (
                    <code className="font-mono">SID: {t.twilio_content_sid}</code>
                  ) : (
                    <span className="text-warn">Pas de Content SID — soumets ce template à Meta puis colle le SID.</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      setCreating(false);
                      setEditing({
                        id: t.id,
                        slug: t.slug,
                        language_code: t.language_code,
                        category: t.category,
                        body: t.body,
                        twilio_content_sid: t.twilio_content_sid,
                        status: t.status,
                        is_active: t.is_active,
                        notes: t.notes,
                      });
                    }}
                  >
                    Éditer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
