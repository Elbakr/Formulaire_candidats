// Karim 2026-05-31 : encode un token base64url pour le redirect /api/docs/view.
// Pas de signature crypto : la signed URL embedded reste la vraie protection.

import "server-only";
import type { DocAuditType } from "./document-audit-log";

export function buildDocViewUrl(opts: {
  baseUrl: string;
  docType: DocAuditType;
  docRef: string;
  employeeId: string | null;
  signedUrl: string;
  expiresInSeconds?: number;
}): string {
  const payload = {
    doc_type: opts.docType,
    doc_ref: opts.docRef,
    employee_id: opts.employeeId,
    signed_url: opts.signedUrl,
    exp: opts.expiresInSeconds
      ? Math.floor(Date.now() / 1000) + opts.expiresInSeconds
      : Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${opts.baseUrl.replace(/\/+$/, "")}/api/docs/view/${b64}`;
}
