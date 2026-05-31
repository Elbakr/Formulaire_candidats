// Karim 2026-05-31 : types + constantes UI partagées client+server.
// PAS d'import server-only ici (sinon casse le bundle client).

export type MailSource =
  | "contract_signature"
  | "contract_employer_archive"
  | "info_request"
  | "payslip_share"
  | "payslip_share_external"
  | "magic_link"
  | "screening_request"
  | "tunnel_recap"
  | "password_reset"
  | "manual";

export const SOURCE_LABELS: Record<MailSource, string> = {
  contract_signature: "Contrat à signer",
  contract_employer_archive: "Archive employeur contrat",
  info_request: "Demande d'infos manquantes",
  payslip_share: "Fiche de paie envoyée",
  payslip_share_external: "Fiche de paie partagée (externe)",
  magic_link: "Lien de connexion auto",
  screening_request: "Invitation questionnaire",
  tunnel_recap: "Récap tunnel test",
  password_reset: "Réinitialisation mot de passe",
  manual: "Mail manuel",
};

export const SOURCE_COLORS: Record<MailSource, string> = {
  contract_signature: "bg-purple-100 text-purple-800",
  contract_employer_archive: "bg-purple-50 text-purple-700",
  info_request: "bg-amber-100 text-amber-800",
  payslip_share: "bg-green-100 text-green-800",
  payslip_share_external: "bg-emerald-100 text-emerald-800",
  magic_link: "bg-blue-100 text-blue-800",
  screening_request: "bg-pink-100 text-pink-800",
  tunnel_recap: "bg-gray-100 text-gray-700",
  password_reset: "bg-rose-100 text-rose-800",
  manual: "bg-gray-100 text-gray-800",
};
