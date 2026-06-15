// Karim 2026-06-15 : rendu HTML -> PDF A4 FIDÈLE via Chromium headless.
// Utilisé pour générer le PDF des contrats (super layout pixel-perfect) :
// pièce jointe du mail de signature + téléchargement candidat/RH.
//
// - Sur Vercel/serverless : binaire @sparticuz/chromium (conçu pour Lambda).
// - En local : Chrome système si dispo (CHROME_PATH, sinon chemins usuels).
// preferCSSPageSize=true -> respecte le @page (A4 + marges) du CONTRACT_CSS.

import "server-only";

function localChromePath(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates[0];
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.AWS_EXECUTION_ENV;
  const puppeteer = await import("puppeteer-core");

  let executablePath: string | undefined;
  let args: string[] = [];
  let defaultViewport: { width: number; height: number } | null = null;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
    defaultViewport = chromium.defaultViewport;
  } else {
    executablePath = localChromePath();
    args = ["--no-sandbox", "--disable-setuid-sandbox"];
  }

  const browser = await puppeteer.launch({
    args,
    executablePath,
    headless: true,
    defaultViewport,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true, // respecte @page (A4 + marges) du super layout
      format: "A4",
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
