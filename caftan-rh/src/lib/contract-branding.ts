import "server-only";
import { CAFTAN_LOGO_DATA_URL } from "@/lib/contract-logo";

// Karim 2026-07-05 : BRANDING RÉUTILISABLE (filigrane + logo en-tête) pour TOUT
// document officiel généré par l'employeur (contrats, convention de rupture, et
// tout futur document). Un seul point d'application -> cohérence garantie.
//   - filigrane : logo centré très pâle (~5 %), derrière le texte, répété sur
//     chaque page (position: fixed -> Chromium le répète à l'impression).
//   - en-tête : petit logo en haut à droite de chaque page.
//   - withBranding=false -> version NEUTRE sans logo/filigrane (besoins spécifiques).

export function documentBrandingCss(withBranding = true): string {
  if (!withBranding) return "";
  return `
  .brand-watermark {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 12cm; max-width: 68%; opacity: 0.13; z-index: 0; pointer-events: none;
  }
  .brand-watermark img { width: 100%; height: auto; display: block; }
  /* Karim 2026-07-05 : logo d'en-tête FIXE retiré (se superposait au titre + au
     texte). Le filigrane suffit ; un en-tête corporate en flux est à l'étude. */
  /* Le contenu du document passe AU-DESSUS du filigrane (lisibilité). */
  body > *:not(.brand-watermark) { position: relative; z-index: 1; }
  `;
}

export function documentBrandingHtml(withBranding = true): string {
  if (!withBranding) return "";
  return `<div class="brand-watermark"><img src="${CAFTAN_LOGO_DATA_URL}" alt=""></div>`;
}

// Karim 2026-07-05 : EN-TÊTE CORPORATE (option) — remplace l'encadré du titre par
// un petit logo centré EN FLUX (aucune superposition) + titre épuré (majuscules
// espacées) souligné d'un fin filet. Compact -> préserve le nombre de pages.
// headerStyle='classic' garde l'encadré validé. Bascule à tout moment.
export function corporateHeaderCss(): string {
  return `
  body.header-corporate .doc-title {
    border: none; padding: 0 0 0.1cm 0; margin: 0 0 0.2cm 0;
    border-bottom: 0.75pt solid #111;
  }
  body.header-corporate .doc-title h1 { letter-spacing: 0.16em; font-weight: 600; }
  /* Karim 2026-07-05 : logo AGRANDI (1,25cm) ; marges resserrées pour compenser
     et préserver le nombre de pages. */
  .doc-logo { text-align: center; margin: 0 0 0.05cm 0; line-height: 0; }
  .doc-logo img { height: 1.25cm; width: auto; display: inline-block; }
  `;
}

export function corporateHeaderHtml(): string {
  return `<div class="doc-logo"><img src="${CAFTAN_LOGO_DATA_URL}" alt="Caftan Factory"></div>`;
}
