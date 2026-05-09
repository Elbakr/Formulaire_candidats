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
};

export function renderTemplate(
  raw: string,
  vars: OrgVars & CandidateVars & DynamicVars,
): string {
  const dict: Record<string, string> = {
    org_name: vars.org_name ?? "",
    org_email: vars.org_email ?? "",
    org_phone: vars.org_phone ?? "",
    org_whatsapp: vars.org_whatsapp ?? "",
    org_address: vars.org_address ?? "",
    firstname: vars.firstname ?? "",
    fullname: vars.fullname ?? "",
    custom: vars.custom ?? "",
    dates: vars.dates ?? "",
    times: vars.times ?? "",
    document_label: vars.document_label ?? "",
    document_upload_url: vars.document_upload_url ?? "",
  };
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => dict[key] ?? "");
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
