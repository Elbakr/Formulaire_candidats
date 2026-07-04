"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, CheckCircle2, Check, Sparkles } from "lucide-react";
import { IbanField } from "@/components/iban-field";
import { submitContractInfoAction, autosaveContractInfoAction } from "./actions";
import { UnavailabilitiesStep } from "./unavailabilities-step";
import { IdCardUpload } from "@/components/id-card-upload";
import { BirthDatePicker } from "@/components/birth-date-picker";
import { reverseGeocodeAction } from "@/lib/geocode-actions";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";
import { nissPrefixFromIso, isoMinusYears, validateNRN, normalizeNRN } from "@/lib/be-validators";
import { TRANSPORT_MODES } from "@/lib/config";

type Field = { key: string; label: string };
type CandidateUnavailability = {
  id: string;
  day_of_week: number | null;
  date_specific: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
};

// Champs à choix (rendus en <select>).
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
  education_level: [
    { value: "", label: "— choisir —" },
    { value: "sans_diplome", label: "Sans diplôme" },
    { value: "secondaire_inferieur", label: "Secondaire inférieur" },
    { value: "secondaire_superieur", label: "Secondaire supérieur (CESS)" },
    { value: "bachelier", label: "Bachelier" },
    { value: "master", label: "Master ou +" },
    { value: "autre", label: "Autre" },
  ],
  marital_status: [
    { value: "", label: "— choisir —" },
    { value: "celibataire", label: "Célibataire" },
    { value: "marie", label: "Marié(e)" },
    { value: "cohabitant_legal", label: "Cohabitant(e) légal(e)" },
    { value: "divorce", label: "Divorcé(e)" },
    { value: "veuf", label: "Veuf / Veuve" },
  ],
};

// Karim 2026-07-03 : champs candidat réservés au parcours NON-ÉTUDIANT (précompte
// professionnel). Masqués pour un étudiant (régime/cotisations différents).
const NON_STUDENT_ONLY = new Set(["marital_status", "dependent_children"]);

// Micro-explications (finalité) affichées sous certains champs candidat.
const FIELD_HINTS: Record<string, string> = {
  birth_date: "Tu dois avoir au moins 17 ans pour t'enregistrer.",
  nationality: "Pour la déclaration Dimona (secrétariat social).",
  birth_place: "Figure sur ta carte d'identité — pour la Dimona.",
  education_level: "Facultatif — utile pour évaluer ta candidature.",
  marital_status: "Pour le calcul de ton précompte professionnel.",
  dependent_children: "Pour le calcul de ton précompte professionnel.",
};

// Ordre logique : la date de naissance avant le NISS (qu'elle pre-remplit),
// le code postal avant la ville (qu'il auto-detecte).
const FIELD_ORDER = ["full_name", "email", "birth_date", "birth_place", "nrn", "nationality", "address", "postal_code", "city", "iban", "education_level", "marital_status", "dependent_children", "transport_type", "transport_frequency", "transport_price"];

function inputType(key: string): string {
  if (key === "birth_date") return "date";
  if (key === "email") return "email";
  if (key === "transport_price" || key === "dependent_children") return "number";
  if (key === "postal_code") return "text";
  return "text";
}
function placeholder(key: string): string {
  switch (key) {
    case "iban": return "BE.. .... .... ....";
    case "nrn": return "AA.MM.JJ-XXX.CC";
    case "postal_code": return "1000";
    case "city": return "Bruxelles";
    case "address": return "Rue, numéro";
    case "transport_price": return "52.00";
    case "nationality": return "Belge, Marocaine…";
    case "birth_place": return "Ville de naissance";
    case "dependent_children": return "0";
    default: return "";
  }
}

// --- IBAN : validation instantanee (mod-97, ISO 13616) ---------------------
function normalizeIban(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}
function ibanIsValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("BE") && iban.length !== 16) return false; // BE = 16 car.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}
function formatIbanGroups(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

export function ContractInfoForm({
  token,
  fields,
  firstName,
  birthDate,
  isCandidate = false,
  initialIsStudent = null,
  initialUnavailabilities = [],
  idCardExisting = null,
}: {
  token: string;
  fields: Field[];
  firstName: string;
  birthDate?: string | null;
  isCandidate?: boolean;
  initialIsStudent?: boolean | null;
  initialUnavailabilities?: CandidateUnavailability[];
  idCardExisting?: { fileName: string; at: string } | null;
}) {
  // Étape 2 (candidat uniquement) : déclaration des indisponibilités.
  const [step, setStep] = useState<1 | 2>(1);
  const ordered = useMemo(
    () => [...fields].sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key)),
    [fields],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cityAuto, setCityAuto] = useState(false); // ville remplie automatiquement
  const editedRef = useRef<Set<string>>(new Set()); // champs modifies a la main
  // Karim 2026-06-17 : auto-save instantané (sans soumettre) — indicateurs.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [geoLoading, setGeoLoading] = useState(false);
  // Karim 2026-07-03 : statut étudiant/non-étudiant (candidat pré-validé).
  const [isStudent, setIsStudent] = useState<string>(
    initialIsStudent === true ? "true" : initialIsStudent === false ? "false" : "",
  );

  async function saveStudent(v: string) {
    setSavingKey("is_student");
    try {
      const r = await autosaveContractInfoAction(token, { is_student: v });
      if (r.ok) setSavedKeys((s) => new Set(s).add("is_student"));
    } catch {
      /* silencieux */
    } finally {
      setSavingKey(null);
    }
  }

  async function autosave(key: string, raw: string) {
    const v = (raw ?? "").trim();
    if (!v) return;
    if (key === "iban" && !ibanIsValid(v)) return; // n'enregistre pas un IBAN invalide
    if (key === "birth_date" && v > maxBirth) return; // pas < 17 ans
    setSavingKey(key);
    try {
      const r = await autosaveContractInfoAction(token, { [key]: key === "iban" ? normalizeIban(v) : v });
      if (r.ok) setSavedKeys((s) => new Set(s).add(key));
    } catch {
      /* silencieux : la soumission finale reste le filet */
    } finally {
      setSavingKey(null);
    }
  }

  // Karim 2026-07-04 : pré-remplissage adresse via géoloc (consentie) — gain de
  // temps si le candidat est chez lui. La position sert uniquement à proposer une
  // adresse (reverse-geocode Google), que le candidat valide/corrige ensuite.
  function useMyLocation() {
    setErr(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverseGeocodeAction(pos.coords.latitude, pos.coords.longitude);
          if (!r.ok) { setErr(r.error ?? "Adresse introuvable à ta position."); return; }
          if (r.address) { setField("address", r.address); void autosave("address", r.address); }
          if (r.postal_code) { setField("postal_code", r.postal_code); void autosave("postal_code", r.postal_code); }
          if (r.city) { setField("city", r.city, false); setCityAuto(true); void autosave("city", r.city); }
        } finally {
          setGeoLoading(false);
        }
      },
      (e) => {
        setGeoLoading(false);
        setErr(e.code === 1 ? "Autorise la localisation pour pré-remplir ton adresse." : "Localisation impossible pour le moment.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const hasCity = ordered.some((f) => f.key === "city");
  const hasNrn = ordered.some((f) => f.key === "nrn");

  // Date de naissance effective : saisie dans le form, sinon deja connue.
  const effectiveBirth = values.birth_date || birthDate || "";
  // Karim 2026-06-15 : age minimum 17 ans (cohérence avec le formulaire candidature).
  const maxBirth = useMemo(() => isoMinusYears(17), []);

  // 1) NISS : pre-remplit le prefixe AAMMJJ des que la date de naissance est
  //    connue, tant que l'utilisateur n'a pas edite le champ a la main.
  useEffect(() => {
    if (!hasNrn) return;
    if (editedRef.current.has("nrn")) return;
    const prefix = nissPrefixFromIso(effectiveBirth);
    if (!prefix) return;
    setValues((v) => {
      const cur = v.nrn ?? "";
      // ne reecrit que si vide ou si c'etait un prefixe auto precedent
      if (cur === "" || cur.length <= 6) return { ...v, nrn: prefix };
      return v;
    });
  }, [effectiveBirth, hasNrn]);

  // 2) Code postal -> ville : auto-detection (table locale instantanee + API).
  useEffect(() => {
    if (!hasCity) return;
    const code = (values.postal_code ?? "").trim();
    if (!isBePostalCode(code)) return;
    if (editedRef.current.has("city")) return; // l'utilisateur a tape sa ville
    // instantane si connu localement
    const local = localBeCity(code);
    if (local) {
      setValues((v) => ({ ...v, city: local }));
      setCityAuto(true);
      void autosave("city", local);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const city = await lookupBeCity(code);
      if (cancelled || !city) return;
      if (editedRef.current.has("city")) return;
      setValues((v) => ({ ...v, city }));
      setCityAuto(true);
      void autosave("city", city);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [values.postal_code, hasCity]);

  function setField(key: string, val: string, manual = true) {
    if (manual) editedRef.current.add(key);
    if (key === "city" && manual) setCityAuto(false);
    setValues((v) => ({ ...v, [key]: val }));
  }

  const ibanRaw = values.iban ?? "";
  const ibanStatus: "empty" | "ok" | "bad" =
    ibanRaw.trim() === "" ? "empty" : ibanIsValid(ibanRaw) ? "ok" : "bad";

  // Bifurcation : pour un candidat, on masque les champs "non-étudiant" (état
  // civil / enfants = précompte) tant qu'il n'a pas choisi « Non-étudiant ».
  const visibleFields = isCandidate
    ? ordered.filter((f) => !(NON_STUDENT_ONLY.has(f.key) && isStudent !== "false"))
    : ordered;

  function validateStep1(): string | null {
    const filled = ordered.filter((f) => (values[f.key] ?? "").trim());
    if (filled.length === 0 && !(isCandidate && isStudent)) return "Renseigne au moins une information.";
    if (ibanStatus === "bad") return "L'IBAN saisi n'est pas valide. Vérifie-le avant d'enregistrer.";
    // Karim 2026-06-15 : âge minimum 17 ans.
    if ((values.birth_date ?? "").trim() && values.birth_date > maxBirth) return "La date de naissance doit correspondre à au moins 17 ans.";
    return null;
  }

  function currentPayload(): Record<string, string> {
    const payload = { ...values };
    if (payload.iban) payload.iban = normalizeIban(payload.iban);
    // Karim 2026-07-04 (debug) : ne PAS persister un NISS incomplet (le champ est
    // pré-rempli avec 6 chiffres AAMMJJ) — sinon un stub serait enregistré comme
    // complet et fausserait "Dossier COMPLET".
    if (payload.nrn && normalizeNRN(payload.nrn).length < 11) delete payload.nrn;
    if (isCandidate && isStudent) payload.is_student = isStudent;
    return payload;
  }

  // Employé : enregistre + clôture directement (pas d'étape 2).
  function submit() {
    setErr(null);
    const v = validateStep1();
    if (v) { setErr(v); return; }
    start(async () => {
      const r = await submitContractInfoAction(token, currentPayload());
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  // Candidat : valide l'étape 1, persiste (sans clôturer), passe à l'étape 2.
  function goToStep2() {
    setErr(null);
    if (isCandidate && !isStudent) { setErr("Indique d'abord si tu es étudiant(e) ou non."); return; }
    const v = validateStep1();
    if (v) { setErr(v); return; }
    start(async () => {
      await autosaveContractInfoAction(token, currentPayload());
      setStep(2);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    });
  }

  // Candidat : clôture le dossier après l'étape 2 (indisponibilités).
  function finish() {
    setErr(null);
    start(async () => {
      const r = await submitContractInfoAction(token, currentPayload());
      if (r.ok) setDone(true);
      else setErr(r.error ?? "Une erreur est survenue.");
    });
  }

  if (done) {
    // Karim 2026-07-03 : écran de fin HONNÊTE — on ne fait pas croire que tout est
    // complet si des champs demandés manquent encore. On remercie, on liste ce qui
    // reste, on rappelle que le MÊME lien permet de compléter jusqu'à finalisation.
    // Karim 2026-07-04 (debug) : facultatifs exclus des "manquants" ; NISS compté
    // manquant tant qu'il n'a pas 11 chiffres (le préfixe auto ne compte pas).
    const OPTIONAL_FIELDS = new Set(["education_level", "transport_price"]);
    const stillMissing = (isCandidate
      ? ordered.filter((f) => !(NON_STUDENT_ONLY.has(f.key) && isStudent !== "false"))
      : ordered
    ).filter((f) => {
      if (OPTIONAL_FIELDS.has(f.key)) return false;
      if (f.key === "nrn") return normalizeNRN(values.nrn ?? "").length < 11;
      return (values[f.key] ?? "").trim() === "";
    });
    const complete = stillMissing.length === 0;
    const link = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="py-4">
        <div className="text-center">
          <div className={`inline-flex h-14 w-14 rounded-full items-center justify-center mb-3 ${complete ? "bg-success-light text-success" : "bg-gold-light text-gold-dark"}`}>
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">Merci {firstName} !</h2>
        </div>

        {complete ? (
          <p className="text-sm text-ink-2 mt-2 text-center">
            Votre dossier est <b>complet</b> et a bien été transmis à notre service RH.{isCandidate ? (
              <> Votre engagement n&apos;est <b>pas encore effectif</b> : il le deviendra une fois la déclaration Dimona effectuée et votre contrat validé par le secrétariat social. Nous revenons vers vous très prochainement.</>
            ) : (
              <> Notre équipe RH poursuit le traitement de votre dossier.</>
            )}
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-ink-2">
              Vos informations ont bien été enregistrées, et nous vous en remercions. Pour <b>finaliser votre dossier</b>,
              il reste toutefois quelques éléments à compléter :
            </p>
            <ul className="rounded-lg border border-gold/40 bg-gold-light/30 p-3 text-sm text-ink space-y-1">
              {stillMissing.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-dark inline-block" /> {f.label}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">
              Vous pouvez les renseigner à tout moment, à votre rythme, via ce <b>même lien sécurisé</b> — il reste
              valable jusqu&apos;à la finalisation complète de votre dossier :
            </p>
            {link ? (
              <div className="rounded-lg border border-line bg-surface-2 p-2 text-[11px] text-ink-2 break-all font-mono">{link}</div>
            ) : null}
            <button
              type="button"
              onClick={() => { setDone(false); setStep(1); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); }}
              className="w-full rounded-xl bg-ink text-canvas font-bold py-3 text-sm active:scale-[0.98] transition-all"
            >
              Compléter maintenant
            </button>
          </div>
        )}
      </div>
    );
  }

  // Candidat — ÉTAPE 2 : indisponibilités (après validation de l'étape 1).
  if (isCandidate && step === 2) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => { setStep(1); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); }}
          className="text-xs font-semibold text-ink-3 hover:text-ink"
        >
          ← Revenir à mes informations
        </button>
        <div>
          <div className="text-sm font-bold text-ink mb-1">Ta carte d&apos;identité (recto + verso)</div>
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            Photographie ta carte dans le cadre — recto puis verso. Les deux faces sont fusionnées en un seul PDF transmis au service RH.
          </p>
          <IdCardUpload kind="token" token={token} existing={idCardExisting} />
        </div>
        <UnavailabilitiesStep token={token} initialItems={initialUnavailabilities} onDone={finish} />
        {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}
        {pending ? (
          <div className="flex items-center justify-center gap-2 text-xs text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isCandidate ? (
        <div>
          <label className="block text-xs font-semibold text-ink-2 mb-1 flex items-center gap-1">
            Ton statut
            {savingKey === "is_student" ? (
              <span className="ml-auto text-[10px] text-ink-3">enregistrement…</span>
            ) : savedKeys.has("is_student") || isStudent ? (
              <Check className="h-3.5 w-3.5 text-success ml-auto" />
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "false", l: "Non-étudiant" },
              { v: "true", l: "Étudiant" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => { setIsStudent(o.v); void saveStudent(o.v); }}
                className={[
                  "rounded-lg border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors",
                  isStudent === o.v ? "border-success bg-success-light text-ink" : "border-line bg-surface text-ink-2 hover:border-gold",
                ].join(" ")}
              >
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-3 mt-1">
            Nécessaire pour le secrétariat social (contrat étudiant vs travailleur ordinaire).
          </p>
          {isStudent === "true" ? (
            <div className="mt-2 rounded-lg border border-gold/40 bg-gold-light/40 p-2 text-[11px] text-ink-2">
              <b>Contrat d&apos;occupation étudiant</b> : max 600 h/an à cotisation réduite. Le RH vérifiera avec toi
              ton établissement et tes heures étudiant déjà utilisées cette année lors du pré-entretien.
              {" "}Si tu es aussi au CPAS, préviens ton assistant(e) social(e) : un job étudiant peut impacter ton
              revenu d&apos;intégration.
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleFields.map((f) => {
        const isIban = f.key === "iban";
        const isCity = f.key === "city";
        const opts = SELECT_OPTIONS[f.key];
        // Karim 2026-06-17 : vert dès que le champ est rempli (hors IBAN qui a sa
        // propre validation mod-97).
        const filled = (values[f.key] ?? "").trim() !== "";
        return (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-ink-2 mb-1 flex items-center gap-1">
              {f.label}
              {isCandidate && f.key === "address" ? (
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={geoLoading}
                  title="Détecter mon adresse à partir de ma position"
                  className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gold-dark hover:underline disabled:opacity-50"
                >
                  {geoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span aria-hidden>📍</span>}
                  ma position
                </button>
              ) : null}
              {isCity && cityAuto ? (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-success">
                  <Sparkles className="h-3 w-3" /> auto
                </span>
              ) : null}
              {savingKey === f.key ? (
                <span className="ml-auto text-[10px] text-ink-3">enregistrement…</span>
              ) : savedKeys.has(f.key) ? (
                <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-success">
                  <Check className="h-3 w-3" /> enregistré
                </span>
              ) : filled && !isIban ? (
                <Check className="h-3.5 w-3.5 text-success ml-auto" />
              ) : null}
            </label>

            <div className="relative">
              {isIban ? (
                <IbanField
                  value={values.iban ?? ""}
                  onChange={(v) => setField("iban", v)}
                  onBlur={() => void autosave("iban", values.iban ?? "")}
                />
              ) : f.key === "birth_date" ? (
                <BirthDatePicker
                  value={values.birth_date ?? ""}
                  maxIso={maxBirth}
                  onChange={(v) => { setField("birth_date", v); void autosave("birth_date", v); }}
                />
              ) : opts ? (
                <select
                  value={values[f.key] ?? ""}
                  onChange={(e) => { setField(f.key, e.target.value); void autosave(f.key, e.target.value); }}
                  className={[
                    "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                    filled ? "border-success" : "border-line focus:border-gold",
                  ].join(" ")}
                >
                  {opts.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.value === ""}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={inputType(f.key)}
                  inputMode={f.key === "postal_code" || f.key === "transport_price" ? "numeric" : undefined}
                  max={f.key === "birth_date" ? maxBirth : undefined}
                  value={values[f.key] ?? ""}
                  placeholder={placeholder(f.key)}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => void autosave(f.key, values[f.key] ?? "")}
                  className={[
                    "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                    filled ? "border-success" : "border-line focus:border-gold",
                  ].join(" ")}
                />
              )}
            </div>

            {f.key === "nrn" ? (
              (() => {
                const raw = normalizeNRN(values.nrn ?? "");
                if (raw.length === 0) {
                  return <p className="text-[11px] text-ink-3 mt-1">Pré-rempli avec ta date de naissance (AAMMJJ) — complète les chiffres restants.</p>;
                }
                const v = validateNRN(values.nrn ?? "");
                if (v.valid) {
                  return <p className="text-[11px] text-success font-semibold mt-1">✓ Numéro national belge validé.</p>;
                }
                // Incomplet (moins de 11 chiffres) : simple info, pas d'alerte.
                if (raw.length < 11) {
                  return <p className="text-[11px] text-ink-3 mt-1">Complète les 11 chiffres (format YY.MM.DD-NNN.CC).</p>;
                }
                // 11 chiffres mais checksum belge KO : signalé "non vérifié" (jamais silencieux).
                return <p className="text-[11px] text-warn font-semibold mt-1">⚠ Ce numéro ne correspond pas au format belge. Vérifie-le. S&apos;il s&apos;agit d&apos;un numéro étranger, c&apos;est normal — il sera contrôlé au pré-entretien.</p>;
              })()
            ) : FIELD_HINTS[f.key] ? (
              <p className="text-[11px] text-ink-3 mt-1">{FIELD_HINTS[f.key]}</p>
            ) : null}
          </div>
        );
      })}

      {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}

      <button
        type="button"
        onClick={isCandidate ? goToStep2 : submit}
        disabled={pending}
        className="w-full rounded-xl bg-ink text-canvas font-bold py-3 min-h-[52px] text-sm disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {isCandidate ? "Continuer → mes indisponibilités" : "Enregistrer mes informations"}
      </button>
      {isCandidate ? (
        <p className="text-center text-[11px] text-ink-3">Étape 1 sur 2 · tes infos sont déjà enregistrées au fur et à mesure</p>
      ) : null}
    </div>
  );
}
