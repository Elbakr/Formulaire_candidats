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
import { processBatch } from "@/lib/payslip-processor";
import type { EmployerOrgKey } from "@/lib/contract-renderer";

const SUBJECT_PATTERNS = [
  /fiche\s+de\s+paie/i,
  /fiches\s+de\s+paies?/i,
  /feuille\s+de\s+paie/i,
  /feuilles\s+de\s+paies?/i,
  /payslip/i,
  /loonbrief/i,            // NL
  /loonbrieven/i,          // NL pluriel
  /bulletin\s+de\s+paie/i, // FR variante
];

// Mapping expéditeurs → employeur
function detectEmployer(fromEmail: string, fromName: string | null): EmployerOrgKey | null {
  const haystack = `${fromEmail} ${fromName ?? ""}`.toLowerCase();
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
        const employer = detectEmployer(fromEmail, fromName);
        if (!employer) {
          result.errors.push({ uid: m.uid, subject, error: `Expéditeur non reconnu (${fromEmail}). Patterns supportés : hrconsult, partena, securex, acerta, groups.` });
          continue;
        }

        // PDF attachments
        const pdfs = (parsed.attachments ?? []).filter((a) =>
          (a.contentType ?? "").toLowerCase().includes("pdf") ||
          (a.filename ?? "").toLowerCase().endsWith(".pdf"),
        );

        if (pdfs.length === 0) {
          result.errors.push({ uid: m.uid, subject, error: "Aucun PDF dans les pièces jointes" });
          continue;
        }

        let totalInserted = 0;
        let totalMatched = 0;
        let totalOrphan = 0;

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

  return result;
}
