"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, CheckCircle2, Check, Sparkles, Globe } from "lucide-react";
import { IbanField } from "@/components/iban-field";
import { submitContractInfoAction, autosaveContractInfoAction } from "./actions";
import { UnavailabilitiesStep } from "./unavailabilities-step";
import { IdCardUpload } from "@/components/id-card-upload";
import { BirthDatePicker } from "@/components/birth-date-picker";
import { reverseGeocodeAction } from "@/lib/geocode-actions";
import { isBePostalCode, localBeCity, lookupBeCity } from "@/lib/be-postal";
import { nissPrefixFromIso, isoMinusYears, validateNRN, normalizeNRN } from "@/lib/be-validators";
import { TRANSPORT_MODES, transportHasSubscription } from "@/lib/config";
import type { Locale } from "@/lib/i18n";
import { updateLanguagePreferenceAction } from "@/app/me/profile/language-action";

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

// Karim 2026-07-05 : formulaire candidat BILINGUE FR/NL. Toutes les chaînes
// visibles passent par le dictionnaire `T` (t = T[locale]). Le choix de langue
// est auto-détecté côté serveur (cookie `lang` ou en-tête accept-language) et
// passé en `initialLocale` ; le candidat peut basculer à tout moment (bascule
// instantanée en local + persistance best-effort du cookie).

// Nationalités : menu déroulant (zéro faute de frappe pour la Dimona). Les noms
// de nationalités ne se traduisent PAS (mêmes intitulés FR/NL).
const NATIONALITIES = [
  "Belge", "Marocaine", "Française", "Italienne", "Néerlandaise", "Espagnole",
  "Portugaise", "Turque", "Roumaine", "Polonaise", "Bulgare", "Allemande",
  "Congolaise (RDC)", "Algérienne", "Tunisienne", "Grecque", "Britannique",
  "Camerounaise", "Guinéenne", "Sénégalaise", "Rwandaise", "Ivoirienne",
  "Syrienne", "Afghane", "Pakistanaise", "Indienne", "Russe", "Ukrainienne",
  "Albanaise", "Serbe", "Croate", "Hongroise", "Tchèque", "Slovaque",
  "Autrichienne", "Suédoise", "Luxembourgeoise", "Suisse", "Américaine",
  "Brésilienne", "Chinoise", "Philippine",
];

// Labels de champs — override par la locale (indépendant du serveur : le prop
// `fields` reçoit les labels FR, on les surcharge par `f.key`).
const FIELD_LABELS: Record<string, { fr: string; nl: string }> = {
  full_name: { fr: "Nom complet", nl: "Volledige naam" },
  email: { fr: "Email", nl: "E-mail" },
  birth_date: { fr: "Date de naissance", nl: "Geboortedatum" },
  birth_place: { fr: "Lieu de naissance", nl: "Geboorteplaats" },
  nrn: { fr: "Numéro national (NISS)", nl: "Rijksregisternummer (INSZ)" },
  nationality: { fr: "Nationalité", nl: "Nationaliteit" },
  address: { fr: "Adresse", nl: "Adres" },
  postal_code: { fr: "Code postal", nl: "Postcode" },
  city: { fr: "Commune", nl: "Gemeente" },
  iban: { fr: "IBAN", nl: "IBAN" },
  education_level: { fr: "Niveau scolaire / dernier diplôme", nl: "Opleidingsniveau / laatste diploma" },
  marital_status: { fr: "État civil", nl: "Burgerlijke staat" },
  dependent_children: { fr: "Personnes à charge (nombre)", nl: "Personen ten laste (aantal)" },
  transport_type: { fr: "Moyen de transport", nl: "Vervoermiddel" },
  transport_frequency: { fr: "Abonnement transport", nl: "Vervoerabonnement" },
  transport_price: { fr: "Prix du transport (€)", nl: "Vervoerskosten (€)" },
};

// Karim 2026-07-03 : champs candidat réservés au parcours NON-ÉTUDIANT (précompte
// professionnel). Masqués pour un étudiant (régime/cotisations différents).
const NON_STUDENT_ONLY = new Set(["marital_status", "dependent_children"]);

// Karim 2026-07-05 : champs FACULTATIFS (ne bloquent pas la complétude du dossier).
// Utilisé pour l'écran de fin (stillMissing) ET pour la couleur d'alerte des champs
// vides : facultatif vide = alerte DOUCE (ambre) ; obligatoire vide = alerte FORTE (rouge).
const OPTIONAL_FIELDS = new Set(["education_level", "transport_price"]);

// Micro-explications (finalité) affichées sous certains champs candidat.
const FIELD_HINTS: Record<string, { fr: string; nl: string }> = {
  birth_date: {
    fr: "Tu dois avoir au moins 17 ans pour t'enregistrer.",
    nl: "Je moet minstens 17 jaar zijn om je te registreren.",
  },
  nationality: {
    fr: "Pour la déclaration Dimona (secrétariat social).",
    nl: "Voor de Dimona-aangifte (sociaal secretariaat).",
  },
  birth_place: {
    fr: "Figure sur ta carte d'identité — pour la Dimona.",
    nl: "Staat op je identiteitskaart — voor de Dimona.",
  },
  education_level: {
    fr: "Facultatif — utile pour évaluer ta candidature.",
    nl: "Optioneel — nuttig om je sollicitatie te beoordelen.",
  },
  marital_status: {
    fr: "Pour le calcul de ton précompte professionnel.",
    nl: "Voor de berekening van je bedrijfsvoorheffing.",
  },
  dependent_children: {
    fr: "Pour le calcul de ton précompte professionnel.",
    nl: "Voor de berekening van je bedrijfsvoorheffing.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Dictionnaire de traduction du formulaire (t = T[locale]).
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  fr: {
    // statut étudiant
    status_label: "Ton statut",
    saving: "enregistrement…",
    saved: "enregistré",
    optional: "facultatif",
    required_hint: "À compléter",
    non_student: "Non-étudiant",
    student: "Étudiant",
    status_hint: "Nécessaire pour le secrétariat social (contrat étudiant vs travailleur ordinaire).",
    student_warn_title: "Contrat d'occupation étudiant",
    student_hours_label: "Heures étudiant déjà utilisées en 2026",
    student_hours_hint: "Nombre d'heures de ton contingent étudiant (± 600 h/an) déjà prestées cette année, tous employeurs confondus. Requis pour le secrétariat social.",
    student_warn_body:
      " : max 600 h/an à cotisation réduite. Le RH vérifiera avec toi ton établissement et tes heures étudiant déjà utilisées cette année lors du pré-entretien. Si tu es aussi au CPAS, préviens ton assistant(e) social(e) : un job étudiant peut impacter ton revenu d'intégration.",
    // options de select
    choose: "— choisir —",
    freq_monthly: "Abonnement mensuel",
    freq_yearly: "Abonnement annuel",
    freq_none: "Sans abonnement",
    edu_none: "Sans diplôme",
    edu_lower_sec: "Secondaire inférieur",
    edu_upper_sec: "Secondaire supérieur (CESS)",
    edu_bachelor: "Bachelier",
    edu_master: "Master ou +",
    edu_other: "Autre",
    marital_single: "Célibataire",
    marital_married: "Marié(e)",
    marital_cohab: "Cohabitant(e) légal(e)",
    marital_divorced: "Divorcé(e)",
    marital_widowed: "Veuf / Veuve",
    nationality_other: "Autre (préciser dans les remarques)",
    // géoloc + indicateurs
    geo_button: "ma position",
    geo_button_title: "Détecter mon adresse à partir de ma position",
    auto: "auto",
    err_geo_unavailable: "Géolocalisation non disponible sur cet appareil.",
    err_geo_no_address: "On n'a pas pu détecter ton adresse automatiquement — saisis-la simplement juste en dessous.",
    err_geo_denied: "Autorise la localisation pour pré-remplir ton adresse.",
    err_geo_fail: "Localisation impossible pour le moment.",
    // validation
    err_at_least_one: "Renseigne au moins une information.",
    err_iban: "L'IBAN saisi n'est pas valide. Vérifie-le avant d'enregistrer.",
    err_min_age: "La date de naissance doit correspondre à au moins 17 ans.",
    err_generic: "Une erreur est survenue.",
    err_student_first: "Indique d'abord si tu es étudiant(e) ou non.",
    // NISS
    nrn_prefill: "Pré-rempli avec ta date de naissance (AAMMJJ) — complète les chiffres restants.",
    nrn_valid: "✓ Numéro national belge validé.",
    nrn_incomplete: "Complète les 11 chiffres (format YY.MM.DD-NNN.CC).",
    nrn_bad: "⚠ Ce numéro ne correspond pas au format belge. Vérifie-le. S'il s'agit d'un numéro étranger, c'est normal — il sera contrôlé au pré-entretien.",
    // boutons + pied
    btn_continue: "Continuer → mes indisponibilités",
    btn_save: "Enregistrer mes informations",
    step_footer: "Étape 1 sur 2 · tes infos sont déjà enregistrées au fur et à mesure",
    rgpd: "Tes données sont traitées pour préparer ton embauche et prévenir la fraude (RGPD — intérêt légitime), et conservées selon les délais légaux. La géolocalisation ne sert qu'à te proposer ton adresse.",
    // étape 2
    back_to_info: "← Revenir à mes informations",
    id_card_title: "Ta carte d'identité (recto + verso)",
    id_card_body: "Photographie ta carte dans le cadre — recto puis verso. Les deux faces sont fusionnées en un seul PDF transmis au service RH.",
    add_something_title: "Souhaites-tu ajouter quelque chose ?",
    add_something_body: "Facultatif — une précision, ta nationalité si tu as choisi « Autre », une disponibilité particulière…",
    notes_placeholder: "Écris ici ce que tu veux ajouter (facultatif)…",
    saving_full: "Enregistrement…",
    // écran de fin
    thanks: "Merci",
    done_complete_pre: "Votre dossier est ",
    done_complete_word: "complet",
    done_complete_post: " et a bien été transmis à notre service RH.",
    done_candidate_pre: " Votre engagement n'est ",
    done_candidate_word: "pas encore effectif",
    done_candidate_post: " : il le deviendra une fois la déclaration Dimona effectuée et votre contrat validé par le secrétariat social. Nous revenons vers vous très prochainement.",
    done_employee_post: " Notre équipe RH poursuit le traitement de votre dossier.",
    done_incomplete_pre: "Vos informations ont bien été enregistrées, et nous vous en remercions. Pour ",
    done_incomplete_word: "finaliser votre dossier",
    done_incomplete_post: ", il reste toutefois quelques éléments à compléter :",
    done_note_pre: "Vous pouvez les renseigner à tout moment, à votre rythme, via ce ",
    done_note_word: "même lien sécurisé",
    done_note_post: " — il reste valable jusqu'à la finalisation complète de votre dossier :",
    done_complete_now: "Compléter maintenant",
  },
  nl: {
    status_label: "Je statuut",
    saving: "opslaan…",
    saved: "opgeslagen",
    optional: "optioneel",
    required_hint: "In te vullen",
    non_student: "Niet-student",
    student: "Student",
    status_hint: "Nodig voor het sociaal secretariaat (studentencontract vs gewone werknemer).",
    student_warn_title: "Studentenovereenkomst",
    student_hours_label: "Al gebruikte studentenuren in 2026",
    student_hours_hint: "Aantal uren van je studentencontingent (± 600 u/jaar) dat je dit jaar al hebt gepresteerd, bij alle werkgevers samen. Vereist voor het sociaal secretariaat.",
    student_warn_body:
      ": max. 600 u/jaar aan verlaagde bijdrage. HR bekijkt tijdens het voorgesprek samen met jou je onderwijsinstelling en de studentenuren die je dit jaar al gebruikt hebt. Ben je ook bij het OCMW, verwittig dan je maatschappelijk werker: een studentenjob kan je leefloon beïnvloeden.",
    choose: "— kiezen —",
    freq_monthly: "Maandabonnement",
    freq_yearly: "Jaarabonnement",
    freq_none: "Geen abonnement",
    edu_none: "Zonder diploma",
    edu_lower_sec: "Lager secundair",
    edu_upper_sec: "Hoger secundair (GHSO)",
    edu_bachelor: "Bachelor",
    edu_master: "Master of hoger",
    edu_other: "Andere",
    marital_single: "Ongehuwd",
    marital_married: "Gehuwd",
    marital_cohab: "Wettelijk samenwonend",
    marital_divorced: "Gescheiden",
    marital_widowed: "Weduwnaar / weduwe",
    nationality_other: "Andere (vermeld in de opmerkingen)",
    geo_button: "mijn locatie",
    geo_button_title: "Mijn adres detecteren op basis van mijn locatie",
    auto: "auto",
    err_geo_unavailable: "Geolocatie niet beschikbaar op dit toestel.",
    err_geo_no_address: "We konden je adres niet automatisch detecteren — vul het gewoon hieronder in.",
    err_geo_denied: "Sta locatie toe om je adres vooraf in te vullen.",
    err_geo_fail: "Locatie is momenteel niet mogelijk.",
    err_at_least_one: "Vul minstens één gegeven in.",
    err_iban: "De ingevoerde IBAN is niet geldig. Controleer hem voordat je opslaat.",
    err_min_age: "De geboortedatum moet overeenkomen met minstens 17 jaar.",
    err_generic: "Er is een fout opgetreden.",
    err_student_first: "Geef eerst aan of je student bent of niet.",
    nrn_prefill: "Vooraf ingevuld met je geboortedatum (JJMMDD) — vul de resterende cijfers aan.",
    nrn_valid: "✓ Belgisch rijksregisternummer gevalideerd.",
    nrn_incomplete: "Vul de 11 cijfers aan (formaat JJ.MM.DD-NNN.CC).",
    nrn_bad: "⚠ Dit nummer komt niet overeen met het Belgische formaat. Controleer het. Gaat het om een buitenlands nummer, dan is dat normaal — het wordt gecontroleerd tijdens het voorgesprek.",
    btn_continue: "Verder → mijn onbeschikbaarheden",
    btn_save: "Mijn gegevens opslaan",
    step_footer: "Stap 1 van 2 · je gegevens worden gaandeweg al opgeslagen",
    rgpd: "Je gegevens worden verwerkt om je aanwerving voor te bereiden en fraude te voorkomen (AVG — gerechtvaardigd belang), en worden bewaard volgens de wettelijke termijnen. De geolocatie dient enkel om je je adres voor te stellen.",
    back_to_info: "← Terug naar mijn gegevens",
    id_card_title: "Je identiteitskaart (voor- + achterkant)",
    id_card_body: "Fotografeer je kaart in het kader — eerst de voorkant, dan de achterkant. Beide zijden worden samengevoegd tot één pdf die naar de HR-dienst wordt gestuurd.",
    add_something_title: "Wil je nog iets toevoegen?",
    add_something_body: "Optioneel — een verduidelijking, je nationaliteit als je 'Andere' koos, een bijzondere beschikbaarheid…",
    notes_placeholder: "Schrijf hier wat je wilt toevoegen (optioneel)…",
    saving_full: "Opslaan…",
    thanks: "Bedankt",
    done_complete_pre: "Je dossier is ",
    done_complete_word: "volledig",
    done_complete_post: " en is goed doorgestuurd naar onze HR-dienst.",
    done_candidate_pre: " Je indiensttreding is ",
    done_candidate_word: "nog niet effectief",
    done_candidate_post: ": dat wordt ze zodra de Dimona-aangifte is gebeurd en je contract door het sociaal secretariaat is goedgekeurd. We nemen zeer binnenkort contact met je op.",
    done_employee_post: " Ons HR-team zet de behandeling van je dossier voort.",
    done_incomplete_pre: "Je gegevens zijn goed opgeslagen, waarvoor onze dank. Om ",
    done_incomplete_word: "je dossier af te ronden",
    done_incomplete_post: ", moeten er toch nog enkele gegevens worden aangevuld:",
    done_note_pre: "Je kunt ze op elk moment aanvullen, op je eigen tempo, via deze ",
    done_note_word: "zelfde beveiligde link",
    done_note_post: " — hij blijft geldig tot je dossier volledig is afgerond:",
    done_complete_now: "Nu aanvullen",
  },
} as const;

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
function placeholder(key: string, locale: Locale): string {
  switch (key) {
    case "iban": return "BE.. .... .... ....";
    case "nrn": return locale === "nl" ? "JJ.MM.DD-XXX.CC" : "AA.MM.JJ-XXX.CC";
    case "postal_code": return "1000";
    case "city": return locale === "nl" ? "Brussel" : "Bruxelles";
    case "address": return locale === "nl" ? "Straat, nummer" : "Rue, numéro";
    case "transport_price": return "52.00";
    case "nationality": return locale === "nl" ? "Belg, Marokkaans…" : "Belge, Marocaine…";
    case "birth_place": return locale === "nl" ? "Geboortestad" : "Ville de naissance";
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

// Sélecteur FR/NL clair (fond CLAIR — actif doré, inactif texte grisé + bordure).
function LocaleSwitch({ locale, onPick }: { locale: Locale; onPick: (l: Locale) => void }) {
  return (
    <div
      role="group"
      aria-label="Langue / Taal"
      className="inline-flex items-stretch rounded-md border border-line overflow-hidden text-[11px] font-bold tracking-wider"
    >
      {(["fr", "nl"] as const).map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onPick(l)}
            aria-pressed={active}
            title={l === "fr" ? "Français" : "Nederlands"}
            className={[
              "px-2.5 py-1 uppercase transition-colors min-w-[30px]",
              active ? "bg-gold text-ink" : "text-ink-3 hover:bg-surface-2",
            ].join(" ")}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// Karim 2026-07-05 : intro/sous-titre candidat rendus CÔTÉ CLIENT (basculent avec la
// langue, sans reload). Retirés du rendu serveur (page.tsx) pour éviter le "reste en
// français".
const INTRO_T = {
  fr: {
    subtitle: "Complète ton dossier RH",
    hi: "Bonjour",
    body_cand: ", bienvenue chez Caftan Factory 👋 Merci de renseigner ci-dessous les informations nécessaires à ton embauche. Tu peux le faire à ton rythme — chaque champ est enregistré au fur et à mesure.",
    body_emp: ", pour finaliser ton dossier et préparer ton contrat, merci de compléter les éléments ci-dessous. Ça prend une minute 🙏",
  },
  nl: {
    subtitle: "Vul je HR-dossier aan",
    hi: "Hallo",
    body_cand: ", welkom bij Caftan Factory 👋 Vul hieronder de gegevens in die nodig zijn voor je aanwerving. Je kunt dit op je eigen tempo doen — elk veld wordt gaandeweg opgeslagen.",
    body_emp: ", om je dossier af te ronden en je contract voor te bereiden, vul hieronder de gegevens aan. Het duurt maar een minuutje 🙏",
  },
} as const;

// Karim 2026-07-05 : barre de langue COHÉRENTE en haut de chaque écran du parcours
// (étapes 1, 2 et fin). Le sélecteur est bien visible et aligné à droite ; à gauche,
// soit un libellé « Langue / Taal », soit une action contextuelle (ex. retour étape).
function LangBar({
  locale,
  onPick,
  left,
}: {
  locale: Locale;
  onPick: (l: Locale) => void;
  left?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-line">
      {left ?? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3">
          <Globe className="h-3.5 w-3.5" /> Langue / Taal
        </span>
      )}
      <LocaleSwitch locale={locale} onPick={onPick} />
    </div>
  );
}

export function ContractInfoForm({
  token,
  fields,
  firstName,
  birthDate,
  isCandidate = false,
  initialLocale = "fr",
  initialIsStudent = null,
  initialUnavailabilities = [],
  idCardExisting = null,
  initialValues = {},
}: {
  token: string;
  fields: Field[];
  firstName: string;
  birthDate?: string | null;
  isCandidate?: boolean;
  initialLocale?: Locale;
  // Karim 2026-07-05 : valeurs déjà saisies -> pré-remplissage pour permettre la
  // CORRECTION de n'importe quel champ (pas seulement les manquants).
  initialValues?: Record<string, string>;
  initialIsStudent?: boolean | null;
  initialUnavailabilities?: CandidateUnavailability[];
  idCardExisting?: { fileName: string; at: string } | null;
}) {
  // Langue : bascule INSTANTANÉE côté client (aucun rechargement). Karim 2026-07-05 :
  // le reload perdait la progression (étape en cours / écran "dossier complet" qui
  // se ré-ouvrait). Tout le texte candidat est désormais rendu par CE composant
  // (intro/sous-titre inclus) -> il suit la locale sans reload. Le cookie est juste
  // mémorisé pour la prochaine visite.
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = T[locale];
  function pickLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next); // bascule immédiate, aucune perte d'état
    void updateLanguagePreferenceAction(next); // mémorise le choix (cookie `lang`), fire-and-forget
  }

  // Étape 2 (candidat uniquement) : déclaration des indisponibilités.
  const [step, setStep] = useState<1 | 2>(1);
  const ordered = useMemo(
    () => [...fields].sort((a, b) => FIELD_ORDER.indexOf(a.key) - FIELD_ORDER.indexOf(b.key)),
    [fields],
  );

  const [values, setValues] = useState<Record<string, string>>(initialValues);
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

  // Options des <select> — dépendantes de la locale (valeurs stables, labels traduits).
  const selectOptions: Record<string, { value: string; label: string }[]> = {
    transport_type: [
      { value: "", label: t.choose },
      ...TRANSPORT_MODES.map((m) => ({ value: m, label: m })),
    ],
    transport_frequency: [
      { value: "", label: t.choose },
      { value: "mensuel", label: t.freq_monthly },
      { value: "annuel", label: t.freq_yearly },
      { value: "sans_objet", label: t.freq_none },
    ],
    education_level: [
      { value: "", label: t.choose },
      { value: "sans_diplome", label: t.edu_none },
      { value: "secondaire_inferieur", label: t.edu_lower_sec },
      { value: "secondaire_superieur", label: t.edu_upper_sec },
      { value: "bachelier", label: t.edu_bachelor },
      { value: "master", label: t.edu_master },
      { value: "autre", label: t.edu_other },
    ],
    marital_status: [
      { value: "", label: t.choose },
      { value: "celibataire", label: t.marital_single },
      { value: "marie", label: t.marital_married },
      { value: "cohabitant_legal", label: t.marital_cohab },
      { value: "divorce", label: t.marital_divorced },
      { value: "veuf", label: t.marital_widowed },
    ],
    nationality: [
      { value: "", label: t.choose },
      ...NATIONALITIES.map((n) => ({ value: n, label: n })),
      { value: "Autre", label: t.nationality_other },
    ],
  };

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
      setErr(t.err_geo_unavailable);
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverseGeocodeAction(pos.coords.latitude, pos.coords.longitude);
          if (!r.ok) {
            // Karim 2026-07-05 : JAMAIS de warning technique au candidat -> message
            // amical + on log le détail pour nous.
            console.warn("[geoloc]", r.error);
            setErr(t.err_geo_no_address);
            return;
          }
          if (r.address) { setField("address", r.address); void autosave("address", r.address); }
          if (r.postal_code) { setField("postal_code", r.postal_code); void autosave("postal_code", r.postal_code); }
          if (r.city) { setField("city", r.city, false); setCityAuto(true); void autosave("city", r.city); }
        } finally {
          setGeoLoading(false);
        }
      },
      (e) => {
        setGeoLoading(false);
        setErr(e.code === 1 ? t.err_geo_denied : t.err_geo_fail);
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
    const timer = setTimeout(async () => {
      const city = await lookupBeCity(code);
      if (cancelled || !city) return;
      if (editedRef.current.has("city")) return;
      setValues((v) => ({ ...v, city }));
      setCityAuto(true);
      void autosave("city", city);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
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
  // Karim 2026-07-05 : périodicité + prix d'abonnement N'ONT DE SENS que pour un
  // transport PUBLIC. Pour vélo/marche/voiture/scooter (sans abonnement), on masque
  // ces 2 champs -> plus de « périodicité de l'abonnement » incohérente.
  const showTransportSub = transportHasSubscription(values.transport_type);
  const visibleFields = (isCandidate
    ? ordered.filter((f) => !(NON_STUDENT_ONLY.has(f.key) && isStudent !== "false"))
    : ordered
  ).filter((f) => !((f.key === "transport_frequency" || f.key === "transport_price") && !showTransportSub));

  function validateStep1(): string | null {
    const filled = ordered.filter((f) => (values[f.key] ?? "").trim());
    // Karim 2026-07-07 (BUG bloquant) : ne PLUS bloquer quand il n'y a AUCUN champ à
    // remplir (dossier déjà complet -> ordered vide) ni quand tout est déjà saisi.
    // Avant : un dossier complet renvoyait "Renseigne au moins une information" et
    // refusait de passer à l'écran de soumission. On ne bloque plus que si le
    // formulaire présente des champs ET qu'aucun n'est rempli (vraie page vide).
    if (ordered.length > 0 && filled.length === 0 && !(isCandidate && isStudent)) return t.err_at_least_one;
    if (ibanStatus === "bad") return t.err_iban;
    // Karim 2026-06-15 : âge minimum 17 ans.
    if ((values.birth_date ?? "").trim() && values.birth_date > maxBirth) return t.err_min_age;
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
      else setErr(r.error ?? t.err_generic);
    });
  }

  // Candidat : valide l'étape 1, persiste (sans clôturer), passe à l'étape 2.
  function goToStep2() {
    setErr(null);
    if (isCandidate && !isStudent) { setErr(t.err_student_first); return; }
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
      // Karim 2026-07-05 : le mail récap+confirmation est désormais déclenché CÔTÉ
      // SERVEUR dans submitContractInfoAction (fiable + loggé) -> plus d'appel client.
      if (r.ok) setDone(true);
      else setErr(r.error ?? t.err_generic);
    });
  }

  if (done) {
    // Karim 2026-07-03 : écran de fin HONNÊTE — on ne fait pas croire que tout est
    // complet si des champs demandés manquent encore. On remercie, on liste ce qui
    // reste, on rappelle que le MÊME lien permet de compléter jusqu'à finalisation.
    // Karim 2026-07-04 (debug) : facultatifs exclus des "manquants" ; NISS compté
    // manquant tant qu'il n'a pas 11 chiffres (le préfixe auto ne compte pas).
    // (OPTIONAL_FIELDS est désormais défini au niveau module — partagé avec la
    // couleur d'alerte des champs vides.)
    const stillMissing = (isCandidate
      ? ordered.filter((f) => !(NON_STUDENT_ONLY.has(f.key) && isStudent !== "false"))
      : ordered
    ).filter((f) => {
      if (OPTIONAL_FIELDS.has(f.key)) return false;
      // Sans abonnement (vélo, marche…) : périodicité + prix non requis.
      if ((f.key === "transport_frequency" || f.key === "transport_price") && !transportHasSubscription(values.transport_type)) return false;
      if (f.key === "nrn") return normalizeNRN(values.nrn ?? "").length < 11;
      return (values[f.key] ?? "").trim() === "";
    });
    // Karim 2026-07-05 : heures étudiant 2026 OBLIGATOIRES pour un étudiant.
    if (isCandidate && isStudent === "true" && (values.student_hours_used_2026 ?? "").trim() === "") {
      stillMissing.push({ key: "student_hours_used_2026", label: locale === "nl" ? "Al gebruikte studentenuren in 2026" : "Heures étudiant déjà utilisées en 2026" });
    }
    const complete = stillMissing.length === 0;
    const link = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="py-4">
        <LangBar locale={locale} onPick={pickLocale} />
        <div className="text-center">
          <div className={`inline-flex h-14 w-14 rounded-full items-center justify-center mb-3 ${complete ? "bg-success-light text-success" : "bg-gold-light text-gold-dark"}`}>
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-ink">{t.thanks} {firstName} !</h2>
        </div>

        {complete ? (
          <>
            <p className="text-sm text-ink-2 mt-2 text-center">
              {t.done_complete_pre}<b>{t.done_complete_word}</b>{t.done_complete_post}{isCandidate ? (
                <>{t.done_candidate_pre}<b>{t.done_candidate_word}</b>{t.done_candidate_post}</>
              ) : (
                <>{t.done_employee_post}</>
              )}
            </p>
            {/* Karim 2026-07-05 : prochaine étape MISE EN ÉVIDENCE — mail envoyé +
                confirmation OBLIGATOIRE pour finaliser. */}
            {isCandidate ? (
              <div className="mt-3 rounded-xl border-2 border-gold bg-gold-light/40 p-3.5 text-sm text-ink">
                <div className="font-bold flex items-start gap-1.5">
                  <span aria-hidden>📧</span>
                  <span>{locale === "nl" ? "Een samenvattende e-mail is naar je verstuurd" : "Un e-mail récapitulatif vient de t'être envoyé"}</span>
                </div>
                <p className="mt-1.5 text-ink-2 leading-relaxed">
                  {locale === "nl" ? (
                    <>Belangrijk : controleer je gegevens en klik op <b className="text-ink">« Ik bevestig »</b> in de e-mail om je kandidatuur <b className="text-ink">DEFINITIEF</b> te bevestigen. Een fout? Corrigeer via dezelfde link.</>
                  ) : (
                    <>Important : vérifie tes informations et clique sur <b className="text-ink">« Je confirme »</b> dans l&apos;e-mail pour valider <b className="text-ink">DÉFINITIVEMENT</b> ta candidature. Une erreur ? Corrige via le même lien.</>
                  )}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-ink-2">
              {t.done_incomplete_pre}<b>{t.done_incomplete_word}</b>{t.done_incomplete_post}
            </p>
            <ul className="rounded-lg border border-gold/40 bg-gold-light/30 p-3 text-sm text-ink space-y-1">
              {stillMissing.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-dark inline-block" /> {FIELD_LABELS[f.key]?.[locale] ?? f.label}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">
              {t.done_note_pre}<b>{t.done_note_word}</b>{t.done_note_post}
            </p>
            {link ? (
              <div className="rounded-lg border border-line bg-surface-2 p-2 text-[11px] text-ink-2 break-all font-mono">{link}</div>
            ) : null}
            <button
              type="button"
              onClick={() => { setDone(false); setStep(1); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); }}
              className="w-full rounded-xl bg-ink text-canvas font-bold py-3 text-sm active:scale-[0.98] transition-all"
            >
              {t.done_complete_now}
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
        <LangBar
          locale={locale}
          onPick={pickLocale}
          left={
            <button
              type="button"
              onClick={() => { setStep(1); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); }}
              className="text-xs font-semibold text-ink-3 hover:text-ink"
            >
              {t.back_to_info}
            </button>
          }
        />
        <div>
          <div className="text-sm font-bold text-ink mb-1">{t.id_card_title}</div>
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            {t.id_card_body}
          </p>
          <IdCardUpload kind="token" token={token} existing={idCardExisting} />
        </div>
        <UnavailabilitiesStep token={token} initialItems={initialUnavailabilities} onDone={finish} />
        {/* Karim 2026-07-05 : la « case pour ajouter quelque chose » vit ICI, à la
            toute fin du parcours (plus au milieu), avec un vrai champ de saisie. */}
        <div>
          <div className="text-sm font-bold text-ink mb-1">{t.add_something_title}</div>
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            {t.add_something_body}
          </p>
          <textarea
            value={values.notes ?? ""}
            onChange={(e) => setField("notes", e.target.value)}
            onBlur={() => void autosave("notes", values.notes ?? "")}
            rows={3}
            placeholder={t.notes_placeholder}
            className="w-full rounded-lg border-[1.5px] border-line bg-surface px-3 py-2 text-sm outline-none focus:border-gold resize-y"
          />
        </div>
        {err ? <div className="text-xs text-danger font-semibold">{err}</div> : null}
        {pending ? (
          <div className="flex items-center justify-center gap-2 text-xs text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.saving_full}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LangBar locale={locale} onPick={pickLocale} />
      <div className="mb-1">
        <div className="text-sm font-bold text-ink">{INTRO_T[locale].subtitle}</div>
        <p className="text-sm text-ink-2 leading-relaxed mt-1">
          {INTRO_T[locale].hi}
          {firstName ? <> <b className="text-ink">{firstName}</b></> : null}
          {isCandidate ? INTRO_T[locale].body_cand : INTRO_T[locale].body_emp}
        </p>
      </div>
      {isCandidate ? (
        <div>
          <label className="block text-xs font-semibold text-ink-2 mb-1 flex items-center gap-1">
            {t.status_label}
            {savingKey === "is_student" ? (
              <span className="ml-auto text-[10px] text-ink-3">{t.saving}</span>
            ) : savedKeys.has("is_student") || isStudent ? (
              <Check className="h-3.5 w-3.5 text-success ml-auto" />
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "false", l: t.non_student },
              { v: "true", l: t.student },
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
            {t.status_hint}
          </p>
          {isStudent === "true" ? (
            <div className="mt-2 rounded-lg border border-gold/40 bg-gold-light/40 p-2 text-[11px] text-ink-2">
              <b>{t.student_warn_title}</b>{t.student_warn_body}
            </div>
          ) : null}
          {/* Karim 2026-07-05 : heures étudiant déjà consommées en 2026 — OBLIGATOIRE
              pour un étudiant (contingent ~600h/an, secrétariat social). */}
          {isStudent === "true" ? (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                {t.student_hours_label} <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={values.student_hours_used_2026 ?? ""}
                onChange={(e) => setField("student_hours_used_2026", e.target.value)}
                onBlur={() => void autosave("student_hours_used_2026", values.student_hours_used_2026 ?? "")}
                placeholder="0"
                className={[
                  "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                  (values.student_hours_used_2026 ?? "").trim() ? "border-success" : "border-danger",
                ].join(" ")}
              />
              <p className="text-[11px] text-ink-3 mt-1">{t.student_hours_hint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleFields.map((f) => {
        const isIban = f.key === "iban";
        const isCity = f.key === "city";
        const opts = selectOptions[f.key];
        // Karim 2026-06-17 : vert dès que le champ est rempli (hors IBAN qui a sa
        // propre validation mod-97).
        const filled = (values[f.key] ?? "").trim() !== "";
        const fieldLabel = FIELD_LABELS[f.key]?.[locale] ?? f.label;
        // Karim 2026-07-05 : champ VIDE = couleur qui interpelle. Facultatif vide =
        // alerte DOUCE (ambre) ; obligatoire vide = alerte FORTE (rouge). Rempli =
        // vert (inchangé). (IBAN + date de naissance ont leurs propres composants.)
        const isOptional = OPTIONAL_FIELDS.has(f.key);
        const fieldBorder = filled
          ? "border-success"
          : isOptional
            ? "border-warn focus:border-warn"
            : "border-danger focus:border-danger";
        return (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-ink-2 mb-1 flex items-center gap-1">
              {fieldLabel}
              {isOptional ? (
                <span className="text-[10px] font-normal text-ink-3">({t.optional})</span>
              ) : (
                <span
                  className={filled ? "text-ink-3" : "text-danger"}
                  title={t.required_hint}
                  aria-hidden
                >
                  *
                </span>
              )}
              {isCandidate && f.key === "address" ? (
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={geoLoading}
                  title={t.geo_button_title}
                  className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gold-dark hover:underline disabled:opacity-50"
                >
                  {geoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span aria-hidden>📍</span>}
                  {t.geo_button}
                </button>
              ) : null}
              {isCity && cityAuto ? (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-success">
                  <Sparkles className="h-3 w-3" /> {t.auto}
                </span>
              ) : null}
              {savingKey === f.key ? (
                <span className="ml-auto text-[10px] text-ink-3">{t.saving}</span>
              ) : savedKeys.has(f.key) ? (
                <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-success">
                  <Check className="h-3 w-3" /> {t.saved}
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setField(f.key, val);
                    void autosave(f.key, val);
                    // Transport sans abonnement -> périodicité "sans_objet" (affichage cohérent).
                    if (f.key === "transport_type" && !transportHasSubscription(val)) {
                      setField("transport_frequency", "sans_objet");
                      void autosave("transport_frequency", "sans_objet");
                    }
                  }}
                  className={[
                    "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                    fieldBorder,
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
                  placeholder={placeholder(f.key, locale)}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => void autosave(f.key, values[f.key] ?? "")}
                  className={[
                    "w-full rounded-lg border-[1.5px] bg-surface px-3 py-2 text-sm outline-none transition-colors",
                    fieldBorder,
                  ].join(" ")}
                />
              )}
            </div>

            {f.key === "nrn" ? (
              (() => {
                const raw = normalizeNRN(values.nrn ?? "");
                if (raw.length === 0) {
                  return <p className="text-[11px] text-ink-3 mt-1">{t.nrn_prefill}</p>;
                }
                const v = validateNRN(values.nrn ?? "");
                if (v.valid) {
                  return <p className="text-[11px] text-success font-semibold mt-1">{t.nrn_valid}</p>;
                }
                // Incomplet (moins de 11 chiffres) : Karim 2026-07-05 — masque VISUEL
                // (chiffres saisis + positions restantes en •) pour montrer clairement
                // qu'il reste des chiffres à compléter après les 6 pré-remplis.
                if (raw.length < 11) {
                  let di = 0;
                  const mask = Array.from("XX.XX.XX-XXX.XX")
                    .map((c) => { if (c !== "X") return c; const ch = di < raw.length ? raw[di] : "•"; di++; return ch; })
                    .join("");
                  return (
                    <p className="text-[11px] text-ink-3 mt-1">
                      {t.nrn_incomplete}
                      <br />
                      <span className="font-mono tracking-[0.18em] text-sm text-ink">{mask}</span>
                      <span className="ml-1 text-warn font-semibold">· {11 - raw.length} restant{11 - raw.length > 1 ? "s" : ""}</span>
                    </p>
                  );
                }
                // 11 chiffres mais checksum belge KO : signalé "non vérifié" (jamais silencieux).
                return <p className="text-[11px] text-warn font-semibold mt-1">{t.nrn_bad}</p>;
              })()
            ) : FIELD_HINTS[f.key] ? (
              <p className="text-[11px] text-ink-3 mt-1">{FIELD_HINTS[f.key][locale]}</p>
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
        {isCandidate ? t.btn_continue : t.btn_save}
      </button>
      {isCandidate ? (
        <>
          <p className="text-center text-[11px] text-ink-3">{t.step_footer}</p>
          <p className="text-center text-[10px] text-ink-3 leading-snug mt-1">
            {t.rgpd}
          </p>
        </>
      ) : null}
    </div>
  );
}
