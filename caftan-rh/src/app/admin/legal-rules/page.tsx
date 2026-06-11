// Karim 2026-05-30 : page de gestion des regles legales activables/desactivables.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, AlertTriangle, Ban, Wand2 } from "lucide-react";
import { LegalRuleToggle } from "./toggle";

export const dynamic = "force-dynamic";

interface LegalRule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  enabled: boolean;
  legal_ref: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  duree_travail: "Durée de travail",
  type_contrat: "Type de contrat",
  paiement: "Paiement",
  paye: "Paie",
  embauche: "Embauche",
  identite: "Identité",
  general: "Général",
};

const SEVERITY_ICONS: Record<string, { icon: typeof AlertTriangle; color: string; label: string }> = {
  warn: { icon: AlertTriangle, color: "text-amber-600", label: "Warning" },
  block: { icon: Ban, color: "text-red-600", label: "Bloque" },
  auto_fix: { icon: Wand2, color: "text-blue-600", label: "Auto-corrige" },
};

export default async function LegalRulesPage() {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const { data } = await admin.from("legal_rules").select("*").order("category").order("name");
  const rules = (data ?? []) as LegalRule[];

  // Group by category
  const byCategory = new Map<string, LegalRule[]>();
  for (const r of rules) {
    const cat = r.category || "general";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scale className="w-7 h-7" />
          Règles légales
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Garde-fous légaux belges appliqués automatiquement (CP 201, Loi 1978, ONSS étudiant, etc.).
          Toutes peuvent être désactivées ponctuellement si tu sais ce que tu fais.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-md p-3 text-xs flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          Désactiver une règle = lever une protection légale. À ne faire qu'en cas exceptionnel
          (contrat hors normes, exception explicite) et à réactiver dès que possible.
        </div>
      </div>

      {Array.from(byCategory.entries()).map(([cat, items]) => (
        <Card key={cat} className="p-0 overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold">{CATEGORY_LABELS[cat] ?? cat}</h2>
            <div className="text-xs text-muted-foreground mt-0.5">{items.length} règle{items.length > 1 ? "s" : ""}</div>
          </div>
          <div className="divide-y">
            {items.map((r) => {
              const sev = SEVERITY_ICONS[r.severity] ?? SEVERITY_ICONS.warn;
              const SevIcon = sev.icon;
              return (
                <div key={r.id} className="p-4 flex items-start gap-3">
                  <SevIcon className={`w-4 h-4 mt-1 flex-shrink-0 ${sev.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.name}</span>
                      <Badge variant="muted" className="text-[10px]">{sev.label}</Badge>
                      {r.legal_ref && <span className="text-[10px] text-muted-foreground">📖 {r.legal_ref}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">slug: {r.slug}</p>
                  </div>
                  <LegalRuleToggle ruleId={r.id} enabled={r.enabled} slug={r.slug} />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
