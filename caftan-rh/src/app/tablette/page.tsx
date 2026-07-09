// Karim 2026-07-09 (Phase 3) : page PUBLIQUE (sans auth) « Tablette planning ».
// Pensée pour une tablette PARTAGÉE posée en magasin : plein écran, gros boutons
// tactiles. Le travailleur saisit son CODE PERSONNEL sur un clavier numérique et
// voit SON planning par défaut (variante sélectionnée, défaut A) en LECTURE
// SEULE. Aucune navigation vers le reste de l'app, aucune donnée interne.

import { TabletteClient } from "./tablette-client";

export const dynamic = "force-dynamic";

export default function TablettePage() {
  return <TabletteClient />;
}
