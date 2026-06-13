// Karim 2026-06-13 : routage UNIQUE des clics de notification. Que ce soit
// depuis la cloche, la page liste ou un push, cliquer une notification doit
// ouvrir DIRECTEMENT l'ecran d'action concerne (repondre a un echange, voir un
// renfort, etc.) — pas une page detail intermediaire.
//
// Regle : si la notif porte un lien vers une vraie ressource actionnable, on y
// va direct. Sinon (notif structuree sans objet : rapport sante systeme,
// selftest Gmail, digest...), on ouvre la page detail qui affiche le contenu.

export function notifHref(n: { id: string; link: string | null }): string {
  const detail = `/me/notifications/${n.id}`;
  const link = n.link?.trim();
  if (!link) return detail;

  // Lien absolu vers notre domaine -> on ne garde que le chemin (router SPA).
  if (/^https?:\/\//i.test(link)) {
    try {
      const u = new URL(link);
      const path = u.pathname + u.search;
      return path.startsWith("/me/notifications") ? detail : path;
    } catch {
      return detail;
    }
  }

  // Lien relatif : page detail explicite -> detail ; sinon ressource directe.
  return link.startsWith("/me/notifications") ? detail : link;
}
