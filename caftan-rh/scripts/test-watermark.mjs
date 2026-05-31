// Karim 2026-05-31 : test du watermark dynamique sur une vraie fiche de paie.
// Usage : cd caftan-rh && node scripts/test-watermark.mjs
//
// 1. Pick la fiche la plus récente de la BD (avec employee_id + pdf_storage_path)
// 2. Download le PDF original depuis le bucket payslips
// 3. Apply watermark "COPIE PERSONNELLE" + nom + date
// 4. Sauve sur le Desktop sous le nom test-watermark.pdf
// 5. Ouvre automatiquement avec le viewer par défaut

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

config({ path: ".env.local" });
config({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("[X] manque NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

// 1. Pick la plus récente
const { data: payslip, error: e1 } = await supa
  .from("payslips")
  .select("id, employee_id, pdf_storage_path, pdf_filename, period_label, net_amount")
  .not("pdf_storage_path", "is", null)
  .not("employee_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

if (e1 || !payslip) {
  console.error("[X] aucune fiche trouvée:", e1?.message);
  process.exit(1);
}

const { data: emp } = await supa
  .from("employees")
  .select("full_name, email")
  .eq("id", payslip.employee_id)
  .single();

console.log(`Fiche choisie : ${emp?.full_name ?? "?"} - ${payslip.period_label} - ${payslip.net_amount} EUR`);
console.log(`Storage path : ${payslip.pdf_storage_path}`);

// 2. Download
const { data: blob, error: e2 } = await supa.storage
  .from("payslips")
  .download(payslip.pdf_storage_path);
if (e2 || !blob) {
  console.error("[X] download échec:", e2?.message);
  process.exit(1);
}
const origBytes = new Uint8Array(await blob.arrayBuffer());
console.log(`PDF original : ${origBytes.length} bytes`);

// 3. Watermark (copie locale de la logique de lib/pdf-watermark.ts)
async function applyDynamicWatermark(bytes, opts) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sentAt = opts.sentAt ?? new Date();
  const dateStr = sentAt.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = sentAt.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
  const diagonalText = opts.diagonalText ?? "COPIE PERSONNELLE";
  const opacity = opts.opacity ?? 0.10;

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const diagSize = Math.min(width, height) * 0.08;
    const cx = width / 2;
    const cy = height / 2;
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
    const footerY = 8;
    const footerLeft = `Envoyée à ${opts.recipientName}${opts.recipientEmail ? ` · ${opts.recipientEmail}` : ""} · ${dateStr} ${timeStr}`;
    page.drawText(footerLeft, { x: 18, y: footerY, size: 6, font: helv, color: rgb(0.5, 0.5, 0.5), opacity: 0.7 });
    if (opts.docRef) {
      const refText = `ref: ${opts.docRef}`;
      const refWidth = helv.widthOfTextAtSize(refText, 6);
      page.drawText(refText, { x: width - refWidth - 18, y: footerY, size: 6, font: helv, color: rgb(0.5, 0.5, 0.5), opacity: 0.7 });
    }
  }
  return await doc.save();
}

const wmBytes = await applyDynamicWatermark(origBytes, {
  recipientName: emp?.full_name ?? "Test Destinataire",
  recipientEmail: emp?.email ?? "test@example.com",
  docRef: payslip.id.slice(0, 8),
  diagonalText: "COPIE PERSONNELLE",
});
console.log(`PDF watermarké : ${wmBytes.length} bytes`);

// 4. Save sur Desktop
const outPath = resolve(homedir(), "Desktop", "test-watermark.pdf");
await writeFile(outPath, wmBytes);
console.log(`\n✓ Fichier écrit : ${outPath}`);

// 5. Ouvre avec viewer par défaut (Windows)
console.log("\nOuverture du PDF...");
spawn("cmd", ["/c", "start", "", outPath], { stdio: "ignore", detached: true }).unref();
