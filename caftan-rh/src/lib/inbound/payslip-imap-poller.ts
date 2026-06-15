// Karim 2026-06-03 : poller IMAP dédié aux fiches de paie.
// - Se connecte à hr@caftanfactory.com via Gmail IMAP App Password
// - Filtre les mails non-traités avec sujet contenant fiche/feuille de paie
// - Extrait les PDFs attachés
// - Détecte l'employeur (HR Consult→AMD Megastore, Partena→Caftan Factory)
// - Appelle processBatch (réutilise tout le matching employee existant)
// - Marque le mail comme traité via label Gmail "CaftanRH-Processed"
//
// NE CASSE RIEN : utilise les mêmes fns processBatch + payslip-splitter
// que le drop manuel. Anti-doublon via (employee+period+is_secondary) déjà actif.

import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { retryOnTransientImap } from "./imap-retry";
import { processBatch } from "@/lib/payslip-processor";
import { processImagePayslip } from "@/lib/payslip-image-processor";
import type { EmployerOrgKey } from "@/lib/contract-renderer";
import { createAdminClient } from "@/lib/supabase/server";

// Karim 2026-06-15 : couverture LARGE de toutes les orthographes/dérivés.
// pa[iy]e?s? matche : pai, pais, paie, paies, pay, pays, paye, payes.
// (fiche|feuille|bulletin)s? matche singulier ET pluriel. Espaces souples.
const SUBJECT_PATTERNS = [
  /(fiche|feuille|bulletin)s?\s+de\s+pa[iy]e?s?/i, // fiche(s)/feuille(s)/bulletin(s) de paie/paies/paye/pai…
  /fiche[-_\s]*pa[iy]e?s?/i,                        // collé/tiret : fiche-paie, fichepaie
  /pay[\s-]?slips?/i,                               // payslip(s)
  /pay[\s-]?stubs?/i,                               // paystub(s)
  /loonbrie(f|ven)/i,                              // NL : loonbrief / loonbrieven
  /loonfiches?/i,                                  // NL variante
  /salarisstrook(en)?/i,                           // NL « fiche de salaire »
];

// Entrée d'un mapping personnalisé expéditeur → employeur
export interface SenderMapEntry {
  pattern: string;
  employer: EmployerOrgKey;
}

// Mapping expéditeurs → employeur
// customMap (depuis org_settings.payslip_sender_map) est testé EN PREMIER.
// Match insensible à la casse : pattern inclus dans "<fromEmail> <fromName>".
// Si aucun match custom, les patterns EN DUR ci-dessous s'appliquent.
function detectEmployer(
  fromEmail: string,
  fromName: string | null,
  customMap?: SenderMapEntry[],
): EmployerOrgKey | null {
  const haystack = `${fromEmail} ${fromName ?? ""}`.toLowerCase();

  // 1. Patterns personnalisés (DB)
  if (customMap && customMap.length > 0) {
    for (const entry of customMap) {
      if (entry.pattern && haystack.includes(entry.pattern.toLowerCase())) {
        return entry.employer;
      }
    }
  }

  // 2. Patterns EN DUR (inchangés)
  if (haystack.includes("hrconsult") || haystack.includes("hr-consult") || haystack.includes("hr consult")) {
    return "amd_megastore";
  }
  if (haystack.includes("partena")) {
    return "caftan_factory";
  }
  if (haystack.includes("securex") || haystack.includes("acerta") || haystack.includes("groups")) {
    // fallback secrétariats sociaux belges génériques → AMD par défaut
    return "amd_megastore";
  }
  return null;
}

function subjectMatches(subject: string | null | undefined): boolean {
  if (!subject) return false;
  return SUBJECT_PATTERNS.some((re) => re.test(subject));
}

export interface PayslipPollerResult {
  fetched: number;
  matched: number;
  processed: number;
  pdfs_total: number;
  payslips_inserted: number;
  payslips_matched_employee: number;
  payslips_orphan: number;
  errors: Array<{ uid?: number; subject?: string; error: string }>;
  details: Array<{
    uid: number;
    subject: string;
    from: string;
    employer: string | null;
    pdf_count: number;
    inserted: number;
    matched: number;
    orphan: number;
  }>;
}

export async function pollPayslipsFromImap(opts?: {
  since?: Date;
  maxPerRun?: number;
  markAsProcessed?: boolean;
  mailbox?: string;
}): Promise<PayslipPollerResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER + GMAIL_APP_PASSWORD non configurés dans .env.local");
  }

  const result: PayslipPollerResult = {
    fetched: 0,
    matched: 0,
    processed: 0,
    pdfs_total: 0,
    payslips_inserted: 0,
    payslips_matched_employee: 0,
    payslips_orphan: 0,
    errors: [],
    details: [],
  };

  const since = opts?.since ?? new Date(Date.now() - 90 * 24 * 3600 * 1000); // 90j par défaut
  const maxPerRun = opts?.maxPerRun ?? 50;
  const markAsProcessed = opts?.markAsProcessed ?? true;

  // Charge le mapping expéditeurs personnalisés depuis org_settings
  let customSenderMap: SenderMapEntry[] = [];
  try {
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("org_settings")
      .select("payslip_sender_map")
      .eq("id", 1)
      .maybeSingle();
    if (Array.isArray(orgRow?.payslip_sender_map)) {
      customSenderMap = orgRow.payslip_sender_map as SenderMapEntry[];
    }
  } catch {
    // Non-bloquant : si la colonne n'existe pas encore (avant migration), on continue sans.
  }

  // Karim 2026-06-14 : retry sur erreur IMAP transitoire (« Command failed »,
  // socket, timeout). Le client est recréé à chaque tentative. Les mails déjà
  // traités sont déplacés vers CaftanRH-Processed et filtrés (seen:false), et
  // processBatch est anti-doublon : un re-jeu après aléa est donc sûr. On remet
  // les compteurs à zéro en début de tentative pour ne pas cumuler.
  await retryOnTransientImap(async () => {
    result.fetched = 0;
    result.matched = 0;
    result.processed = 0;
    result.pdfs_total = 0;
    result.payslips_inserted = 0;
    result.payslips_matched_employee = 0;
    result.payslips_orphan = 0;
    result.errors = [];
    result.details = [];

    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(opts?.mailbox ?? "INBOX");
      try {
      // Karim 2026-06-03 : assure que le label CaftanRH-Processed existe
      if (markAsProcessed) {
        try { await client.mailboxCreate("CaftanRH-Processed"); } catch { /* exists */ }
      }

      const candidates: Array<{ uid: number; source: Buffer | null }> = [];
      for await (const msg of client.fetch(
        { since, seen: false }, // que les non-lus
        { uid: true, source: true, envelope: true },
        { uid: true },
      )) {
        if (msg.source) {
          candidates.push({ uid: msg.uid as number, source: msg.source as Buffer });
        }
        if (candidates.length >= maxPerRun) break;
      }
      result.fetched = candidates.length;

      for (const m of candidates) {
        if (!m.source) continue;
        let parsed;
        try {
          parsed = await simpleParser(m.source);
        } catch (e) {
          result.errors.push({ uid: m.uid, error: `parse: ${(e as Error).message}` });
          continue;
        }

        const subject = parsed.subject ?? "";
        if (!subjectMatches(subject)) continue;
        result.matched++;

        const fromObj = parsed.from?.value?.[0];
        const fromEmail = fromObj?.address ?? "";
        const fromName = fromObj?.name ?? null;
        const employer = detectEmployer(fromEmail, fromName, customSenderMap);
        if (!employer) {
          result.errors.push({
            uid: m.uid,
            subject,
            error: `Expéditeur non reconnu (${fromEmail}) — ajoute cet expéditeur dans /admin/payslips (Expéditeurs autorisés).`,
          });
          continue;
        }

        // PDF attachments — Karim 2026-06-15 : détection ROBUSTE.
        // 1) content-type contient "pdf"  2) nom finit par .pdf
        // 3) sinon, octets magiques "%PDF" (cas content-type=octet-stream ou nom
        //    sans extension, fréquent quand le PDF est forwardé/renommé).
        const looksLikePdf = (a: { contentType?: string | null; filename?: string | null; content?: unknown }) => {
          const ct = (a.contentType ?? "").toLowerCase();
          const fn = (a.filename ?? "").toLowerCase();
          if (ct.includes("pdf") || fn.endsWith(".pdf")) return true;
          const c = a.content as Buffer | undefined;
          if (Buffer.isBuffer(c) && c.length >= 5 && c.subarray(0, 5).toString("latin1") === "%PDF-") return true;
          return false;
        };

        // Images — JPEG/PNG/WEBP → traitement OCR Claude vision
        type ParsedAttachment = { contentType?: string | null; filename?: string | null; content?: unknown };
        const looksLikeImage = (a: ParsedAttachment): { is: boolean; mediaType: string } => {
          const ct = (a.contentType ?? "").toLowerCase();
          const fn = (a.filename ?? "").toLowerCase();
          if (ct.includes("jpeg") || ct.includes("jpg") || fn.endsWith(".jpg") || fn.endsWith(".jpeg")) {
            return { is: true, mediaType: "image/jpeg" };
          }
          if (ct.includes("png") || fn.endsWith(".png")) {
            return { is: true, mediaType: "image/png" };
          }
          if (ct.includes("webp") || fn.endsWith(".webp")) {
            return { is: true, mediaType: "image/webp" };
          }
          return { is: false, mediaType: "" };
        };

        const allAttachments = parsed.attachments ?? [];
        const pdfs = allAttachments.filter(looksLikePdf);
        const images = allAttachments
          .map((a) => ({ att: a, img: looksLikeImage(a) }))
          .filter((x) => x.img.is && !looksLikePdf(x.att));

        // Karim 2026-06-15 : si aucun PDF mais des images → chemin OCR vision.
        // Si ni PDF ni image → erreur descriptive.
        if (pdfs.length === 0 && images.length === 0) {
          const attCount = allAttachments.length;
          result.errors.push({
            uid: m.uid,
            subject,
            error: attCount === 0
              ? "Aucune pièce jointe (le PDF n'est pas attaché — vérifie que c'est un vrai fichier joint, pas un lien Drive/aperçu inline)."
              : `${attCount} pièce(s) jointe(s) mais aucune reconnue comme PDF ou image (types : ${allAttachments.map((a) => a.contentType ?? "?").join(", ")}).`,
          });
          continue;
        }

        let totalInserted = 0;
        let totalMatched = 0;
        let totalOrphan = 0;

        // --- Chemin PDF (existant, inchangé) ---
        for (const pdf of pdfs) {
          if (!pdf.content || !Buffer.isBuffer(pdf.content)) continue;
          const bytes = new Uint8Array(pdf.content);
          result.pdfs_total++;

          try {
            const batchResult = await processBatch({
              pdfBytes: bytes,
              filename: pdf.filename ?? `inbound-${m.uid}.pdf`,
              employerOrgKey: employer,
              uploadedBy: null, // null = auto/cron
              source: "email",  // canal = email entrant (employeur capturé via employerOrgKey)
            });
            totalInserted += batchResult.matchedCount + batchResult.unmatchedCount;
            totalMatched += batchResult.matchedCount;
            totalOrphan += batchResult.unmatchedCount;
            result.payslips_inserted += batchResult.matchedCount + batchResult.unmatchedCount;
            result.payslips_matched_employee += batchResult.matchedCount;
            result.payslips_orphan += batchResult.unmatchedCount;
          } catch (e) {
            result.errors.push({
              uid: m.uid,
              subject,
              error: `processBatch: ${(e as Error).message}`,
            });
          }
        }

        // --- Chemin IMAGE → OCR Claude vision (nouveau) ---
        // Activé uniquement si aucun PDF (évite de doubler le travail si le mail
        // contient à la fois un PDF et un aperçu JPEG inline).
        if (pdfs.length === 0) {
          for (const { att, img } of images) {
            if (!att.content || !Buffer.isBuffer(att.content)) continue;
            const bytes = new Uint8Array(att.content);
            result.pdfs_total++; // réutilise le compteur total pièces traitées

            try {
              const imgResult = await processImagePayslip({
                imageBytes: bytes,
                mediaType: img.mediaType,
                filename: att.filename ?? `inbound-img-${m.uid}.jpg`,
                fallbackEmployer: employer,
                uploadedBy: null,
                source: "email",
              });
              if (imgResult.error) {
                result.errors.push({ uid: m.uid, subject, error: `OCR image: ${imgResult.error}` });
              } else {
                totalInserted++;
                result.payslips_inserted++;
                if (imgResult.matched) {
                  totalMatched++;
                  result.payslips_matched_employee++;
                } else {
                  totalOrphan++;
                  result.payslips_orphan++;
                }
              }
            } catch (e) {
              result.errors.push({
                uid: m.uid,
                subject,
                error: `processImagePayslip: ${(e as Error).message}`,
              });
            }
          }
        }

        result.processed++;
        result.details.push({
          uid: m.uid,
          subject,
          from: fromEmail,
          employer,
          pdf_count: pdfs.length,
          inserted: totalInserted,
          matched: totalMatched,
          orphan: totalOrphan,
        });

        // Marque le mail comme traité (move to label) + lu
        if (markAsProcessed) {
          try {
            await client.messageMove(m.uid, "CaftanRH-Processed", { uid: true });
          } catch (e) {
            // Si le move échoue, au moins on flag comme lu
            try { await client.messageFlagsAdd(m.uid, ["\\Seen"], { uid: true }); } catch { /* */ }
            result.errors.push({ uid: m.uid, subject, error: `move KO: ${(e as Error).message}` });
          }
        }
      }
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* */ }
    }
  });

  return result;
}
