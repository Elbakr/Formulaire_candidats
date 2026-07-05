// Karim 2026-05-31 : watermark dynamique sur les PDFs envoyés.
// Utilisé pour traçabilité : payslips, copies contrat, documents partagés.
// Implémentation pdf-lib (déjà installé pour payslip-splitter).
//
// Design choisi (cf. discussion 2026-05-31) :
//   - Diagonale 30° au centre de chaque page, gris très clair (opacity 0.10)
//   - 2e ligne discrète en pied de page : "Envoyée à <Nom> · <date>"
//   - Pas de bloc rouge / "CONFIDENTIEL" géant : c'est anti-fraude, pas anti-vol
//   - Robuste : si pdf-lib crash, on retourne les bytes originaux (sans interruption)

import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

export interface WatermarkOptions {
  /** Nom du destinataire affiché. Ex: "Karim Elbazi" */
  recipientName: string;
  /** Email destinataire (facultatif - affiché en pied) */
  recipientEmail?: string;
  /** Référence interne (id payslip / contract). Affichée en pied 8px monospace. */
  docRef?: string;
  /** Date d'envoi - défaut: now */
  sentAt?: Date;
  /** Texte central diagonal. Défaut: "COPIE PERSONNELLE" */
  diagonalText?: string;
  /** Opacité 0..1. Défaut 0.10 (très discret) */
  opacity?: number;
}

/**
 * Applique un watermark dynamique sur chaque page d'un PDF.
 * Renvoie les bytes watermarkés. En cas d'erreur, renvoie les bytes
 * originaux + log console (non-blocking).
 */
export async function applyDynamicWatermark(
  pdfBytes: Uint8Array,
  opts: WatermarkOptions,
): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const sentAt = opts.sentAt ?? new Date();
    const dateStr = sentAt.toLocaleDateString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = sentAt.toLocaleTimeString("fr-BE", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
    });
    const diagonalText = opts.diagonalText ?? "COPIE PERSONNELLE";
    const opacity = opts.opacity ?? 0.10;

    const pages = doc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();

      // 1) Diagonale centrale
      const diagSize = Math.min(width, height) * 0.08;
      const cx = width / 2;
      const cy = height / 2;
      // Texte recipient + COPIE en 2 lignes diagonales
      page.drawText(diagonalText, {
        x: cx - diagSize * 3.5,
        y: cy + diagSize * 0.6,
        size: diagSize,
        font: helvBold,
        color: rgb(0.35, 0.35, 0.35),
        opacity,
        rotate: degrees(30),
      });
      page.drawText(opts.recipientName, {
        x: cx - diagSize * 3.5 + diagSize * 0.3,
        y: cy - diagSize * 0.4,
        size: diagSize * 0.6,
        font: helv,
        color: rgb(0.4, 0.4, 0.4),
        opacity,
        rotate: degrees(30),
      });

      // 2) Pied de page discret (8px) - hors zone signature
      const footerY = 8;
      const footerLeft = `Envoyée à ${opts.recipientName}${
        opts.recipientEmail ? ` · ${opts.recipientEmail}` : ""
      } · ${dateStr} ${timeStr}`;
      page.drawText(footerLeft, {
        x: 18,
        y: footerY,
        size: 6,
        font: helv,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.7,
      });
      if (opts.docRef) {
        const refText = `ref: ${opts.docRef}`;
        const refWidth = helv.widthOfTextAtSize(refText, 6);
        page.drawText(refText, {
          x: width - refWidth - 18,
          y: footerY,
          size: 6,
          font: helv,
          color: rgb(0.5, 0.5, 0.5),
          opacity: 0.7,
        });
      }
    }

    return await doc.save();
  } catch (e) {
    console.warn("[pdf-watermark] échec watermark, fallback original:", (e as Error).message);
    return pdfBytes;
  }
}
