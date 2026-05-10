"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateContractAction } from "../../contract-actions";

export type ContractEditable = {
  id: string;
  full_name: string;
  birth_date: string | null;
  birth_place: string | null;
  nrn: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contract_kind: string;
  start_date: string;
  end_date: string | null;
  weekly_hours: number;
  monthly_hours: number | null;
  position_title: string;
  workplace: string;
  workplace_address: string | null;
  trial_period_weeks: number | null;
  gross_hourly_rate: number | null;
  gross_monthly_salary: number | null;
  meal_voucher_eur_per_day: number | null;
  transport_allowance: string | null;
  joint_committee: string | null;
  paid_holidays_days: number | null;
  weekly_rest_day: string | null;
  notes: string | null;
};

const KINDS = ["CDI", "CDD", "Étudiant", "Intérim", "Freelance"] as const;

export function ContractForm({ contract }: { contract: ContractEditable }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updateContractAction(contract.id, fd);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Contrat mis à jour.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 print:hidden">
      <Section title="Identité du travailleur">
        <Field label="Nom complet" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={contract.full_name} required />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date de naissance" htmlFor="birth_date">
            <Input
              type="date"
              id="birth_date"
              name="birth_date"
              defaultValue={contract.birth_date ?? ""}
            />
          </Field>
          <Field label="Lieu de naissance" htmlFor="birth_place">
            <Input
              id="birth_place"
              name="birth_place"
              defaultValue={contract.birth_place ?? ""}
            />
          </Field>
        </div>
        <Field label="Numéro national (NRN)" htmlFor="nrn">
          <Input
            id="nrn"
            name="nrn"
            defaultValue={contract.nrn ?? ""}
            placeholder="XX.XX.XX-XXX.XX"
          />
        </Field>
        <Field label="Adresse" htmlFor="address">
          <Input
            id="address"
            name="address"
            defaultValue={contract.address ?? ""}
            placeholder="Rue + numéro"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Code postal" htmlFor="postal_code">
            <Input
              id="postal_code"
              name="postal_code"
              defaultValue={contract.postal_code ?? ""}
            />
          </Field>
          <Field label="Ville" htmlFor="city">
            <Input id="city" name="city" defaultValue={contract.city ?? ""} />
          </Field>
        </div>
      </Section>

      <Section title="Contrat">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type de contrat" htmlFor="contract_kind">
            <select
              id="contract_kind"
              name="contract_kind"
              defaultValue={contract.contract_kind}
              className="flex h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Période d'essai (semaines)" htmlFor="trial_period_weeks">
            <Input
              type="number"
              min={0}
              max={52}
              id="trial_period_weeks"
              name="trial_period_weeks"
              defaultValue={contract.trial_period_weeks ?? ""}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date de début" htmlFor="start_date">
            <Input
              type="date"
              id="start_date"
              name="start_date"
              defaultValue={contract.start_date}
              required
            />
          </Field>
          <Field label="Date de fin (CDD uniquement)" htmlFor="end_date">
            <Input
              type="date"
              id="end_date"
              name="end_date"
              defaultValue={contract.end_date ?? ""}
            />
          </Field>
        </div>
        <Field label="Fonction" htmlFor="position_title">
          <Input
            id="position_title"
            name="position_title"
            defaultValue={contract.position_title}
            required
          />
        </Field>
        <Field label="Lieu de travail" htmlFor="workplace">
          <Input id="workplace" name="workplace" defaultValue={contract.workplace} required />
        </Field>
        <Field label="Adresse du lieu de travail" htmlFor="workplace_address">
          <Input
            id="workplace_address"
            name="workplace_address"
            defaultValue={contract.workplace_address ?? ""}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Heures hebdomadaires" htmlFor="weekly_hours">
            <Input
              type="number"
              step="0.5"
              min={1}
              max={48}
              id="weekly_hours"
              name="weekly_hours"
              defaultValue={contract.weekly_hours}
              required
            />
          </Field>
          <Field label="Heures mensuelles" htmlFor="monthly_hours">
            <Input
              type="number"
              step="0.5"
              id="monthly_hours"
              name="monthly_hours"
              defaultValue={contract.monthly_hours ?? ""}
            />
          </Field>
        </div>
      </Section>

      <Section title="Rémunération">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Taux horaire brut (€)" htmlFor="gross_hourly_rate">
            <Input
              type="number"
              step="0.01"
              id="gross_hourly_rate"
              name="gross_hourly_rate"
              defaultValue={contract.gross_hourly_rate ?? ""}
            />
          </Field>
          <Field label="Salaire mensuel brut (€)" htmlFor="gross_monthly_salary">
            <Input
              type="number"
              step="0.01"
              id="gross_monthly_salary"
              name="gross_monthly_salary"
              defaultValue={contract.gross_monthly_salary ?? ""}
            />
          </Field>
        </div>
        <Field label="Chèques-repas (€/jour)" htmlFor="meal_voucher_eur_per_day">
          <Input
            type="number"
            step="0.01"
            id="meal_voucher_eur_per_day"
            name="meal_voucher_eur_per_day"
            defaultValue={contract.meal_voucher_eur_per_day ?? 0}
          />
        </Field>
        <Field label="Indemnité transport" htmlFor="transport_allowance">
          <Input
            id="transport_allowance"
            name="transport_allowance"
            defaultValue={contract.transport_allowance ?? ""}
            placeholder="ex. abonnement STIB pris en charge à 100%"
          />
        </Field>
      </Section>

      <Section title="Légal Belgique">
        <Field label="Commission paritaire" htmlFor="joint_committee">
          <Input
            id="joint_committee"
            name="joint_committee"
            defaultValue={contract.joint_committee ?? "CP 201 Commerce de détail indépendant"}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Jours de congés payés / an" htmlFor="paid_holidays_days">
            <Input
              type="number"
              min={0}
              max={40}
              id="paid_holidays_days"
              name="paid_holidays_days"
              defaultValue={contract.paid_holidays_days ?? 20}
            />
          </Field>
          <Field label="Jour de repos hebdo" htmlFor="weekly_rest_day">
            <Input
              id="weekly_rest_day"
              name="weekly_rest_day"
              defaultValue={contract.weekly_rest_day ?? "dimanche"}
            />
          </Field>
        </div>
      </Section>

      <Section title="Notes">
        <Field label="Clauses particulières / commentaires" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={contract.notes ?? ""}
            placeholder="Clauses spécifiques à ajouter à l'article 10 (optionnel)"
            rows={3}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" variant="gold" disabled={pending}>
          <Save className="h-3.5 w-3.5" /> Enregistrer le brouillon
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border border-line rounded-[var(--radius)] p-4">
      <legend className="text-[11px] font-bold tracking-[0.06em] uppercase text-ink-2 px-1">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
