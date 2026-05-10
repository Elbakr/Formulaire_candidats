// Affichage lisible du payload Gravity Forms d'un candidat.
// Mapping des clés numériques connues du formulaire Caftan Factory + skip
// des clés techniques. Les valeurs vides sont ignorées. Les sous-champs (`x.1`,
// `x.2`...) sont regroupés (cases à cocher → liste).

import { FileText, ExternalLink } from "lucide-react";

// Champs techniques GF à masquer
const META_KEYS = new Set([
  "id",
  "form_id",
  "post_id",
  "date_created",
  "date_updated",
  "is_starred",
  "is_read",
  "ip",
  "source_url",
  "user_agent",
  "currency",
  "payment_status",
  "payment_date",
  "payment_amount",
  "payment_method",
  "transaction_id",
  "is_fulfilled",
  "created_by",
  "transaction_type",
  "status",
  "gf_id",
]);

// Mapping des champs numériques principaux du formulaire Caftan Factory
// (déduit de `recrutement.html` + `formulaire-candidat.html`).
const FIELD_LABELS: Record<string, string> = {
  "1": "Prénom",
  "2": "Nom",
  "3": "Date de naissance",
  "4": "Genre",
  "5": "Email",
  "6": "Téléphone",
  "7": "CV (URL)",
  "8": "Lettre de motivation",
  "9": "Photo / CV",
  "10": "Adresse",
  "11": "Jours disponibles",
  "11.1": "Lundi",
  "11.2": "Mardi",
  "11.3": "Mercredi",
  "11.4": "Jeudi",
  "11.5": "Vendredi",
  "11.6": "Samedi",
  "11.7": "Dimanche",
  "12": "Régime de travail souhaité",
  "13": "Disponible à partir de",
  "14": "Ville préférée",
  "15": "Document complémentaire",
  "16": "Document complémentaire 2",
  "17": "Pièce d'identité",
  "18": "Document additionnel",
  "19": "Permis de travail",
  "20": "Poste / rôle souhaité",
  "21": "Expérience",
  "22": "Langues parlées",
  "23": "Niveau scolaire",
  "24": "NRN",
  "25": "IBAN",
  "26": "Code postal",
  "27": "Pays",
  "28": "Type de contrat",
  "29": "Plan Activa Bruxelles",
  "30": "Heures étudiant restantes",
};

function isUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function pretty(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return value.toLocaleString("fr-BE");
  if (typeof value === "string") {
    if (!value.trim()) return null;
    if (isUrl(value)) {
      const isFile = /\.(pdf|docx?|jpe?g|png|webp|gif|odt|rtf)(\?|$)/i.test(value);
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold-dark hover:underline inline-flex items-center gap-1 break-all"
        >
          {isFile ? <FileText className="h-3 w-3 shrink-0" /> : null}
          {value.split("/").pop()?.split("?")[0] || value}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      );
    }
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  return <pre className="text-[11px] font-mono">{JSON.stringify(value, null, 2)}</pre>;
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? `Champ ${key}`;
}

export function GfFormView({ payload }: { payload: Record<string, unknown> }) {
  // 1) Regroupe les sous-champs : `11.1`, `11.2`, ... → "Jours disponibles" :
  //    [Lundi, Mercredi, Vendredi]
  const subgrouped = new Map<string, Array<{ key: string; value: unknown }>>();
  const flat: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(payload)) {
    if (META_KEYS.has(key)) continue;
    if (value === "" || value === null || value === undefined) continue;

    const dotIdx = key.indexOf(".");
    if (dotIdx > 0 && /^\d+$/.test(key.slice(0, dotIdx))) {
      const parent = key.slice(0, dotIdx);
      const arr = subgrouped.get(parent) ?? [];
      arr.push({ key, value });
      subgrouped.set(parent, arr);
    } else {
      flat.push({ key, value });
    }
  }

  // Combine en une liste affichée, triée par clé numérique puis alphabétique
  type Row = {
    key: string;
    label: string;
    render: React.ReactNode;
  };
  const rows: Row[] = [];

  for (const item of flat) {
    rows.push({
      key: item.key,
      label: labelFor(item.key),
      render: pretty(item.value),
    });
  }
  for (const [parentKey, items] of subgrouped) {
    const checked = items
      .filter((it) => {
        const v = it.value;
        return (
          (typeof v === "string" && v.trim() && v !== "0") ||
          v === true ||
          (typeof v === "number" && v !== 0)
        );
      })
      .map((it) => labelFor(it.key));
    if (checked.length === 0) continue;
    rows.push({
      key: parentKey,
      label: labelFor(parentKey),
      render: (
        <div className="flex flex-wrap gap-1">
          {checked.map((c) => (
            <span
              key={c}
              className="inline-block px-1.5 py-0.5 rounded bg-gold-light text-gold-dark text-[10px] font-bold"
            >
              {c}
            </span>
          ))}
        </div>
      ),
    });
  }

  // Tri : clés numériques d'abord (croissant), puis alphabétique
  rows.sort((a, b) => {
    const an = parseInt(a.key, 10);
    const bn = parseInt(b.key, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    if (!isNaN(an)) return -1;
    if (!isNaN(bn)) return 1;
    return a.key.localeCompare(b.key);
  });

  // Filtre out rows where pretty() returned null
  const visible = rows.filter((r) => r.render != null);

  if (visible.length === 0) {
    return (
      <p className="text-sm text-ink-3 italic">
        Aucune donnée exploitable dans le payload.
      </p>
    );
  }

  return (
    <dl className="divide-y divide-line">
      {visible.map((r) => (
        <div
          key={r.key}
          className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 py-2.5"
        >
          <dt className="text-xs uppercase tracking-wider font-bold text-ink-3 sm:pt-0.5">
            {r.label}
          </dt>
          <dd className="text-sm text-ink break-words">{r.render}</dd>
        </div>
      ))}
    </dl>
  );
}
