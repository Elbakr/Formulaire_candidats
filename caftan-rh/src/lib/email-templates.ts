// Rendering des templates email avec variables {{firstname}} etc.

export type OrgVars = {
  org_name: string;
  org_email: string;
  org_phone: string;
  org_whatsapp: string;
  org_address: string;
};

export type CandidateVars = {
  firstname: string;
  fullname: string;
};

export type DynamicVars = {
  custom?: string;
  dates?: string; // formatted "JJ/MM/AAAA ou JJ/MM/AAAA"
  times?: string; // formatted "9h00 / 14h00"
  document_label?: string; // libellé doc demandé (catalogue)
  document_upload_url?: string; // magic link signé pour upload doc
  link?: string;     // ex : URL pre-interview, lien upload doc, etc.
  deadline?: string; // date limite formatee FR
  [key: string]: string | undefined;
};

/**
 * Substitue les {{vars}} dans `raw` par les valeurs de l objet `vars`.
 * Karim 18/05 : avant, le dict etait statique et IGNORAIT silencieusement
 * `{{link}}` / `{{deadline}}` / toute cle non listee -> bouton "Repondre
 * au pre-entretien" vide (href="") = mort au clic. Fix : on iterre sur
 * TOUTES les cles de vars, plus de liste blanche.
 */
export function renderTemplate(
  raw: string,
  vars: OrgVars & CandidateVars & DynamicVars & Record<string, unknown>,
): string {
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = (vars as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  });
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
