// Karim 2026-07-04 : rendu HTML -> PDF A4 FIDÈLE (super layout préservé).
// Moteur PRIMAIRE = Chromium serverless (@sparticuz/chromium + puppeteer-core) =
// GRATUIT, aucun crédit, rendu navigateur exact. Secours = PDFShift (si crédits).
// Si les deux échouent -> throw (les appelants retombent sur leur repli HTML).
//
// Historique : on était passé 100% PDFShift, dont les crédits gratuits se sont
// épuisés ("No remaining credits left" -> contrat envoyé en HTML). Les libs
// Chromium étant déjà installées, on les remet en primaire.

import "server-only";

const PDFSHIFT_ENDPOINT = "https://api.pdfshift.io/v3/convert/pdf";

// PDFShift ET Chromium attendent un document complet ; PDFShift v3 exige même que
// la source commence par <!DOCTYPE / <html / http. Le super layout ne commence pas
// toujours ainsi -> on l'enveloppe si besoin (corrige l'erreur 400 historique).
function ensureFullHtml(html: string): string {
  const t = html.trimStart();
  if (/^<!doctype/i.test(t) || /^<html[\s>]/i.test(t) || /^https?:\/\//i.test(t)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

async function viaChromium(html: string): Promise<Uint8Array> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(ensureFullHtml(html), { waitUntil: "load" });
    // preferCSSPageSize + printBackground : respecte le @page (A4/marges) et les
    // fonds/bordures du super layout.
    const pdf = await page.pdf({ format: "a4", printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

async function viaPdfShift(html: string): Promise<Uint8Array> {
  const key = process.env.PDFSHIFT_API_KEY;
  if (!key || !key.trim()) throw new Error("PDFSHIFT_API_KEY manquant.");
  const res = await fetch(PDFSHIFT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${key.trim()}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: ensureFullHtml(html), format: "A4", use_print: true, sandbox: false }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PDFShift HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  try {
    return await viaChromium(html);
  } catch (e1) {
    console.warn("[pdf] Chromium KO, essai PDFShift:", (e1 as Error).message);
    return await viaPdfShift(html); // relance si KO -> repli HTML côté appelant
  }
}
