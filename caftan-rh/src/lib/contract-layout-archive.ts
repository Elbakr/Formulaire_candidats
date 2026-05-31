// Karim 2026-05-30 : ARCHIVE des layouts contrat DocuSeal.
//
// Chaque version est un snapshot des constantes CSS critiques qu un humain
// peut comparer/rollback en cas de regression. Le live CSS est dans
// docuseal-flow.ts (CONTRACT_CSS).
//
// Comment rollback en cas d accident :
//   1. Choisis la version cible (ex: v8_original_pixel_perfect)
//   2. Remplace les valeurs dans CONTRACT_CSS de docuseal-flow.ts
//   3. Ou applique le diff genere par diffLayoutVersions(target, current)
//
// Comment ajouter une version :
//   1. Apres une serie d edits stables et validee par Karim
//   2. Snapshot des valeurs courantes dans une nouvelle constante LAYOUT_VxYZ
//   3. Mettre a jour LIVE = nouvelle constante

export interface LayoutSnapshot {
  slug: string;
  description: string;
  approvedBy?: string;
  approvedAt?: string;
  gitCommit?: string;
  values: {
    // Titre
    docTitleMarginBottom: string;
    docTitlePadding: string;
    docTitleFontSize: string;
    // Parties
    partiesBlockMarginBottom: string;
    partiesTdLineHeight: string;
    // Articles
    articleHeadMargin: string;
    pMarginBottom: string;
    bodyLineHeight: string;
    // Signatures
    signaturesMarginTop: string;
    sigBoxMinHeight: string;
    sigZoneMinHeight: string;
    closingLineMarginTop: string;
    // Page
    pageMargin: string;
  };
  notes?: string;
}

// ============ v8 ORIGINAL ============
// Commit 61e5a2e "fix(docuseal v8): pixel-pres PDF originaux"
// Validé visuellement par Karim 2026-05-29 ("majestueux 22h01")
export const LAYOUT_V8_ORIGINAL: LayoutSnapshot = {
  slug: "v8-original",
  description: "Pixel-perfect contrat original SD Worx (avec annexe, ~5 pages)",
  approvedBy: "Karim",
  approvedAt: "2026-05-29",
  gitCommit: "61e5a2e",
  values: {
    docTitleMarginBottom: "1.4cm",
    docTitlePadding: "0.35cm 0.4cm",
    docTitleFontSize: "18pt",
    partiesBlockMarginBottom: "1cm",
    partiesTdLineHeight: "1.3",
    articleHeadMargin: "0.5cm 0 0.15cm 0",
    pMarginBottom: "0.15cm",
    bodyLineHeight: "1.25",
    signaturesMarginTop: "1cm",
    sigBoxMinHeight: "3.5cm",
    sigZoneMinHeight: "1.8cm",
    closingLineMarginTop: "1cm",
    pageMargin: "1.8cm 2cm 1.6cm 2cm",
  },
  notes: "Reference baseline. À ne PAS modifier. Sert de filet de sécurité.",
};

// ============ v8.1 COMPACT (annexe supprimee + ajustements page 3) ============
// Karim 2026-05-30 : suppression annexe employee_pt + ajustements modérés
export const LAYOUT_V8_1_COMPACT: LayoutSnapshot = {
  slug: "v8.1-compact",
  description: "Annexe horaires supprimee + ajustements moderés pour tenir 3 pages",
  approvedBy: "Karim",
  approvedAt: "2026-05-30",
  values: {
    docTitleMarginBottom: "0.7cm",  // -0.7cm vs original
    docTitlePadding: "0.3cm 0.4cm",  // -0.05cm
    docTitleFontSize: "18pt",        // inchange
    partiesBlockMarginBottom: "0.6cm", // -0.4cm
    partiesTdLineHeight: "1.25",     // -0.05
    articleHeadMargin: "0.4cm 0 0.1cm 0", // -0.1cm + -0.05cm
    pMarginBottom: "0.12cm",         // -0.03cm
    bodyLineHeight: "1.25",          // inchange
    signaturesMarginTop: "0.7cm",    // -0.3cm
    sigBoxMinHeight: "2.5cm",        // -1cm (date retiree)
    sigZoneMinHeight: "1.4cm",       // -0.4cm
    closingLineMarginTop: "0.7cm",   // -0.3cm
    pageMargin: "1.8cm 2cm 1.6cm 2cm", // inchange
  },
  notes: "LIVE. Apres validation, signatures tiennent sur page 3. Date retiree des cadres (deja dans closing-line). (et parapher) retire pour version electronique.",
};

// ============ v8.2 ALIGNED ============
// Karim 2026-05-30 : ajustements pour respecter le nombre de pages original
// (employee_pt sans annexe = 3 pages avec article 6 debut page 2)
export const LAYOUT_V8_2_ALIGNED: LayoutSnapshot = {
  slug: "v8.2-aligned",
  description: "Calibré pour respecter nb pages original (3p employee_pt, 2-3p student)",
  approvedBy: "Karim",
  approvedAt: "2026-05-30",
  values: {
    docTitleMarginBottom: "0.5cm",
    docTitlePadding: "0.25cm 0.4cm",
    docTitleFontSize: "18pt",
    partiesBlockMarginBottom: "0.4cm",
    partiesTdLineHeight: "1.25",
    articleHeadMargin: "0.25cm 0 0.06cm 0",
    pMarginBottom: "0.08cm",
    bodyLineHeight: "1.25",
    signaturesMarginTop: "0.5cm",
    sigBoxMinHeight: "2.5cm",
    sigZoneMinHeight: "1.4cm",
    closingLineMarginTop: "0.5cm",
    pageMargin: "1.8cm 2cm 1.6cm 2cm",
  },
  notes: "Politique : nb pages identique a l original respectif (sans annexe). Compress articles + paragraphes -50% pour gain ~5cm sans toucher polices.",
};

// ============ ⚠️ v8.2 REJETE - cassait Article 5 (cases ☐/☒ desalignees) ============
// Karim 2026-05-30 : "l article 5 de la page 1 est totalement mal agencé".
// Trop de compression sur p margin-bottom (0.08cm) + article-head (0.25/0.06).
// LECON : ne JAMAIS compresser les marges p et article au point que les listes
// d options a cocher (article 5 = horaire fixe/variable/...) deviennent
// illisibles. Le layout original prevaut TOUJOURS sur le nb de pages.

// ============ LIVE = REVERT a v8.1 ============
// Si une page de plus est necessaire pour preserver l agencement, c est OK.
export const LAYOUT_LIVE = LAYOUT_V8_1_COMPACT;

/**
 * Helper : compare 2 snapshots pour générer un diff lisible.
 * Utilise pour decider si on rollback ou pas.
 */
export function diffLayoutVersions(a: LayoutSnapshot, b: LayoutSnapshot): string[] {
  const lines: string[] = [];
  lines.push(`Diff ${a.slug} -> ${b.slug}`);
  const keys = Object.keys(a.values) as (keyof typeof a.values)[];
  for (const k of keys) {
    if (a.values[k] !== b.values[k]) {
      lines.push(`  ${k}: ${a.values[k]} -> ${b.values[k]}`);
    }
  }
  return lines;
}

/**
 * Toutes les versions archivees, ordre chronologique.
 * Une page admin /admin/contract-layouts liste tout ça et permet de
 * comparer / restaurer.
 */
// ============ STUDENT_COMPACT override (specifique student uniquement) ============
// Karim 2026-05-30 : surcharge CSS appliquee via body.contract-student
// pour faire tenir le contrat etudiant en 2 pages (markdown ~6400 chars).
// N affecte PAS employee/employee_pt qui restent en v8.1.
export const LAYOUT_STUDENT_COMPACT_OVERRIDE: LayoutSnapshot = {
  slug: "student-compact-override-v2",
  description: "Surcharge student v2 : police 9.75pt (vs 9.5pt v1) pour meilleure lisibilite, 2 pages",
  approvedBy: "Karim",
  approvedAt: "2026-05-30",
  values: {
    docTitleMarginBottom: "0.4cm",
    docTitlePadding: "0.2cm 0.4cm",
    docTitleFontSize: "17pt",
    partiesBlockMarginBottom: "0.35cm",
    partiesTdLineHeight: "1.2",
    articleHeadMargin: "0.3cm 0 0.08cm 0",
    pMarginBottom: "0.08cm",
    bodyLineHeight: "1.2",
    signaturesMarginTop: "0.4cm",
    sigBoxMinHeight: "2.2cm",
    sigZoneMinHeight: "1.2cm",
    closingLineMarginTop: "0.4cm",
    pageMargin: "1.8cm 2cm 1.6cm 2cm",
  },
  notes: "v2 (Karim 2026-05-30) : remonte police 9.5pt -> 9.75pt, titre 16pt -> 17pt, sig-title 9pt -> 9.5pt, em 8pt -> 8.5pt. Lisibilite ameliorée tout en gardant 2 pages.",
};

export const ALL_LAYOUT_SNAPSHOTS: LayoutSnapshot[] = [
  LAYOUT_V8_ORIGINAL,
  LAYOUT_V8_1_COMPACT,
  LAYOUT_V8_2_ALIGNED,
  LAYOUT_STUDENT_COMPACT_OVERRIDE,
];
