import Link from "next/link";
import { ArrowLeft, Sliders } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import {
  AUTOPLANER_RULES,
  CATEGORY_LABELS,
  type AutoplanerRuleCategory,
} from "@/lib/autoplaner-rules";
import { loadAutoplanerRulesAction } from "./actions";
import { RuleToggle } from "./rule-toggle";
import { ResetButton } from "./reset-button";

export const dynamic = "force-dynamic";

export default async function AutoplanerRulesPage() {
  await requireRole(["admin", "rh"]);
  const rules = await loadAutoplanerRulesAction();

  const grouped = new Map<AutoplanerRuleCategory, typeof AUTOPLANER_RULES>();
  for (const r of AUTOPLANER_RULES) {
    const arr = grouped.get(r.category) ?? [];
    arr.push(r);
    grouped.set(r.category, arr);
  }

  const order: AutoplanerRuleCategory[] = [
    "generation",
    "multipliers",
    "priority",
    "multi_site",
    "overtime",
    "validation",
    "constraints",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link
            href="/admin/settings"
            className="text-xs text-ink-3 hover:text-gold-dark inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Paramètres
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Sliders className="h-5 w-5" />
            Règles de l'autoplaner
          </h1>
          <p className="text-sm text-ink-2 max-w-3xl">
            Toutes les règles que le générateur applique automatiquement.
            Désactive ce qui n'a pas de sens pour ton contexte. Les règles
            marquées <span className="font-bold text-ink-3">documentation</span>
            {" "}sont actives par défaut mais le toggle n'est pas encore branché
            sur le code — il est listé pour la transparence et sera respecté
            à mesure que le code est plumbé.
          </p>
        </div>
        <ResetButton />
      </div>

      {order.map((cat) => {
        const list = grouped.get(cat);
        if (!list || list.length === 0) return null;
        return (
          <Card key={cat}>
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 bg-surface-2">
              {CATEGORY_LABELS[cat]} ({list.length})
            </div>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex items-start gap-3"
                >
                  <RuleToggle
                    ruleId={r.id}
                    initialEnabled={rules[r.id]}
                    wired={r.wired}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-sm">{r.label}</div>
                      {!r.wired ? (
                        <span
                          title="Le toggle est listé pour la transparence mais le code reste hardcodé. À plumber dans un prochain commit."
                          className="text-[9px] uppercase tracking-wider font-bold bg-surface-2 text-ink-3 px-1.5 py-0.5 rounded"
                        >
                          documentation
                        </span>
                      ) : (
                        <span
                          title="Le toggle agit réellement sur le code du solver."
                          className="text-[9px] uppercase tracking-wider font-bold bg-success-light text-success px-1.5 py-0.5 rounded"
                        >
                          plumbed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-2 mt-0.5">
                      {r.description}
                    </div>
                    <div className="text-[10px] text-ink-3 mt-1 font-mono">
                      id : {r.id} · défaut :{" "}
                      {r.defaultEnabled ? "activé" : "désactivé"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
