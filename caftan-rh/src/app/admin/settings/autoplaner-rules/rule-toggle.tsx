"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAutoplanerRuleAction } from "./actions";

export function RuleToggle({
  ruleId,
  initialEnabled,
  wired,
}: {
  ruleId: string;
  initialEnabled: boolean;
  wired: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const r = await updateAutoplanerRuleAction(ruleId, next);
      if (r.error) {
        toast.error(r.error);
        setEnabled(!next); // revert
        return;
      }
      toast.success(
        wired
          ? `Règle ${next ? "activée" : "désactivée"} (effet immédiat)`
          : `Règle ${next ? "activée" : "désactivée"} (note : pas encore plumbé)`,
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={pending}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        enabled ? "bg-success" : "bg-ink-3/30"
      } ${pending ? "opacity-50" : ""}`}
      title={enabled ? "Cliquer pour désactiver" : "Cliquer pour activer"}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
