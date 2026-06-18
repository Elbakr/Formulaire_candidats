"use client";

// Karim 2026-06-18 : édition des entités (coordonnées, adresse, signature) +
// affectation des sites à leur entité. Tout en auto-save.

import { useCallback, useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldAutosave } from "@/hooks/use-field-autosave";
import { autosaveEmployerOrgAction, assignSiteToOrgAction } from "./actions";

type Org = {
  key: string;
  name: string;
  signature_label: string;
  address: string | null;
  locality: string | null;
  bce: string | null;
  onss: string | null;
  rc: string | null;
  representative: string | null;
  co_representative: string | null;
  co_representative_email: string | null;
  paritary_commission: string | null;
  email: string | null;
  phone: string | null;
};
type Site = { id: string; code: string; name: string; city: string | null; employer_org_key: string | null };

const FIELDS: { key: keyof Org; label: string }[] = [
  { key: "name", label: "Raison sociale" },
  { key: "signature_label", label: "Libellé de signature (sortant)" },
  { key: "representative", label: "Représentant" },
  { key: "co_representative", label: "Co-représentant" },
  { key: "co_representative_email", label: "Email co-représentant" },
  { key: "address", label: "Adresse" },
  { key: "locality", label: "Localité (CP + ville)" },
  { key: "bce", label: "N° BCE" },
  { key: "onss", label: "N° ONSS" },
  { key: "rc", label: "RC / Tribunal" },
  { key: "paritary_commission", label: "Commission paritaire" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
];

function OrgCard({ org }: { org: Org }) {
  const save = useCallback(
    (key: string, value: string) => autosaveEmployerOrgAction(org.key, { [key]: value }),
    [org.key],
  );
  const { autosave, savingKey, savedKeys } = useFieldAutosave(save);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <Building2 className="h-4 w-4 text-gold-dark" />
        {org.name}
        <code className="text-[10px] text-ink-3 font-normal">{org.key}</code>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`${org.key}-${f.key}`} className="text-[11px] flex items-center gap-1">
              {f.label}
              {savingKey === f.key ? (
                <span className="text-[10px] text-ink-3 ml-auto">…</span>
              ) : savedKeys.has(f.key) ? (
                <span className="text-[10px] font-semibold text-success ml-auto">✓</span>
              ) : null}
            </Label>
            <Input
              id={`${org.key}-${f.key}`}
              defaultValue={(org[f.key] as string | null) ?? ""}
              onBlur={(e) => void autosave(f.key as string, e.currentTarget.value)}
              className="mt-0.5 text-sm"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function SiteAssign({ sites, orgs }: { sites: Site[]; orgs: Org[] }) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState<Record<string, string>>(
    Object.fromEntries(sites.map((s) => [s.id, s.employer_org_key ?? ""])),
  );

  function assign(siteId: string, orgKey: string) {
    setLocal((m) => ({ ...m, [siteId]: orgKey }));
    start(async () => {
      const r = await assignSiteToOrgAction(siteId, orgKey || null);
      if (!r.ok) toast.error(r.error ?? "Échec");
      else toast.success("Site rattaché.");
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-bold text-ink">Affectation des sites aux entités</div>
      <div className="divide-y divide-line">
        {sites.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1.5">
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded bg-surface-2 px-1 text-[11px] font-bold">
              {s.code}
            </span>
            <span className="flex-1 text-sm truncate">
              {s.name}
              {s.city ? <span className="text-ink-3"> · {s.city}</span> : null}
            </span>
            <select
              value={local[s.id] ?? ""}
              onChange={(e) => assign(s.id, e.target.value)}
              disabled={pending}
              className="text-sm rounded-md border border-line bg-surface px-2 py-1"
            >
              <option value="">— aucune —</option>
              {orgs.map((o) => (
                <option key={o.key} value={o.key}>{o.signature_label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function EntitiesEditor({ orgs, sites }: { orgs: Org[]; sites: Site[] }) {
  return (
    <div className="space-y-4">
      {orgs.map((o) => (
        <OrgCard key={o.key} org={o} />
      ))}
      <SiteAssign sites={sites} orgs={orgs} />
    </div>
  );
}
