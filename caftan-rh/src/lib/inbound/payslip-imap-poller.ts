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
import { extractPagesText, isPayslipStartPage, detectEmployerFromText } from "@/lib/payslip-splitter";
import type { EmployerOrgKey } from "@/lib/contract-renderer";
import { createAdminClient } from "@/lib/supabase/server";

// Karim 2026-06-15 : couverture LARGE de toutes les orthographes/dérivés.
// pa[iy]e?s? matche : pai, pais, paie, paies, pay, pays, paye, payes.
// (fiche|feuille|bulletin)s? matche singulier ET pluriel. Espaces souples.
const SUBJECT_PATTERNS = [
  // fiche/feuille/bulletin/décompte DE paie/salaire/rémunération (sing. + pluriel, FR)
  /(fiche|feuille|bulletin|d[ée]compte)s?\s+de\s+(pa[iy]e?s?|salaires?|r[ée]mun[ée]rations?)/i,
  /fiche[-_\s]*pa[iy]e?s?/i,                        // collé/tiret : fiche-paie, fichepaie
  /pay[\s-]?slips?/i,                               // payslip(s)
  /pay[\s-]?stubs?/i,                               // paystub(s)
  /loonbrie(f|ven)/i,                              // NL : loonbrief / loonbrieven
  /loonfiches?/i,                                  // NL variante
  /salarisstrook(en)?/i,                           // NL « fiche de salaire »
  /salarisafrekening(en)?/i,                       // NL « décompte de salaire »
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

  const since = opts?.since ?? new Date(Date.now() - 15 * 24 * 3600 * 1000); // Karim 2026-07-02 : 15j (fiches du mois)
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
        { since }, // Karim 2026-07-01 : lus OU non lus. La dédup est déjà garantie
                   // par le move vers CaftanRH-Processed (les traités quittent l'INBOX)
                   // + l'unicité en base. Un email lu avant le tick n'est plus perdu.
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
        // Karim 2026-07-02 : le SUJET est le filtre PRINCIPAL (ne repérer que les
        // mails "fiche/feuille/bulletin/décompte de paie/salaire" & variantes,
        // sing. + pluriel). L'expéditeur reste un simple indice (Karim transfère
        // depuis son perso). Le CONTENU du PDF sert de garde-fou anti-junk.
        if (!subjectMatches(subject)) continue;

        const fromObj = parsed.from?.value?.[0];
        const fromEmail = fromObj?.address ?? "";
        const fromName = fromObj?.name ?? null;
        const senderEmployerRaw = detectEmployer(fromEmail, fromName, customSenderMap);
        // Homix ne fait pas de fiches de paie → on le ramène à null (paie = amd/caftan).
        const senderEmployer: "amd_megastore" | "caftan_factory" | null =
          senderEmployerRaw === "amd_megastore" || senderEmployerRaw === "caftan_factory"
            ? senderEmployerRaw
            : null;

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
          // Exclut les images INLINE (logos de signature, bannières cid) : ce ne
          // sont pas des fiches. Sinon l'OCR crée des orphelines bidon (net=0).
          .filter((x) => {
            const a = x.att as { related?: boolean; contentDisposition?: string };
            return x.img.is && !looksLikePdf(x.att) && a.related !== true && a.contentDisposition !== "inline";
          });

        // Karim 2026-06-15 : si aucun PDF mais des images → chemin OCR vision.
        // Si ni PDF ni image → erreur descriptive.
        // Sniff CONTENU des PDF : on ne traite que ceux qui ressemblent à une
        // fiche de paie (FEUILLE DE PAIE / LOONBRIEF, ou nom d'entité Caftan/AMD),
        // pour ne pas ingérer un contrat/facture joint. L'employeur du contenu est
        // servi en fallback à processBatch (qui le redétecte par fiche de toute façon).
        const payslipPdfs: Array<{
          pdf: (typeof pdfs)[number];
          bytes: Uint8Array;
          contentEmployer: "amd_megastore" | "caftan_factory" | null;
        }> = [];
        for (const pdf of pdfs) {
          if (!pdf.content || !Buffer.isBuffer(pdf.content)) continue;
          const bytes = new Uint8Array(pdf.content);
          // Garde-fou CONTENU : dans un mail au sujet "paie", on n'ingère un PDF
          // que s'il ressemble à une fiche (FEUILLE DE PAIE / LOONBRIEF ou entité
          // Caftan/AMD). Si le PDF est illisible (scan sans texte), on fait
          // confiance au sujet plutôt que de rater une vraie fiche.
          let looksPayslip = false;
          let extracted = false;
          let textLen = 0;
          let contentEmployer: "amd_megastore" | "caftan_factory" | null = null;
          try {
            const pages = await extractPagesText(bytes);
            extracted = true;
            const fullText = pages.map((p) => p.text).join("\n");
            textLen = fullText.trim().length;
            contentEmployer = detectEmployerFromText(fullText);
            if (contentEmployer || pages.some((p) => isPayslipStartPage(p.text))) looksPayslip = true;
          } catch {
            // extraction KO
          }
          // PDF scanné = extraction en échec OU texte quasi vide (image-only, unpdf
          // renvoie "" sans throw). Le sujet "paie" étant déjà validé, on fait
          // confiance au sujet plutôt que de rater une vraie fiche scannée.
          if (!extracted || textLen <= 20) looksPayslip = true;
          if (looksPayslip) payslipPdfs.push({ pdf, bytes, contentEmployer });
        }

        // Images (OCR coûteux) : uniquement en l'absence de PDF de paie. Le sujet
        // "paie" est déjà validé (gate plus haut), donc pas de sur-OCR.
        const imagesToProcess = payslipPdfs.length === 0 ? images : [];

        if (payslipPdfs.length === 0 && imagesToProcess.length === 0) {
          // Sujet "paie" validé mais aucune PJ exploitable : jamais silencieux.
          const attCount = allAttachments.length;
          result.errors.push({
            uid: m.uid,
            subject,
            error: attCount === 0
              ? "Sujet 'fiche de paie' mais aucune pièce jointe (PDF non attaché — lien Drive / aperçu inline ?)."
              : `${attCount} pièce(s) jointe(s) mais aucune reconnue comme fiche de paie (types : ${allAttachments.map((a) => a.contentType ?? "?").join(", ")}).`,
          });
          continue;
        }

        result.matched++;

        let totalInserted = 0;
        let totalMatched = 0;
        let totalOrphan = 0;

        // --- Chemin PDF ---
        for (const { pdf, bytes, contentEmployer } of payslipPdfs) {
          result.pdfs_total++;

          try {
            const batchResult = await processBatch({
              pdfBytes: bytes,
              filename: pdf.filename ?? `inbound-${m.uid}.pdf`,
              // Employeur : indice expéditeur → contenu → défaut. processBatch
              // redétecte l'employeur réel par fiche depuis le contenu.
              employerOrgKey: senderEmployer ?? contentEmployer ?? "amd_megastore",
              uploadedBy: null, // null = auto/cron
              source: "email",  // canal = email entrant
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

        // --- Chemin IMAGE → OCR Claude vision ---
        // imagesToProcess est déjà filtré (vide s'il y a des PDF de paie ou sans indice).
        {
          for (const { att, img } of imagesToProcess) {
            if (!att.content || !Buffer.isBuffer(att.content)) continue;
            const bytes = new Uint8Array(att.content);
            result.pdfs_total++; // réutilise le compteur total pièces traitées

            try {
              const imgResult = await processImagePayslip({
                imageBytes: bytes,
                mediaType: img.mediaType,
                filename: att.filename ?? `inbound-img-${m.uid}.jpg`,
                fallbackEmployer: senderEmployer ?? "amd_megastore",
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
          employer: senderEmployer,
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
