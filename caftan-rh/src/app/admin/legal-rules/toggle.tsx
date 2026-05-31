"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setLegalRuleEnabledAction } from "./actions";

export function LegalRuleToggle({ ruleId, enabled, slug }: { ruleId: string; enabled: boolean; slug: string }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          if (!next && !confirm(`Vraiment désactiver "${slug}" ? Cette règle légale ne sera plus appliquée.`)) {
            return;
          }
          setOn(next);
          startTransition(async () => {
            const res = await setLegalRuleEnabledAction(ruleId, next);
            if (!res.ok) {
              toast.error(res.error ?? "Erreur");
              setOn(!next);
            } else {
              toast.success(next ? "Règle activée" : "Règle désactivée");
            }
          });
        }}
        className="sr-only peer"
      />
      <div className="w-9 h-5 bg-gray-300 peer-checked:bg-green-600 rounded-full relative transition-colors">
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${on ? "translate-x-4" : ""}`} />
      </div>
      <span className="text-xs font-medium">{on ? "Actif" : "Désactivé"}</span>
    </label>
  );
}
