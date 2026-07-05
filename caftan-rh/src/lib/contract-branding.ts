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
