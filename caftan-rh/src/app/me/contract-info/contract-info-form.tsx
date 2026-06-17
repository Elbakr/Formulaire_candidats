"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveContractInfoAction } from "./actions";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";
import { nissPrefixFromIso, isoMinusYears } from "@/lib/be-validators";
import { TRANSPORT_MODES } from "@/lib/config";

type Missing = { key: string; label: string };

const FIELD_META: Record<string, { type: string; placeholder?: string; inputMode?: string }> = {
  full_name: { type: "text" },
  email: { type: "email" },
  phone: { type: "tel", placeholder: "+32 4XX XX XX XX" },
  birth_date: { type: "date" },
  nrn: { type: "text", placeholder: "AA.MM.JJ-XXX.CC", inputMode: "numeric" },
  address: { type: "text", placeholder: "Rue + numéro" },
  postal_code: { type: "text", placeholder: "1000", inputMode: "numeric" },
  city: { type: "text", placeholder: "Bruxelles" },
  iban: { type: "text", placeholder: "BE XX XXXX XXXX XXXX" },
  bic: { type: "text", placeholder: "GEBABEBB" },
};

// Champs à choix (rendus en <select> plutôt qu'en saisie libre).
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  transport_type: [
    { value: "", label: "— choisir —" },
    ...TRANSPORT_MODES.map((m) => ({ value: m, label: m })),
  ],
  transport_frequency: [
    { value: "", label: "— choisir —" },
    { value: "mensuel", label: "Abonnement mensuel" },
    { value: "annuel", label: "Abonnement annuel" },
    { value: "sans_objet", label: "Sans abonnement" },
  ],
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

  // Karim 2026-06-15 : ce formulaire « dossier RH » applique désormais la même
  // logique que la candidature : date de naissance ≥ 17 ans, NISS pré-rempli
  // (AAMMJJ) depuis la date de naissance, et commune auto-détectée depuis le code
  // postal. Helpers partagés (@/lib/be-validators, @/lib/be-postal).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of missing) init[f.key] = defaults[f.key] ?? "";
    return init;
  });
  const editedRef = useRef<Set<string>>(new Set());
  const [cityAuto, setCityAuto] = useState(false);
  const maxBirth = useMemo(() => isoMinusYears(17), []);

  const hasNrn = missing.some((f) => f.key === "nrn");
  const hasCity = missing.some((f) => f.key === "city");
  const effectiveBirth = values.birth_date || defaults.birth_date || "";

  // 1) NISS : pré-remplit le préfixe AAMMJJ dès que la date de naissance est connue.
  useEffect(() => {
    if (!hasNrn || editedRef.current.has("nrn")) return;
    const prefix = nissPrefixFromIso(effectiveBirth);
    if (!prefix) return;
    setValues((v) => {
      const cur = v.nrn ?? "";
      return cur === "" || cur.length <= 6 ? { ...v, nrn: prefix } : v;
    });
  }, [effectiveBirth, hasNrn]);

  // 2) Code postal -> commune : table locale instantanée + API publique.
  useEffect(() => {
    if (!hasCity) return;
    const code = (values.postal_code ?? "").trim();
    if (!isBePostalCode(code) || editedRef.current.has("city")) return;
    const local = localBeCity(code);
    if (local) {
      setValues((v) => ({ ...v, city: local }));
      setCityAuto(true);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const c = await lookupBeCity(code);
      if (cancelled || !c || editedRef.current.has("city")) return;
      setValues((v) => ({ ...v, city: c }));
      setCityAuto(true);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [values.postal_code, hasCity]);

  function setField(key: string, val: string) {
    editedRef.current.add(key);
    if (key === "city") setCityAuto(false);
    setValues((v) => ({ ...v, [key]: val }));
  }

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
        const isCity = f.key === "city";
        const options = SELECT_OPTIONS[f.key];
        // Karim 2026-06-17 : rouge tant que vide, VERT dès que rempli correctement.
        const filled = (values[f.key] ?? "").trim() !== "";
        const boxCls = filled
          ? "border-2 border-emerald-400 bg-emerald-50 rounded p-2"
          : "border-2 border-rose-400 bg-rose-50 rounded p-2";
        return (
          <div key={f.key} className={boxCls}>
            <Label htmlFor={f.key} className={`font-semibold flex items-center gap-1 ${filled ? "text-emerald-900" : "text-rose-900"}`}>
              <span className={filled ? "text-emerald-600" : "text-rose-600"}>●</span> {f.label}
              {isCity && cityAuto ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success">
                  <Sparkles className="h-3 w-3" /> auto
                </span>
              ) : null}
              <span className={`text-[10px] ml-auto ${filled ? "text-emerald-600" : "text-rose-600"}`}>
                {filled ? "✓ Rempli" : "Requis pour contrat"}
              </span>
            </Label>
            {options ? (
              <select
                id={f.key}
                name={f.key}
                value={values[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className={`w-full bg-white mt-1 rounded-md border px-3 py-2 text-sm ${filled ? "border-emerald-300" : "border-rose-300"}`}
                required
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === ""}>{o.label}</option>
                ))}
              </select>
            ) : (
              <Input
                id={f.key}
                name={f.key}
                value={values[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                type={meta.type}
                placeholder={meta.placeholder}
                inputMode={meta.inputMode as React.HTMLAttributes<HTMLInputElement>["inputMode"]}
                max={f.key === "birth_date" ? maxBirth : undefined}
                className={`bg-white mt-1 ${filled ? "border-emerald-300" : "border-rose-300"}`}
                required
              />
            )}
            {f.key === "nrn" ? (
              <p className="text-[10px] text-ink-3 mt-1">
                Pré-rempli avec ta date de naissance (AAMMJJ) — complète les chiffres restants.
              </p>
            ) : null}
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
