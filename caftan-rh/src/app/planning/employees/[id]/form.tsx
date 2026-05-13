"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { saveEmployeeAdminAction } from "../actions-admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  validateNRN,
  formatNRN,
  validateBelgianIBAN,
  formatIBAN,
  validateBelgianPhone,
  formatBelgianPhone,
  validateBelgianPostcode,
  regionFromPostcode,
  type ValidationResult,
} from "@/lib/be-validators";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Employee = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department_id: string | null;
  manager_id: string | null;
  contract_type: string | null;
  weekly_hours: number | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  trial_end_date: string | null;
  annual_hours_budget: number | null;
  status: string;
  // admin
  cin_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_holder: string | null;
  transport_type: string | null;
  transport_price: string | null;
  nrn: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  notes_admin: string | null;
  // planning
  fixed_off_days: number[] | null;
  preferred_site_ids: string[] | null;
  unavailable_site_ids: string[] | null;
  default_start_time: string | null;
  default_pause_minutes: number | null;
  default_shift_hours: number | null;
  wd_mode: string | null;
  week_cycle: number | null;
  week_phase: number | null;
  planning_notes: string | null;
  ot_eligible: boolean | null;
};

export function EmployeeAdminForm({
  employee,
  departments,
  managers,
  sites,
}: {
  employee: Employee;
  departments: { id: string; name: string }[];
  managers: { id: string; full_name: string | null }[];
  sites: { id: string; code: string; name: string; color: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fixedOff, setFixedOff] = useState<number[]>(employee.fixed_off_days ?? []);
  const [preferredSites, setPreferredSites] = useState<Set<string>>(
    new Set(employee.preferred_site_ids ?? []),
  );
  const [unavailSites, setUnavailSites] = useState<Set<string>>(
    new Set(employee.unavailable_site_ids ?? []),
  );

  function toggleDay(idx: number) {
    setFixedOff((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  }

  function toggleSite(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  }

  return (
    <form
      action={(fd) => {
        fd.set("fixed_off_days", JSON.stringify(fixedOff));
        fd.set("preferred_site_ids", JSON.stringify(Array.from(preferredSites)));
        fd.set("unavailable_site_ids", JSON.stringify(Array.from(unavailSites)));
        startTransition(async () => {
          const r = await saveEmployeeAdminAction(employee.id, fd);
          if (r?.error) toast.error(r.error);
          else {
            toast.success("Profil mis à jour.");
            router.refresh();
          }
        });
      }}
      className="space-y-6"
    >
      <Section title="👤 Identité & contrat">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nom complet" name="full_name" defaultValue={employee.full_name} />
          <Field label="Email" name="email" defaultValue={employee.email} type="email" />
          <ValidatedField
            label="Téléphone"
            name="phone"
            defaultValue={employee.phone ?? ""}
            placeholder="+32 4XX XX XX XX"
            validator={validateBelgianPhone}
            formatter={formatBelgianPhone}
          />
          <Field label="Poste" name="job_title" defaultValue={employee.job_title ?? ""} />
          <div>
            <Label>Service</Label>
            <Select name="department_id" defaultValue={employee.department_id ?? "none"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Manager</Label>
            <Select name="manager_id" defaultValue={employee.manager_id ?? "none"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "—"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Field label="Contrat" name="contract_type" defaultValue={employee.contract_type ?? "CDI"} />
          <Field label="Statut" name="status" defaultValue={employee.status} />
          <Field label="Heures/semaine" name="weekly_hours" defaultValue={String(employee.weekly_hours ?? 38)} type="number" />
          <Field label="Taux horaire (€)" name="hourly_rate" defaultValue={employee.hourly_rate != null ? String(employee.hourly_rate) : ""} type="number" />
          <Field label="Date d'entrée" name="start_date" defaultValue={employee.start_date ?? ""} type="date" />
          <Field label="Date de sortie" name="end_date" defaultValue={employee.end_date ?? ""} type="date" />
          <Field label="Fin période d'essai" name="trial_end_date" defaultValue={employee.trial_end_date ?? ""} type="date" />
          <Field label="Quota annuel (étudiant — heures)" name="annual_hours_budget" defaultValue={employee.annual_hours_budget != null ? String(employee.annual_hours_budget) : ""} type="number" />
        </div>
      </Section>

      <Section title="🪪 Identification">
        <div className="grid md:grid-cols-3 gap-3">
          <ValidatedField
            label="NRN"
            name="nrn"
            defaultValue={employee.nrn ?? ""}
            placeholder="XX.XX.XX-XXX.XX"
            validator={validateNRN}
            formatter={formatNRN}
          />
          <Field label="N° carte d'identité" name="cin_number" defaultValue={employee.cin_number ?? ""} />
          <Field label="Adresse" name="address" defaultValue={employee.address ?? ""} />
          <ValidatedField
            label="Code postal"
            name="postal_code"
            defaultValue={employee.postal_code ?? ""}
            placeholder="1000-9999"
            validator={validateBelgianPostcode}
            hint={(v) => regionFromPostcode(v)}
          />
          <Field label="Ville" name="city" defaultValue={employee.city ?? ""} />
        </div>
      </Section>

      <Section title="💳 Banque & transport">
        <div className="grid md:grid-cols-3 gap-3">
          <ValidatedField
            label="IBAN"
            name="iban"
            defaultValue={employee.iban ?? ""}
            placeholder="BE68 5390 0754 7034"
            validator={validateBelgianIBAN}
            formatter={formatIBAN}
          />
          <Field label="BIC" name="bic" defaultValue={employee.bic ?? ""} />
          <Field label="Titulaire compte" name="bank_holder" defaultValue={employee.bank_holder ?? ""} />
          <Field label="Type transport" name="transport_type" defaultValue={employee.transport_type ?? ""} />
          <Field label="Prix transport" name="transport_price" defaultValue={employee.transport_price ?? ""} placeholder="ex. 52€/mois" />
        </div>
      </Section>

      <Section title="📅 Contraintes planning (pour génération auto)">
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded border border-line bg-surface-2/40">
            <input
              type="checkbox"
              id="ot_eligible"
              name="ot_eligible"
              defaultChecked={!!employee.ot_eligible}
              className="h-4 w-4"
            />
            <Label htmlFor="ot_eligible" className="flex-1 cursor-pointer">
              <span className="font-bold text-sm">🔥 Éligible aux heures supplémentaires</span>
              <span className="block text-[11px] text-ink-3 font-normal">
                Coche uniquement les employés volontaires, autonomes, capables d'absorber des h. sup.
                Seuls les éligibles apparaissent dans le sélecteur OT case-par-case.
              </span>
            </Label>
          </div>
          <div>
            <Label>Jours toujours OFF</Label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "px-3 py-1.5 rounded-md border-2 text-xs font-bold transition",
                    fixedOff.includes(i)
                      ? "bg-violet text-white border-violet"
                      : "bg-surface border-line text-ink-3 hover:border-violet",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Sites préférés (magasins)</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {sites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSite(preferredSites, setPreferredSites, s.id)}
                    title={s.name}
                    className={cn(
                      "px-2.5 py-1 rounded-md border-2 text-[11px] font-semibold transition inline-flex items-center gap-1.5",
                      preferredSites.has(s.id)
                        ? "bg-success-light border-success text-success"
                        : "bg-surface border-line text-ink-3 hover:border-success",
                    )}
                  >
                    <span
                      className="inline-flex items-center justify-center px-1 rounded text-white font-bold text-[9px]"
                      style={{ backgroundColor: s.color ?? "#666" }}
                    >
                      {s.code}
                    </span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Sites indisponibles (magasins)</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {sites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSite(unavailSites, setUnavailSites, s.id)}
                    title={s.name}
                    className={cn(
                      "px-2.5 py-1 rounded-md border-2 text-[11px] font-semibold transition inline-flex items-center gap-1.5",
                      unavailSites.has(s.id)
                        ? "bg-danger-light border-danger text-danger"
                        : "bg-surface border-line text-ink-3 hover:border-danger",
                    )}
                  >
                    <span
                      className="inline-flex items-center justify-center px-1 rounded text-white font-bold text-[9px]"
                      style={{ backgroundColor: s.color ?? "#666" }}
                    >
                      {s.code}
                    </span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Heure début par défaut" name="default_start_time" defaultValue={employee.default_start_time ?? "10:00"} type="time" />
            <Field label="Pause (min)" name="default_pause_minutes" defaultValue={String(employee.default_pause_minutes ?? 30)} type="number" />
            <Field label="Durée shift par défaut (h)" name="default_shift_hours" defaultValue={String(employee.default_shift_hours ?? 8)} type="number" />
            <div>
              <Label>Mode jours travaillés</Label>
              <Select name="wd_mode" defaultValue={employee.wd_mode ?? "auto"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (selon heures)</SelectItem>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} jours</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Cycle (semaines)" name="week_cycle" defaultValue={String(employee.week_cycle ?? 1)} type="number" />
            <Field label="Phase cycle" name="week_phase" defaultValue={String(employee.week_phase ?? 0)} type="number" />
          </div>

          <div>
            <Label htmlFor="planning_notes">Notes planning</Label>
            <Textarea id="planning_notes" name="planning_notes" rows={2} defaultValue={employee.planning_notes ?? ""} placeholder="Particularités à connaître pour la planification…" />
          </div>
        </div>
      </Section>

      <Section title="🗒 Notes admin (privées)">
        <Textarea name="notes_admin" rows={3} defaultValue={employee.notes_admin ?? ""} />
      </Section>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" size="lg" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le profil"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label, name, defaultValue = "", type = "text", placeholder,
}: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} type={type} placeholder={placeholder} />
    </div>
  );
}

function ValidatedField({
  label, name, defaultValue = "", placeholder,
  validator, formatter,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  validator: (s: string) => ValidationResult;
  formatter?: (s: string) => string;
  hint?: (s: string) => string | null;
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean>(false);

  function handleBlur() {
    if (!value) {
      setError(null);
      setOk(false);
      return;
    }
    const r = validator(value);
    if (r.valid) {
      setError(null);
      setOk(true);
      if (r.formatted) setValue(r.formatted);
    } else {
      setError(r.error ?? "Format invalide.");
      setOk(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(formatter ? formatter(v) : v);
    if (error) setError(null);
  }

  const hintText = hint ? hint(value) : null;

  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          error ? "border-danger focus-visible:ring-danger" : "",
          ok ? "border-success" : "",
        )}
      />
      {error ? (
        <p className="text-[11px] text-danger mt-0.5">{error}</p>
      ) : hintText ? (
        <p className="text-[11px] text-ink-3 mt-0.5">{hintText}</p>
      ) : null}
    </div>
  );
}
