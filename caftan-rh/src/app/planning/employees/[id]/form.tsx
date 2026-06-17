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
import { TRANSPORT_MODES } from "@/lib/config";
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

// Karim 2026-06-17 : statut de soumission self-service par le travailleur.
// Vert « soumis à HH:MM » (heure de Bruxelles) si le travailleur a renseigné le
// champ via son lien/espace ; orange « non soumis par l'employé » sinon.
function SubmittedStatus({ subs, field }: { subs?: Record<string, string> | null; field: string }) {
  const iso = subs?.[field];
  if (iso) {
    const t = new Date(iso).toLocaleTimeString("fr-BE", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels",
    });
    return <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">✓ soumis à {t}</p>;
  }
  return <p className="text-[10px] font-semibold text-amber-600 mt-0.5">⚠ non soumis par l&apos;employé</p>;
}

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
  transport_frequency: string | null;
  worker_field_submissions?: Record<string, string> | null;
  nrn: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  notes_admin: string | null;
  // contrat / secrétariat social
  birth_date: string | null;
  birth_place: string | null;
  signature_place: string | null;
  work_time_kind: string | null;
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
  missingKeys = [],
}: {
  employee: Employee;
  departments: { id: string; name: string }[];
  managers: { id: string; full_name: string | null }[];
  sites: { id: string; code: string; name: string; color: string | null }[];
  // Karim 2026-06-04 : champs requis pour contrat NON remplis - surlignes en rouge
  missingKeys?: string[];
}) {
  const isMissing = (k: string) => missingKeys.includes(k);
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
          <Field label="Nom complet" name="full_name" defaultValue={employee.full_name} isMissing={isMissing("full_name")} />
          <Field label="Email" name="email" defaultValue={employee.email} type="email" isMissing={isMissing("email")} />
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
          {/* Karim 2026-05-30 : CONTRAT = UNIQUEMENT CDD ou Etudiant (politique no-CDI) */}
          <div>
            <Label>Contrat</Label>
            <Select name="contract_type" defaultValue={employee.contract_type === "Étudiant" || employee.contract_type === "Etudiant" ? "Étudiant" : "CDD"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CDD">CDD</SelectItem>
                <SelectItem value="Étudiant">Étudiant</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-ink-3 mt-0.5">CDI non disponible (politique CaftanRH)</p>
          </div>
          <Field label="Statut" name="status" defaultValue={employee.status} />
          <WorkTimeAndHours
            defaultKind={employee.work_time_kind}
            defaultHours={employee.weekly_hours}
            contractType={employee.contract_type}
          />
          <Field label="Taux horaire (€)" name="hourly_rate" defaultValue={employee.hourly_rate != null ? String(employee.hourly_rate) : ""} type="number" />
          <Field label="Date d'entrée" name="start_date" defaultValue={employee.start_date ?? ""} type="date" />
          <Field label="Date de sortie" name="end_date" defaultValue={employee.end_date ?? ""} type="date" />
          <Field label="Fin période d'essai" name="trial_end_date" defaultValue={employee.trial_end_date ?? ""} type="date" />
          <Field label="Quota annuel (étudiant — heures)" name="annual_hours_budget" defaultValue={employee.annual_hours_budget != null ? String(employee.annual_hours_budget) : ""} type="number" />
        </div>
      </Section>

      <Section title="🪪 Identification">
        <div className="grid md:grid-cols-3 gap-3">
          {/* Karim 2026-05-30 : date naissance EN PREMIER pour pre-remplir le NRN. */}
          <BirthDateAndNrn
            defaultBirthDate={employee.birth_date ?? ""}
            defaultNrn={employee.nrn ?? ""}
          />
          <Field label="N° carte d'identité" name="cin_number" defaultValue={employee.cin_number ?? ""} />
          <Field label="Lieu de naissance" name="birth_place" defaultValue={employee.birth_place ?? ""} placeholder="ex. Bruxelles" />
          <div>
            <Label>Lieu de signature</Label>
            <Select name="signature_place" defaultValue={employee.signature_place ?? "Bruxelles"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bruxelles">Bruxelles</SelectItem>
                <SelectItem value="Anvers">Anvers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Adresse" name="address" defaultValue={employee.address ?? ""} isMissing={isMissing("address")} />
          <div className={isMissing("postal_code") ? "border-2 border-rose-400 bg-rose-50 rounded p-1.5 -m-1.5" : ""}>
            <ValidatedField
              label={isMissing("postal_code") ? "● Code postal (Requis contrat)" : "Code postal"}
              name="postal_code"
              defaultValue={employee.postal_code ?? ""}
              placeholder="1000-9999"
              validator={validateBelgianPostcode}
              hint={(v) => regionFromPostcode(v)}
            />
          </div>
          <Field label="Ville" name="city" defaultValue={employee.city ?? ""} isMissing={isMissing("city")} />
        </div>
      </Section>

      <Section title="💳 Banque & transport">
        <div className="grid md:grid-cols-3 gap-3">
          <div className={isMissing("iban") ? "border-2 border-rose-400 bg-rose-50 rounded p-1.5 -m-1.5" : ""}>
            <ValidatedField
              label={isMissing("iban") ? "● IBAN (Requis contrat)" : "IBAN"}
              name="iban"
              defaultValue={employee.iban ?? ""}
              placeholder="BE68 5390 0754 7034"
              validator={validateBelgianIBAN}
              formatter={formatIBAN}
            />
          </div>
          <Field label="BIC" name="bic" defaultValue={employee.bic ?? ""} />
          <Field label="Titulaire compte" name="bank_holder" defaultValue={employee.bank_holder ?? ""} />
          <div>
            <Label>Type de transport</Label>
            <Select name="transport_type" defaultValue={employee.transport_type ?? "none"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(TRANSPORT_MODES ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SubmittedStatus subs={employee.worker_field_submissions} field="transport_type" />
          </div>
          <Field
            label="Prix transport (€)"
            name="transport_price"
            defaultValue={employee.transport_price ?? ""}
            type="number"
            step="0.01"
            placeholder="52.00"
          />
          <div>
            <Label>Périodicité de l&apos;abonnement</Label>
            <Select name="transport_frequency" defaultValue={employee.transport_frequency ?? "mensuel"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensuel">Abonnement mensuel</SelectItem>
                <SelectItem value="annuel">Abonnement annuel</SelectItem>
                <SelectItem value="sans_objet">Sans abonnement</SelectItem>
              </SelectContent>
            </Select>
            <SubmittedStatus subs={employee.worker_field_submissions} field="transport_frequency" />
          </div>
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
  label, name, defaultValue = "", type = "text", placeholder, step, isMissing,
}: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string; step?: string; isMissing?: boolean }) {
  return (
    <div className={isMissing ? "border-2 border-rose-400 bg-rose-50 rounded p-1.5 -m-1.5" : ""}>
      <Label htmlFor={name} className={isMissing ? "text-rose-900 font-semibold flex items-center gap-1" : ""}>
        {isMissing && <span className="text-rose-600">●</span>}
        {label}
        {isMissing && <span className="text-[10px] text-rose-600 ml-auto">Requis pour contrat</span>}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        type={type}
        placeholder={placeholder}
        step={step}
        className={isMissing ? "bg-white border-rose-300" : ""}
      />
    </div>
  );
}

// Karim 2026-05-30 : date naissance + NRN couplés.
// Loi belge : NRN (6 premiers chiffres) = YYMMDD inversé de la date de naissance.
// Quand on saisit la date, on auto-prefill le NRN avec "YY.MM.DD-" (modifiable
// pour les rares exceptions : changement de nom, naturalisation, etc.).
function BirthDateAndNrn({
  defaultBirthDate,
  defaultNrn,
}: {
  defaultBirthDate: string;
  defaultNrn: string;
}) {
  const [birthDate, setBirthDate] = useState(defaultBirthDate);
  const [nrn, setNrn] = useState(defaultNrn);

  function onBirthDateChange(newDate: string) {
    setBirthDate(newDate);
    // Si NRN vide ou ne match pas la date, propose le nouveau préfixe
    if (newDate && newDate.length >= 10) {
      const [y, m, d] = newDate.split("-");
      const yy = y.slice(2);
      const prefix = `${yy}.${m}.${d}-`;
      // Si le NRN actuel correspond a l ancienne date (memes 6 chiffres), update
      // Si NRN vide, prefill
      const cleaned = nrn.replace(/[.\-\s]/g, "");
      if (!nrn || (cleaned.length >= 6 && cleaned.slice(0, 6) !== prefix.slice(0, 8).replace(/[.\-]/g, ""))) {
        setNrn(prefix);
      } else if (cleaned.length < 6) {
        setNrn(prefix);
      }
    }
  }

  // Cohérence : si NRN saisi ne match pas birth_date, warning visuel
  let warning: string | null = null;
  if (birthDate && nrn) {
    const cleaned = nrn.replace(/[.\-\s]/g, "");
    if (cleaned.length >= 6) {
      const [y, m, d] = birthDate.split("-");
      const expected = `${y.slice(2)}${m}${d}`;
      if (cleaned.slice(0, 6) !== expected) {
        warning = `Les 6 premiers chiffres NRN (${cleaned.slice(0, 6)}) ne matchent pas la date ${birthDate} (attendu ${expected}). Exception ou erreur ?`;
      }
    }
  }

  return (
    <>
      <div>
        <Label htmlFor="birth_date">Date de naissance</Label>
        <Input
          id="birth_date"
          name="birth_date"
          type="date"
          value={birthDate}
          onChange={(e) => onBirthDateChange(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="nrn">NRN</Label>
        <Input
          id="nrn"
          name="nrn"
          value={nrn}
          onChange={(e) => setNrn(e.target.value)}
          placeholder="XX.XX.XX-XXX.XX"
        />
        {warning && (
          <p className="text-[10px] text-amber-700 mt-0.5">⚠️ {warning}</p>
        )}
        {!warning && birthDate && nrn && nrn.length >= 13 && (
          <p className="text-[10px] text-green-700 mt-0.5">✓ NRN cohérent avec la date de naissance</p>
        )}
      </div>
    </>
  );
}

// Karim 2026-05-30 : composant unifié pour piloter ensemble :
//   - Temps plein -> force 38h (CP 201, loi belge)
//   - Temps partiel -> clamp [13, 30]h
//   - Étudiant -> libre [1, 38]h (règles 600h/an gérées séparément)
// Le trigger BD applique la même logique en backup si jamais le form contourné.
function WorkTimeAndHours({
  defaultKind,
  defaultHours,
  contractType,
}: {
  defaultKind: string | null;
  defaultHours: number | null;
  contractType: string | null;
}) {
  const isStudent = contractType === "Étudiant" || contractType === "Etudiant";
  // Karim 2026-06-17 : seuil unique 38h. < 38h ⇒ temps partiel d'office
  // (il n'existe pas de « 24h temps plein »). Les heures pilotent le régime.
  const inferredKind: "full" | "part" =
    (defaultHours ?? 0) >= 38 ? "full" : "part";
  const initialKind =
    defaultKind === "full" || defaultKind === "part" ? defaultKind : inferredKind;
  const [kind, setKind] = useState<"full" | "part">(initialKind);
  const [hours, setHours] = useState<string>(String(defaultHours ?? (initialKind === "full" ? 38 : 20)));

  function setKindAndHours(newKind: "full" | "part") {
    setKind(newKind);
    if (isStudent) return;
    if (newKind === "full") {
      setHours("38");
    } else {
      const cur = parseInt(hours, 10);
      if (!Number.isFinite(cur) || cur < 13) setHours("13");
      else if (cur >= 38) setHours("30");
    }
  }

  function onHoursBlur() {
    if (isStudent) return;
    const n = parseInt(hours, 10);
    if (!Number.isFinite(n)) return;
    // Les heures pilotent le régime : >= 38h ⇒ temps plein (38) ; < 38h ⇒ temps partiel.
    if (n >= 38) {
      setKind("full");
      setHours("38");
    } else {
      setKind("part");
      if (n < 13) setHours("13");
    }
  }

  const hoursDisabled = !isStudent && kind === "full";
  const min = isStudent ? 1 : kind === "full" ? 38 : 13;
  const max = isStudent ? 38 : kind === "full" ? 38 : 37;

  return (
    <>
      <div>
        <Label>Temps de travail</Label>
        <div className="flex gap-2 mt-1">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-line cursor-pointer text-sm">
            <input
              type="radio"
              name="work_time_kind"
              value="full"
              checked={kind === "full"}
              onChange={() => setKindAndHours("full")}
            />
            Plein temps {!isStudent && <span className="text-[10px] text-ink-3">(38h)</span>}
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-line cursor-pointer text-sm">
            <input
              type="radio"
              name="work_time_kind"
              value="part"
              checked={kind === "part"}
              onChange={() => setKindAndHours("part")}
            />
            Temps partiel {!isStudent && <span className="text-[10px] text-ink-3">(13–30h)</span>}
          </label>
        </div>
      </div>
      <div>
        <Label htmlFor="weekly_hours">Heures/semaine</Label>
        <input
          id="weekly_hours"
          name="weekly_hours"
          type="number"
          min={min}
          max={max}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={onHoursBlur}
          disabled={hoursDisabled}
          className="mt-1 w-full px-2 py-1.5 text-sm rounded border border-line bg-surface disabled:bg-muted disabled:opacity-60"
        />
        {!isStudent && (
          <p className="text-[10px] text-ink-3 mt-0.5">
            {kind === "full" ? "Auto-figé à 38h (CP 201)" : "Min 13h / max 30h (loi belge)"}
          </p>
        )}
      </div>
    </>
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
