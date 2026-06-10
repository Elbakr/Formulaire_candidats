// Karim 2026-06-10 : fixe le fuseau horaire du serveur a Europe/Brussels.
//
// Vercel (et la plupart des hosts Node) tournent en UTC par defaut -> sans ca,
// tout le rendu cote serveur affiche l'heure UTC. register() s'execute UNE fois
// au demarrage du serveur, AVANT toute requete (donc avant tout formatage Intl),
// ce qui permet a `toLocale*` de prendre Europe/Brussels comme defaut.
//
// IMPORTANT (fiabilite) : completer par une variable d'environnement
// `TZ=Europe/Brussels` dans les reglages Vercel — lue avant le demarrage du
// process, c'est la methode 100% fiable sur serverless. Ce hook est le filet
// pour le dev local et l'auto-hebergement. Les ecrans critiques utilisent en
// plus le helper src/lib/datetime.ts (timeZone explicite, garanti).
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.TZ || "Europe/Brussels";
  }
}
