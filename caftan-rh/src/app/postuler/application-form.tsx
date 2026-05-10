"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/config";
import { submitPublicApplication } from "./actions";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";
import {
  validateBelgianPhone,
  validateBelgianPostcode,
  validateNRN,
} from "@/lib/be-validators";
import type { Site } from "@/lib/sites-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes du formulaire (codes stables côté DB, libellés via i18n).
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES: Array<{ code: string; key: TranslationKey }> = [
  { code: "fr", key: "apply.lang.fr" },
  { code: "nl", key: "apply.lang.nl" },
  { code: "en", key: "apply.lang.en" },
  { code: "ar", key: "apply.lang.ar" },
  { code: "de", key: "apply.lang.de" },
  { code: "it", key: "apply.lang.it" },
  { code: "es", key: "apply.lang.es" },
  { code: "tr", key: "apply.lang.tr" },
];

const LANG_LEVELS: Array<{ code: string; key: TranslationKey }> = [
  { code: "basic", key: "apply.lang_level.basic" },
  { code: "fluent", key: "apply.lang_level.fluent" },
  { code: "native", key: "apply.lang_level.native" },
];

const CONTRACT_TYPES: Array<{ code: string; key: TranslationKey }> = [
  { code: "CDI", key: "apply.contract.cdi" },
  { code: "CDD", key: "apply.contract.cdd" },
  { code: "Étudiant", key: "apply.contract.student" },
  { code: "Intérim", key: "apply.contract.interim" },
  { code: "Freelance", key: "apply.contract.freelance" },
];

const WEEKDAYS: Array<{ code: string; key: TranslationKey }> = [
  { code: "mon", key: "apply.weekday.mon" },
  { code: "tue", key: "apply.weekday.tue" },
  { code: "wed", key: "apply.weekday.wed" },
  { code: "thu", key: "apply.weekday.thu" },
  { code: "fri", key: "apply.weekday.fri" },
  { code: "sat", key: "apply.weekday.sat" },
  { code: "sun", key: "apply.weekday.sun" },
];

const POSITION_SUGGESTIONS: Array<{ value: string; key: TranslationKey }> = [
  { value: "Vendeur·se", key: "apply.position.vendeur" },
  { value: "Gestionnaire", key: "apply.position.gestionnaire" },
  { value: "Gérant·e", key: "apply.position.gerant" },
];

const PERMIT_OPTIONS: Array<{ code: string; key: TranslationKey }> = [
  { code: "be_eu", key: "apply.permit.be_eu" },
  { code: "non_eu_valid", key: "apply.permit.non_eu_valid" },
  { code: "non_eu_pending", key: "apply.permit.non_eu_pending" },
];

const ACTIVA_OPTIONS: Array<{ code: string; key: TranslationKey }> = [
  { code: "unknown", key: "apply.activa.unknown" },
  { code: "yes", key: "apply.activa.yes" },
  { code: "no", key: "apply.activa.no" },
];

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  jobId: string | null;
  locale: Locale;
  sites: Site[];
};

export function ApplicationForm({ jobId, locale, sites }: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  // État UI nécessaire (les autres champs sont uncontrolled).
  const [country, setCountry] = useState("BE");
  const [gender, setGender] = useState<"f" | "m" | "other" | "">("");
  const [contractType, setContractType] = useState<string>("");
  const [sitePref, setSitePref] = useState<string>(""); // site id ou ""
  const [permit, setPermit] = useState<string>("");
  const [activa, setActiva] = useState<string>("unknown");
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [langs, setLangs] = useState<Record<string, string>>({}); // code -> level
  const [position, setPosition] = useState<string>("");
  const [motivation, setMotivation] = useState<string>("");
  const [consent, setConsent] = useState<boolean>(false);

  // Validation feedback (live) — non bloquant tant que possible.
  const [phoneVal, setPhoneVal] = useState<string>("");
  const [postcodeVal, setPostcodeVal] = useState<string>("");
  const [nrnVal, setNrnVal] = useState<string>("");

  const phoneCheck = useMemo(
    () => (phoneVal ? validateBelgianPhone(phoneVal) : null),
    [phoneVal],
  );
  const postcodeCheck = useMemo(
    () => (postcodeVal ? validateBelgianPostcode(postcodeVal) : null),
    [postcodeVal],
  );
  const nrnCheck = useMemo(
    () => (nrnVal ? validateNRN(nrnVal) : null),
    [nrnVal],
  );

  if (done) {
    return (
      <div className="text-center py-10 px-3">
        <CheckCircle2 className="h-14 w-14 text-success mx-auto mb-3" />
        <h3 className="text-xl font-bold">{t("apply.success.title", locale)}</h3>
        <p className="text-sm text-ink-2 mt-3 max-w-md mx-auto leading-relaxed">
          {t("apply.success.body", locale)}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/postuler">{t("apply.success.back", locale)}</Link>
        </Button>
      </div>
    );
  }

  function toggleDay(code: string) {
    setDays((d) => ({ ...d, [code]: !d[code] }));
  }
  function toggleLang(code: string) {
    setLangs((m) => {
      const next = { ...m };
      if (code in next) delete next[code];
      else next[code] = "fluent";
      return next;
    });
  }
  function setLangLevel(code: string, level: string) {
    setLangs((m) => ({ ...m, [code]: level }));
  }

  function clientValidate(fd: FormData): string | null {
    const firstname = String(fd.get("firstname") ?? "").trim();
    const lastname = String(fd.get("lastname") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    if (!firstname || !lastname || !email) {
      return t("apply.error.required", locale);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return t("apply.error.email", locale);
    }
    const phone = String(fd.get("phone") ?? "").trim();
    if (phone) {
      const r = validateBelgianPhone(phone);
      if (!r.valid) return t("apply.error.phone", locale);
    }
    const postcode = String(fd.get("postal_code") ?? "").trim();
    if (postcode) {
      const r = validateBelgianPostcode(postcode);
      if (!r.valid && country === "BE") {
        return t("apply.error.postcode", locale);
      }
    }
    const nrn = String(fd.get("nrn") ?? "").trim();
    if (nrn) {
      const r = validateNRN(nrn);
      if (!r.valid) return t("apply.error.nrn", locale);
    }
    if (motivation && motivation.length > 0) {
      if (motivation.length < 200) {
        return t("apply.error.motivation_short", locale);
      }
      if (motivation.length > 1500) {
        return t("apply.error.motivation_long", locale);
      }
    }
    if (!consent) {
      return t("apply.consent_required", locale);
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────
  return (
    <form
      action={(fd) => {
        // Inject controlled fields into FormData before submission.
        fd.set("country", country);
        fd.set("gender", gender);
        fd.set("contract_type", contractType);
        fd.set("site_preference", sitePref);
        fd.set("work_permit", permit);
        fd.set("activa_brussels", activa);
        fd.set("position", position);
        fd.set("motivation", motivation);
        fd.set("days_available", JSON.stringify(days));
        fd.set("langs", JSON.stringify(langs));
        fd.set("consent", consent ? "1" : "0");
        if (jobId) fd.set("job_id", jobId);
        fd.set("locale", locale);

        const err = clientValidate(fd);
        if (err) {
          toast.error(err);
          return;
        }

        startTransition(async () => {
          const res = await submitPublicApplication(fd);
          if (res?.error) toast.error(res.error);
          else {
            toast.success(t("apply.success.title", locale));
            setDone(true);
          }
        });
      }}
      className="space-y-7"
    >
      <p className="text-[11px] text-ink-3">{t("apply.required_hint", locale)}</p>

      {/* ─── 1. IDENTITÉ ─────────────────────────────────────────────── */}
      <Section title={t("apply.section.identity", locale)}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("apply.firstname", locale)} required>
            <Input name="firstname" required minLength={1} autoComplete="given-name" />
          </Field>
          <Field label={t("apply.lastname", locale)} required>
            <Input name="lastname" required minLength={1} autoComplete="family-name" />
          </Field>
          <Field label={t("apply.email", locale)} required>
            <Input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
            />
          </Field>
          <Field
            label={t("apply.phone", locale)}
            hint={t("apply.phone_hint", locale)}
            error={phoneCheck && !phoneCheck.valid ? phoneCheck.error : undefined}
          >
            <Input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              onBlur={(e) => setPhoneVal(e.currentTarget.value)}
              placeholder="0470 12 34 56"
            />
          </Field>
          <Field label={t("apply.birth_date", locale)}>
            <Input name="birth_date" type="date" autoComplete="bday" />
          </Field>
          <Field label={t("apply.gender", locale)}>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {(["f", "m", "other"] as const).map((g) => (
                <RadioPill
                  key={g}
                  name="gender_pill"
                  value={g}
                  checked={gender === g}
                  onChange={() => setGender(g)}
                  label={t(
                    g === "f"
                      ? "apply.gender.f"
                      : g === "m"
                        ? "apply.gender.m"
                        : "apply.gender.other",
                    locale,
                  )}
                />
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* ─── 2. ADRESSE ──────────────────────────────────────────────── */}
      <Section title={t("apply.section.address", locale)}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Field label={t("apply.address", locale)}>
              <Input name="address" autoComplete="street-address" />
            </Field>
          </div>
          <Field
            label={t("apply.postal_code", locale)}
            error={
              postcodeCheck && !postcodeCheck.valid && country === "BE"
                ? postcodeCheck.error
                : undefined
            }
          >
            <Input
              name="postal_code"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={5}
              onBlur={(e) => setPostcodeVal(e.currentTarget.value)}
            />
          </Field>
          <Field label={t("apply.city", locale)}>
            <Input name="city" autoComplete="address-level2" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("apply.country", locale)}>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </Section>

      {/* ─── 3. LANGUES ──────────────────────────────────────────────── */}
      <Section title={t("apply.section.languages", locale)}>
        <p className="text-[11px] text-ink-3 mb-2">
          {t("apply.languages_hint", locale)}
        </p>
        <ul className="space-y-1.5">
          {LANGUAGES.map((l) => {
            const checked = l.code in langs;
            return (
              <li
                key={l.code}
                className="flex items-center gap-2 p-2 rounded-md border border-line bg-surface"
              >
                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLang(l.code)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-gold)]"
                  />
                  <span className="text-sm font-medium truncate">
                    {t(l.key, locale)}
                  </span>
                </label>
                {checked ? (
                  <select
                    value={langs[l.code]}
                    onChange={(e) => setLangLevel(l.code, e.target.value)}
                    className="text-xs rounded border border-line bg-surface px-2 py-1"
                  >
                    {LANG_LEVELS.map((lv) => (
                      <option key={lv.code} value={lv.code}>
                        {t(lv.key, locale)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ─── 4. DISPONIBILITÉ ────────────────────────────────────────── */}
      <Section title={t("apply.section.availability", locale)}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("apply.contract_type", locale)}>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {t(c.key, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={t("apply.weekly_hours", locale)}
            hint={t("apply.weekly_hours_hint", locale)}
          >
            <Input
              name="weekly_hours"
              type="number"
              min={0}
              max={48}
              inputMode="numeric"
              placeholder="38"
            />
          </Field>
          <Field label={t("apply.available_from", locale)}>
            <Input name="available_from" type="date" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("apply.days_available", locale)}>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mt-1.5">
                {WEEKDAYS.map((d) => (
                  <RadioPill
                    key={d.code}
                    name={`day_${d.code}`}
                    value={d.code}
                    checked={!!days[d.code]}
                    onChange={() => toggleDay(d.code)}
                    label={t(d.key, locale).slice(0, 3)}
                    title={t(d.key, locale)}
                  />
                ))}
              </div>
            </Field>
          </div>
          {sites.length > 0 ? (
            <div className="sm:col-span-2">
              <Field
                label={t("apply.site_preference", locale)}
                hint={t("apply.site_preference_hint", locale)}
              >
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <RadioPill
                    name="site_any"
                    value=""
                    checked={sitePref === ""}
                    onChange={() => setSitePref("")}
                    label={t("apply.site_any", locale)}
                  />
                  {sites.map((s) => (
                    <RadioPill
                      key={s.id}
                      name={`site_${s.id}`}
                      value={s.id}
                      checked={sitePref === s.id}
                      onChange={() => setSitePref(s.id)}
                      label={s.abbr ?? s.name}
                      title={`${s.name}${s.city ? " · " + s.city : ""}`}
                    />
                  ))}
                </div>
              </Field>
            </div>
          ) : null}
        </div>
      </Section>

      {/* ─── 5. PROFIL PRO ───────────────────────────────────────────── */}
      <Section title={t("apply.section.profile", locale)}>
        <div className="space-y-3">
          <Field
            label={t("apply.position", locale)}
            hint={t("apply.position_hint", locale)}
          >
            <Input
              name="position_input"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder={t("apply.position.vendeur", locale)}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {POSITION_SUGGESTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPosition(t(p.key, locale))}
                  className="text-[11px] px-2 py-1 rounded-full border border-line bg-surface hover:border-gold transition-colors"
                >
                  {t(p.key, locale)}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label={t("apply.experience", locale)}
            hint={t("apply.experience_hint", locale)}
          >
            <Textarea name="experience" rows={3} maxLength={1500} />
          </Field>
          <Field label={t("apply.cv_upload", locale)}>
            <Input
              name="cv"
              type="file"
              accept="application/pdf,.pdf,.doc,.docx,image/jpeg,.jpg,.jpeg"
            />
          </Field>
        </div>
      </Section>

      {/* ─── 6. MOTIVATION ───────────────────────────────────────────── */}
      <Section title={t("apply.section.motivation", locale)}>
        <Field hint={t("apply.motivation_hint", locale)}>
          <Textarea
            name="motivation_input"
            rows={5}
            maxLength={1500}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder=""
          />
          <div className="text-[11px] text-ink-3 text-right mt-1">
            {t("apply.motivation_chars", locale, { n: motivation.length })}
          </div>
        </Field>
      </Section>

      {/* ─── 7. LÉGAL BE (optionnel) ─────────────────────────────────── */}
      <Section
        title={t("apply.section.legal", locale)}
        hint={t("apply.section.legal_hint", locale)}
      >
        <div className="space-y-3">
          <Field
            label={t("apply.nrn_optional", locale)}
            hint={t("apply.nrn_hint", locale)}
            error={nrnCheck && !nrnCheck.valid ? nrnCheck.error : undefined}
          >
            <Input
              name="nrn"
              placeholder="XX.XX.XX-XXX.XX"
              inputMode="numeric"
              onBlur={(e) => setNrnVal(e.currentTarget.value)}
            />
          </Field>
          <Field
            label={t("apply.activa_brussels", locale)}
            hint={t("apply.activa_hint", locale)}
          >
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ACTIVA_OPTIONS.map((o) => (
                <RadioPill
                  key={o.code}
                  name={`activa_${o.code}`}
                  value={o.code}
                  checked={activa === o.code}
                  onChange={() => setActiva(o.code)}
                  label={t(o.key, locale)}
                />
              ))}
            </div>
          </Field>
          <Field label={t("apply.work_permit", locale)}>
            <div className="flex flex-col gap-1.5 mt-1.5">
              {PERMIT_OPTIONS.map((o) => (
                <label
                  key={o.code}
                  className="inline-flex items-center gap-2 p-2 rounded-md border border-line bg-surface cursor-pointer hover:border-gold"
                >
                  <input
                    type="radio"
                    name="work_permit_pick"
                    checked={permit === o.code}
                    onChange={() => setPermit(o.code)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <span className="text-sm">{t(o.key, locale)}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* ─── 8. CONSENTEMENT ─────────────────────────────────────────── */}
      <Section title={t("apply.section.consent", locale)}>
        <label className="flex items-start gap-3 p-3 rounded-md border border-line bg-surface cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold)]"
          />
          <span className="text-sm leading-relaxed">
            {t("apply.consent_label", locale)}
          </span>
        </label>
      </Section>

      {/* SUBMIT */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="gold"
          size="lg"
          className="w-full text-base font-bold"
          disabled={pending || !consent}
        >
          {pending ? t("apply.submitting", locale) : t("apply.submit", locale)}
        </Button>
        {!consent ? (
          <p className="text-[11px] text-ink-3 text-center mt-2 inline-flex items-center gap-1 justify-center w-full">
            <AlertCircle className="h-3 w-3" />{" "}
            {t("apply.consent_required", locale)}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composants UI utilitaires (mobile-first).
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-line pt-4">
      <legend className="text-[11px] font-bold uppercase tracking-[0.08em] text-gold-dark mb-1 px-1">
        {title}
      </legend>
      {hint ? (
        <p className="text-[11px] text-ink-3 mb-3 px-1">{hint}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label ? (
        <Label className="text-xs font-semibold mb-1 block">
          {label}
          {required ? <span className="text-danger ml-0.5">*</span> : null}
        </Label>
      ) : null}
      {children}
      {hint ? (
        <p className="text-[11px] text-ink-3 mt-1">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-danger mt-1 inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
    </div>
  );
}

function RadioPill({
  name,
  value,
  checked,
  onChange,
  label,
  title,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={[
        "inline-flex items-center justify-center min-w-[44px] min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold border-2 cursor-pointer transition-colors select-none",
        checked
          ? "bg-gold text-[#1a1a0d] border-gold"
          : "bg-surface text-ink-2 border-line hover:border-gold",
      ].join(" ")}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}
