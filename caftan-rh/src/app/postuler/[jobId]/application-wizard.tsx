"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Check, ArrowLeft, ArrowRight, Send, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";
import {
  validateBelgianPhone, validateBelgianPostcode, validateNRN,
  nissPrefixFromIso, isoMinusYears,
} from "@/lib/be-validators";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";
import { ensureDraftApplication, saveApplicationStep, finalizeApplication, uploadWizardCv } from "./wizard-actions";

const LANGS: Array<{ code: string; key: TranslationKey }> = [
  { code: "fr", key: "apply.lang.fr" }, { code: "nl", key: "apply.lang.nl" },
  { code: "en", key: "apply.lang.en" }, { code: "ar", key: "apply.lang.ar" },
  { code: "ber", key: "apply.lang.ber" }, { code: "de", key: "apply.lang.de" },
  { code: "it", key: "apply.lang.it" }, { code: "es", key: "apply.lang.es" },
  { code: "tr", key: "apply.lang.tr" },
];
const LANG_LEVELS: Array<{ code: string; key: TranslationKey }> = [
  { code: "basic", key: "apply.lang_level.basic" }, { code: "fluent", key: "apply.lang_level.fluent" }, { code: "native", key: "apply.lang_level.native" },
];
const CONTRACTS: Array<{ code: string; key: TranslationKey }> = [
  { code: "CDI", key: "apply.contract.cdi" }, { code: "CDD", key: "apply.contract.cdd" },
  { code: "Étudiant", key: "apply.contract.student" }, { code: "Intérim", key: "apply.contract.interim" }, { code: "Freelance", key: "apply.contract.freelance" },
];
const WEEKDAYS: Array<{ code: string; key: TranslationKey }> = [
  { code: "mon", key: "apply.weekday.mon" }, { code: "tue", key: "apply.weekday.tue" }, { code: "wed", key: "apply.weekday.wed" },
  { code: "thu", key: "apply.weekday.thu" }, { code: "fri", key: "apply.weekday.fri" }, { code: "sat", key: "apply.weekday.sat" }, { code: "sun", key: "apply.weekday.sun" },
];
const PERMITS: Array<{ code: string; key: TranslationKey }> = [
  { code: "be_eu", key: "apply.permit.be_eu" }, { code: "non_eu_valid", key: "apply.permit.non_eu_valid" }, { code: "non_eu_pending", key: "apply.permit.non_eu_pending" },
];
const PLANS: Array<{ code: string; key: TranslationKey }> = [
  { code: "activa", key: "apply.brussels_plan.activa" }, { code: "activa_longterm", key: "apply.brussels_plan.activa_longterm" },
  { code: "young_first", key: "apply.brussels_plan.young_first" }, { code: "cpe", key: "apply.brussels_plan.cpe" },
  { code: "senior_57", key: "apply.brussels_plan.senior_57" }, { code: "phare", key: "apply.brussels_plan.phare" },
  { code: "pfi", key: "apply.brussels_plan.pfi" }, { code: "tax_shelter", key: "apply.brussels_plan.tax_shelter" },
];

type Fields = {
  firstname: string; lastname: string; email: string; phone: string;
  birth_date: string; gender: string; address: string; postal_code: string; city: string;
  contract_type: string; weekly_hours: string; available_from: string;
  days: Record<string, boolean>; langs: Record<string, string>;
  position: string; experience: string;
  nrn: string; work_permit: string; brussels_plans: Record<string, boolean>; activa_brussels: string;
  motivation: string; consent: boolean;
};

export type WizardInitial = {
  applicationId: string;
  candidate: Record<string, unknown>;
  motivation: string | null;
};

function hydrate(init: WizardInitial): Fields {
  const c = init.candidate ?? {};
  const raw = (c.raw_payload as Record<string, unknown>) ?? {};
  const fullName = String(c.full_name ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const wtp = String(c.work_time_pref ?? "");
  const hours = /(\d+)/.exec(wtp)?.[1] ?? "";
  const daysRaw = (raw.days_available as Record<string, boolean>) ?? {};
  const plansArr = Array.isArray(raw.brussels_plans) ? (raw.brussels_plans as string[]) : [];
  return {
    firstname: parts[0] ?? "", lastname: parts.slice(1).join(" "),
    email: String(c.email ?? ""), phone: String(c.phone ?? ""),
    birth_date: String(c.birth_date ?? "") || isoMinusYears(17),
    gender: String(raw.gender ?? ""), address: String(c.address ?? ""),
    postal_code: String(c.postal_code ?? ""), city: String(c.city ?? ""),
    contract_type: String(c.wanted_contract_type ?? ""), weekly_hours: hours,
    available_from: String(c.available_from ?? ""),
    days: daysRaw, langs: (c.langs as Record<string, string>) ?? {},
    position: String(raw.position ?? ""), experience: String(raw.experience ?? ""),
    nrn: String(c.nrn ?? "") || nissPrefixFromIso(String(c.birth_date ?? "") || isoMinusYears(17)),
    work_permit: String(raw.work_permit ?? ""), brussels_plans: Object.fromEntries(plansArr.map((p) => [p, true])),
    activa_brussels: String(raw.activa_brussels ?? "unknown"),
    motivation: init.motivation ?? "", consent: false,
  };
}

const STEPS = ["Identité", "Disponibilité & profil", "Infos légales", "Récapitulatif"];

export function ApplicationWizard({ jobId, jobTitle, locale, initial }: {
  jobId: string | null; jobTitle: string | null; locale: Locale; initial: WizardInitial;
}) {
  const [appId] = useState(initial.applicationId);
  const [f, setF] = useState<Fields>(() => hydrate(initial));
  const [step, setStep] = useState(0);
  const [showErr, setShowErr] = useState(false);
  const [saving, startSave] = useTransition();
  const [done, setDone] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [cityAuto, setCityAuto] = useState(false);
  const cityEdited = useRef(false);
  const nrnEdited = useRef(!!String(initial.candidate?.nrn ?? ""));

  const maxBirth = useMemo(() => isoMinusYears(17), []);
  const set = (k: keyof Fields, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  // code postal -> ville
  useEffect(() => {
    const code = f.postal_code.trim();
    if (!isBePostalCode(code) || cityEdited.current) return;
    const local = localBeCity(code);
    if (local) { set("city", local); setCityAuto(true); return; }
    let cancelled = false;
    const tmo = setTimeout(async () => {
      const c = await lookupBeCity(code);
      if (!cancelled && c && !cityEdited.current) { set("city", c); setCityAuto(true); }
    }, 300);
    return () => { cancelled = true; clearTimeout(tmo); };
  }, [f.postal_code]);

  // date naissance -> préfixe NISS
  useEffect(() => {
    if (nrnEdited.current) return;
    const p = nissPrefixFromIso(f.birth_date);
    if (p) set("nrn", p);
  }, [f.birth_date]);

  // ---- validation par champ ----
  const errors = useMemo<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!f.firstname.trim()) e.firstname = t("apply.error.required", locale);
    if (!f.lastname.trim()) e.lastname = t("apply.error.required", locale);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = t("apply.error.email", locale);
    if (!f.birth_date) e.birth_date = t("apply.error.required", locale);
    else if (new Date(f.birth_date) > new Date(maxBirth)) e.birth_date = t("apply.error.min_age", locale);
    if (!isBePostalCode(f.postal_code.trim())) e.postal_code = t("apply.error.postcode", locale);
    if (f.phone.trim() && !validateBelgianPhone(f.phone).valid) e.phone = t("apply.error.phone", locale);
    const nd = f.nrn.replace(/\D/g, "");
    if (nd.length >= 11 && !validateNRN(f.nrn).valid) e.nrn = t("apply.error.nrn", locale);
    if (f.motivation.trim() && f.motivation.trim().length < 200) e.motivation = t("apply.error.motivation_short", locale);
    return e;
  }, [f, locale, maxBirth]);

  const STEP_FIELDS: string[][] = [
    ["firstname", "lastname", "email", "birth_date", "postal_code", "phone"],
    [],
    ["nrn"],
    ["email", "motivation"],
  ];
  const stepErrors = (s: number) => STEP_FIELDS[s].filter((k) => errors[k]);
  const allErrors = Object.keys(errors);

  function next() {
    if (stepErrors(step).length > 0) { setShowErr(true); return; }
    setShowErr(false);
    persist();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setShowErr(false); setStep((s) => Math.max(s - 1, 0)); }

  function partialForStep(): Record<string, unknown> {
    return {
      firstname: f.firstname, lastname: f.lastname, email: f.email, phone: f.phone,
      birth_date: f.birth_date, gender: f.gender, address: f.address, postal_code: f.postal_code, city: f.city,
      wanted_contract_type: f.contract_type, weekly_hours: f.weekly_hours, available_from: f.available_from || null,
      days_available: f.days, langs: f.langs, position: f.position, experience: f.experience,
      nrn: f.nrn.replace(/\D/g, "").length >= 11 ? f.nrn : "",
      work_permit: f.work_permit, brussels_plans: Object.keys(f.brussels_plans).filter((k) => f.brussels_plans[k]),
      activa_brussels: f.activa_brussels, motivation: f.motivation,
    };
  }
  function persist() {
    startSave(async () => { await saveApplicationStep(appId, partialForStep()); });
  }

  function submit() {
    setServerErr(null);
    if (allErrors.length > 0) { setShowErr(true); return; }
    if (!f.consent) { setServerErr(t("apply.consent_required", locale)); return; }
    startSave(async () => {
      const r = await finalizeApplication(appId, partialForStep());
      if (r.ok) setDone(true);
      else setServerErr(r.error ?? t("apply.error.generic", locale));
    });
  }

  async function onCvPick(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("cv", file);
    await uploadWizardCv(appId, fd);
  }

  if (done) {
    return (
      <div className="text-center py-10 px-3">
        <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" />
        <h3 className="text-xl font-bold">{t("apply.success.title", locale)}</h3>
        <p className="text-sm text-ink-2 mt-3 max-w-md mx-auto leading-relaxed">{t("apply.success.body", locale)}</p>
        <Button href="/candidat">{t("apply.success.back", locale)}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* progress */}
      <ol className="flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-gold" : "bg-line"}`} />
            <div className={`text-[10px] mt-1 font-semibold ${i === step ? "text-gold-dark" : "text-ink-3"} truncate`}>{i + 1}. {label}</div>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <Grid>
            <F label={t("apply.firstname", locale)} req err={showErr ? errors.firstname : undefined}>
              <I value={f.firstname} onChange={(v) => set("firstname", v)} bad={showErr && !!errors.firstname} />
            </F>
            <F label={t("apply.lastname", locale)} req err={showErr ? errors.lastname : undefined}>
              <I value={f.lastname} onChange={(v) => set("lastname", v)} bad={showErr && !!errors.lastname} />
            </F>
            <F label={t("apply.email", locale)} req err={showErr ? errors.email : undefined}>
              <I type="email" value={f.email} onChange={(v) => set("email", v)} bad={showErr && !!errors.email} />
            </F>
            <F label={t("apply.phone", locale)} err={errors.phone}>
              <I value={f.phone} onChange={(v) => set("phone", v)} bad={!!errors.phone} placeholder="0470 12 34 56" />
            </F>
            <F label={t("apply.birth_date", locale)} req err={showErr ? errors.birth_date : undefined}>
              <I type="date" value={f.birth_date} max={maxBirth} onChange={(v) => set("birth_date", v)} bad={showErr && !!errors.birth_date} />
            </F>
            <F label={t("apply.gender", locale)}>
              <Pills options={[["f", t("apply.gender.f", locale)], ["m", t("apply.gender.m", locale)], ["other", t("apply.gender.other", locale)]]} value={f.gender} onPick={(v) => set("gender", v)} />
            </F>
            <F label={t("apply.postal_code", locale)} req err={showErr ? errors.postal_code : undefined}>
              <I inputMode="numeric" maxLength={4} value={f.postal_code} bad={showErr && !!errors.postal_code}
                 onChange={(v) => { set("postal_code", v.replace(/\D/g, "")); cityEdited.current = false; setCityAuto(false); }} />
            </F>
            <F label={t("apply.city", locale)} badge={cityAuto ? "auto" : undefined}>
              <I value={f.city} onChange={(v) => { set("city", v); cityEdited.current = true; setCityAuto(false); }} />
            </F>
            <div className="sm:col-span-2">
              <F label={t("apply.address", locale)}>
                <I value={f.address} onChange={(v) => set("address", v)} />
              </F>
            </div>
          </Grid>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Grid>
            <F label={t("apply.contract_type", locale)}>
              <Pills options={CONTRACTS.map((c) => [c.code, t(c.key, locale)])} value={f.contract_type} onPick={(v) => set("contract_type", v)} />
            </F>
            <F label={t("apply.weekly_hours", locale)} hint={t("apply.weekly_hours_hint", locale)}>
              <I type="number" value={f.weekly_hours} onChange={(v) => set("weekly_hours", v)} />
            </F>
            <F label={t("apply.available_from", locale)}>
              <I type="date" value={f.available_from} onChange={(v) => set("available_from", v)} />
            </F>
            <div className="sm:col-span-2">
              <F label={t("apply.days_available", locale)}>
                <Pills multi options={WEEKDAYS.map((d) => [d.code, t(d.key, locale).slice(0, 3)])}
                  values={f.days} onToggle={(v) => set("days", { ...f.days, [v]: !f.days[v] })} />
              </F>
            </div>
            <div className="sm:col-span-2">
              <F label={t("apply.section.languages", locale)} hint={t("apply.languages_hint", locale)}>
                <ul className="space-y-1.5">
                  {LANGS.map((l) => {
                    const on = l.code in f.langs;
                    return (
                      <li key={l.code} className="flex items-center gap-2 p-2 rounded-md border border-line bg-surface">
                        <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                          <input type="checkbox" checked={on} onChange={() => {
                            const n = { ...f.langs }; if (on) delete n[l.code]; else n[l.code] = "fluent"; set("langs", n);
                          }} className="h-4 w-4 accent-[var(--color-gold)]" />
                          <span className="text-sm font-medium truncate">{t(l.key, locale)}</span>
                        </label>
                        {on && (
                          <select value={f.langs[l.code]} onChange={(e) => set("langs", { ...f.langs, [l.code]: e.target.value })}
                            className="text-xs rounded border border-line bg-surface px-2 py-1">
                            {LANG_LEVELS.map((lv) => <option key={lv.code} value={lv.code}>{t(lv.key, locale)}</option>)}
                          </select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </F>
            </div>
            <div className="sm:col-span-2">
              <F label={t("apply.position", locale)} hint={t("apply.position_hint", locale)}>
                <I value={f.position} onChange={(v) => set("position", v)} />
              </F>
            </div>
            <div className="sm:col-span-2">
              <F label={t("apply.experience", locale)}>
                <textarea rows={3} maxLength={1500} value={f.experience} onChange={(e) => set("experience", e.target.value)}
                  className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm focus:border-gold outline-none" />
              </F>
            </div>
            <div className="sm:col-span-2">
              <F label={t("apply.cv_upload", locale)}>
                <input type="file" accept="application/pdf,.pdf,.doc,.docx,image/jpeg,.jpg,.jpeg"
                  onChange={(e) => onCvPick(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-ink-2 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gold-light file:text-gold-dark file:font-bold" />
              </F>
            </div>
          </Grid>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="space-y-3">
            <F label={t("apply.nrn_optional", locale)} hint={t("apply.nrn_hint", locale)} err={errors.nrn}>
              <I value={f.nrn} bad={!!errors.nrn} placeholder="XX.XX.XX-XXX.XX"
                onChange={(v) => { set("nrn", v); nrnEdited.current = true; }} />
            </F>
            <F label={t("apply.work_permit", locale)}>
              <div className="flex flex-col gap-1.5">
                {PERMITS.map((o) => (
                  <label key={o.code} className="inline-flex items-center gap-2 p-2 rounded-md border border-line bg-surface cursor-pointer hover:border-gold">
                    <input type="radio" checked={f.work_permit === o.code} onChange={() => set("work_permit", o.code)} className="h-4 w-4 accent-[var(--color-gold)]" />
                    <span className="text-sm">{t(o.key, locale)}</span>
                  </label>
                ))}
              </div>
            </F>
            <F label={t("apply.activa_brussels", locale)} hint={t("apply.activa_hint", locale)}>
              <div className="flex flex-wrap gap-1.5">
                {PLANS.map((p) => {
                  const on = !!f.brussels_plans[p.code];
                  return (
                    <label key={p.code} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full border cursor-pointer ${on ? "bg-gold/10 border-gold text-ink" : "border-line bg-surface hover:border-gold/60"}`}>
                      <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-gold)]" checked={on}
                        onChange={() => set("brussels_plans", { ...f.brussels_plans, [p.code]: !on })} />
                      <span>{t(p.key, locale)}</span>
                    </label>
                  );
                })}
              </div>
            </F>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          {allErrors.length === 0 ? (
            <div className="text-center py-3">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">Tout est complet ✅</p>
              <p className="text-xs text-ink-2 mt-1">Vérifie ton consentement puis envoie ta candidature.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-danger flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> À corriger avant l'envoi :</p>
              {allErrors.map((k) => (
                <div key={k} className="text-xs text-danger bg-danger-light/40 rounded px-2 py-1.5">{labelFor(k, locale)} — {errors[k]}</div>
              ))}
              <p className="text-[11px] text-ink-3">Reviens à l'écran concerné pour compléter.</p>
            </div>
          )}
          <label className="flex items-start gap-3 p-3 mt-3 rounded-md border border-line bg-surface cursor-pointer">
            <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold)]" />
            <span className="text-sm leading-relaxed">{t("apply.consent_label", locale)}</span>
          </label>
          {serverErr ? <p className="text-xs text-danger font-semibold mt-2">{serverErr}</p> : null}
        </Card>
      )}

      {/* nav */}
      <div className="flex items-center gap-2">
        {step > 0 ? (
          <button type="button" onClick={back} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-3 text-sm font-bold text-ink-2 hover:border-gold">
            <ArrowLeft className="h-4 w-4" /> Précédent
          </button>
        ) : <span />}
        {saving ? <span className="text-[11px] text-ink-3 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> sauvegarde…</span> : <span className="text-[11px] text-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> enregistré</span>}
        <div className="ml-auto">
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-xl bg-ink text-canvas px-5 py-3 text-sm font-bold active:scale-[0.98]">
              Suivant <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={saving || !f.consent || allErrors.length > 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold text-[#1a1a0d] px-5 py-3 text-sm font-bold disabled:opacity-50 active:scale-[0.98]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("apply.submit", locale)}
            </button>
          )}
        </div>
      </div>
      {jobTitle ? <p className="text-[11px] text-ink-3 text-center">Candidature pour : <b>{jobTitle}</b></p> : null}
    </div>
  );
}

// ---- petits composants ----
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-3">{children}</div>;
}
function F({ label, hint, err, req, badge, children }: { label: string; hint?: string; err?: string; req?: boolean; badge?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold mb-1 block text-ink-2">
        {label}{req ? <span className="text-danger ml-0.5">*</span> : null}
        {badge ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-success"><Sparkles className="h-3 w-3" /> {badge}</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-3 mt-1">{hint}</p> : null}
      {err ? <p className="text-[11px] text-danger mt-1 inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {err}</p> : null}
    </div>
  );
}
function I({ value, onChange, type = "text", bad, placeholder, max, maxLength, inputMode }: {
  value: string; onChange: (v: string) => void; type?: string; bad?: boolean; placeholder?: string; max?: string; maxLength?: number; inputMode?: "numeric" | "email" | "tel" | "text";
}) {
  return (
    <input type={type} value={value} placeholder={placeholder} max={max} maxLength={maxLength} inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none ${bad ? "border-danger" : "border-line focus:border-gold"}`} />
  );
}
function Pills({ options, value, onPick, multi, values, onToggle }: {
  options: Array<[string, string]>; value?: string; onPick?: (v: string) => void; multi?: boolean; values?: Record<string, boolean>; onToggle?: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([code, label]) => {
        const on = multi ? !!values?.[code] : value === code;
        return (
          <button key={code} type="button" onClick={() => (multi ? onToggle?.(code) : onPick?.(code))}
            className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${on ? "bg-gold text-[#1a1a0d] border-gold" : "bg-surface text-ink-2 border-line hover:border-gold"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
function Button({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center justify-center mt-6 rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink-2 hover:border-gold">{children}</Link>;
}
function labelFor(k: string, locale: Locale): string {
  const map: Record<string, TranslationKey> = {
    firstname: "apply.firstname", lastname: "apply.lastname", email: "apply.email",
    birth_date: "apply.birth_date", postal_code: "apply.postal_code", phone: "apply.phone",
    nrn: "apply.nrn_optional", motivation: "apply.section.motivation",
  };
  return map[k] ? t(map[k], locale) : k;
}
