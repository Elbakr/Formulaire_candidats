// Karim 2026-06-16 : rendu HTML -> PDF A4 FIDÈLE via un service externe (PDFShift).
// Décision : le Chromium in-house (@sparticuz) ne s'embarquait pas correctement
// dans la fonction Vercel. On passe par un service HTML→PDF fiable.
//
// Même signature que la version précédente -> tous les appelants (route PDF,
// mail de contrat signé) marchent sans changement. Si PDFSHIFT_API_KEY manque,
// on throw -> les appelants retombent sur leur repli (pièce jointe HTML).
//
// Config requise : variable d'env PDFSHIFT_API_KEY (compte pdfshift.io).
// Le HTML (super layout) contient son propre CSS @page (A4 + marges) -> use_print
// pour appliquer la feuille d'impression.

import "server-only";

const PDFSHIFT_ENDPOINT = "https://api.pdfshift.io/v3/convert/pdf";

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const key = process.env.PDFSHIFT_API_KEY;
  if (!key || !key.trim()) {
    throw new Error("PDFSHIFT_API_KEY manquant (service PDF non configuré).");
  }

  const res = await fetch(PDFSHIFT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${key.trim()}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      format: "A4",
      use_print: true, // applique le CSS @page / @media print du super layout
      sandbox: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PDFShift HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
