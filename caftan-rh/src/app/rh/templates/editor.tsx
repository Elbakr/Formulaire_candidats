"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplateAction } from "../email/actions";
import { toast } from "sonner";

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
  category: string;
};

export function TemplatesEditor({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeSlug, setActiveSlug] = useState<string>(templates[0]?.slug ?? "");
  const [previewing, setPreviewing] = useState(false);

  const t = templates.find((x) => x.slug === activeSlug);
  const [label, setLabel] = useState(t?.label ?? "");
  const [subject, setSubject] = useState(t?.subject ?? "");
  const [body, setBody] = useState(t?.body_html ?? "");

  function selectTemplate(slug: string) {
    const next = templates.find((x) => x.slug === slug);
    setActiveSlug(slug);
    setLabel(next?.label ?? "");
    setSubject(next?.subject ?? "");
    setBody(next?.body_html ?? "");
    setPreviewing(false);
  }

  function save() {
    if (!t) return;
    const fd = new FormData();
    fd.set("slug", t.slug);
    fd.set("label", label);
    fd.set("subject", subject);
    fd.set("body_html", body);
    startTransition(async () => {
      const r = await saveTemplateAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Template enregistré.");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid md:grid-cols-[260px_1fr]">
      <aside className="border-r border-line">
        <ul className="divide-y divide-line">
          {templates.map((tt) => (
            <li key={tt.slug}>
              <button
                onClick={() => selectTemplate(tt.slug)}
                className={`w-full text-left p-3 hover:bg-surface-2 transition-colors ${
                  tt.slug === activeSlug ? "bg-gold-light text-gold-dark font-bold" : ""
                }`}
              >
                <div className="text-sm">{tt.label}</div>
                <div className="text-[10px] text-ink-3 mt-0.5 font-mono">{tt.slug}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="p-5">
        {!t ? (
          <p className="text-sm text-ink-3">Choisis un template à gauche.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="label">Label (interne)</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="subject">Sujet</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="font-mono text-xs" />
            </div>
            <div>
              <Label htmlFor="body">Corps HTML</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="font-mono text-[11px]" />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewing(!previewing)}>
                <Eye className="h-3.5 w-3.5" /> {previewing ? "Masquer aperçu" : "Aperçu rendu"}
              </Button>
              <Button type="button" variant="gold" disabled={pending} onClick={save}>
                <Save className="h-4 w-4" /> {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
            {previewing ? (
              <div className="rounded-md border border-line bg-surface-2 p-3 max-h-[400px] overflow-y-auto">
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 mb-2">Aperçu (variables non remplacées)</div>
                <div className="text-sm font-bold mb-2">{subject}</div>
                <div dangerouslySetInnerHTML={{ __html: body }} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
