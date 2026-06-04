"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveContractInfoAction } from "./actions";

type Missing = { key: string; label: string };

const FIELD_META: Record<string, { type: string; placeholder?: string; inputMode?: string; pattern?: string }> = {
  full_name: { type: "text" },
  email: { type: "email" },
  phone: { type: "tel", placeholder: "+32 4XX XX XX XX" },
  birth_date: { type: "date" },
  nrn: { type: "text", placeholder: "XX.XX.XX-XXX.XX", inputMode: "numeric" },
  address: { type: "text", placeholder: "Rue + numéro" },
  postal_code: { type: "text", placeholder: "1000", inputMode: "numeric" },
  city: { type: "text" },
  iban: { type: "text", placeholder: "BE XX XXXX XXXX XXXX" },
  bic: { type: "text", placeholder: "GEBABEBB" },
};

export function ContractInfoForm({
  missing,
  defaults,
}: {
  employeeId: string;
  missing: Missing[];
  defaults: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveContractInfoAction(fd);
          if (r.error) toast.error(r.error);
          else if (r.completed) {
            toast.success("🎉 Dossier complet ! Le RH va recevoir une notification pour finaliser ton contrat.");
            router.refresh();
          } else {
            toast.success("Infos enregistrées");
            router.refresh();
          }
        })
      }
      className="space-y-3"
    >
      {missing.map((f) => {
        const meta = FIELD_META[f.key] ?? { type: "text" };
        return (
          <div key={f.key} className="border-2 border-rose-400 bg-rose-50 rounded p-2">
            <Label htmlFor={f.key} className="text-rose-900 font-semibold flex items-center gap-1">
              <span className="text-rose-600">●</span> {f.label}
              <span className="text-[10px] text-rose-600 ml-auto">Requis pour contrat</span>
            </Label>
            <Input
              id={f.key}
              name={f.key}
              defaultValue={defaults[f.key] ?? ""}
              type={meta.type}
              placeholder={meta.placeholder}
              inputMode={meta.inputMode as React.HTMLAttributes<HTMLInputElement>["inputMode"]}
              pattern={meta.pattern}
              className="bg-white border-rose-300 mt-1"
              required
            />
          </div>
        );
      })}

      <Button type="submit" variant="gold" size="lg" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : `Enregistrer ${missing.length} info${missing.length > 1 ? "s" : ""}`}
      </Button>

      <p className="text-[10px] text-ink-3 text-center">
        Dès enregistrement, RH est notifié et ton contrat peut être généré.
      </p>
    </form>
  );
}
