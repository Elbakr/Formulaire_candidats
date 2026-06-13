"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { submitContractInfoAction } from "./actions";

type Field = { key: string; label: string };

function inputType(key: string): string {
  if (key === "birth_date") return "date";
  if (key === "email") return "email";
  return "text";
}
function placeholder(key: string): string {
  switch (key) {
    case "iban": return "BE.. .... .... ....";
    case "nrn": return "00.00.00-000.00";
    case "postal_code": return "1000";
    case "city": return "Bruxelles";
    case "address": return "Rue, numéro";
    default: return "";
  }
}

export function ContractInfoForm({ token, fields, firstName }: { token: string; fields: Field[]; firstName: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const filled = fields.filter((f) => (values[f.key] ?? "").trim());
    if (filled.length === 0) {
      setErr("Renseigne au moins une information.");
      return;
    }
    start(async () => {
      const r = await submitContractInfoAction(token, values);
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex h-14 w-14 rounded-full bg-success-light text-success items-center justify-center mb-3">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-ink">Merci {firstName} !</h2>
        <p className="text-sm text-ink-2 mt-1">
          Tes informations sont enregistrées. Ton dossier avance — l'équipe RH revient vers toi pour la suite.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-semibold text-ink-2 mb-1">{f.label}</label>
          <input
            type={inputType(f.key)}
            value={values[f.key] ?? ""}
            placeholder={placeholder(f.key)}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none"
          />
        </div>
      ))}

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Enregistrer mes informations
      </button>
    </div>
  );
}
