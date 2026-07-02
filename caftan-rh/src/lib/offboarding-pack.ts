// Karim 2026-07-02 : message du "pack de sortie" (fin de contrat).
// Bilingue FR/NL, choisi selon employees.preferred_language.
// Contenu validé par Karim : salaires versés + remerciements chaleureux +
// possibilité de rappel + C4 signé par la direction et transmis dès réception +
// disponibilité pour la mise en conformité sociale. Signature = "La direction".
//
// NB : le C4 n'est pas généré par l'app ; l'admin peut le joindre manuellement
// (bouton "+ Ajouter des fichiers" du dialog). Le message annonce simplement
// qu'il sera signé par la direction et transmis dès réception du secrétariat social.

export type PackLang = "fr" | "nl";

export function packLangFromPreferred(preferred: string | null | undefined): PackLang {
  return preferred === "nl" ? "nl" : "fr"; // défaut FR (incl. en/null)
}

/**
 * Construit sujet + corps (texte brut) du pack de sortie dans la bonne langue.
 * Le corps est édité/relu par l'admin avant envoi (le dialog le pré-remplit).
 */
export function buildOffboardingPackMessage(
  lang: PackLang,
  ctx: { firstName: string },
): { subject: string; body: string } {
  const first = ctx.firstName?.trim() || (lang === "nl" ? "" : "");

  if (lang === "nl") {
    const subject = "Uw einddocumenten en onze oprechte dank — Caftan Factory";
    const body = `Beste ${first || "collega"},

Wij bevestigen dat alle bedragen die u verschuldigd waren voor uw laatste maand prestatie werden uitbetaald. In bijlage vindt u uw bijhorende loonfiche(s).

Namens het volledige team van Caftan Factory danken wij u van harte voor uw inzet, uw professionaliteit en de bijdrage die u tijdens uw periode bij ons hebt geleverd. Uw werk heeft een verschil gemaakt.

Dit is niet noodzakelijk een afscheid: wij zouden graag opnieuw een beroep op u doen mocht dit in de toekomst nodig zijn.

Wat uw einddocumenten betreft: uw C4 wordt door de directie ondertekend en aan u ter beschikking gesteld zodra wij het van ons sociaal secretariaat ontvangen. Daarnaast blijven wij volledig tot uw beschikking om u alle nuttige elementen te bezorgen voor het in orde brengen van uw sociale situatie.

Wij wensen u veel succes in uw verdere loopbaan.

Met vriendelijke groeten,
De directie — Caftan Factory`;
    return { subject, body };
  }

  const subject = "Vos documents de fin de contrat et nos remerciements — Caftan Factory";
  const body = `Bonjour ${first || ""},

Nous vous confirmons que l'ensemble des sommes qui vous étaient dues au titre de votre dernier mois de prestation ont bien été versées. Vous trouverez ci-joint votre (vos) fiche(s) de paie correspondante(s).

Au nom de toute l'équipe de Caftan Factory, nous tenons à vous remercier chaleureusement pour votre engagement, votre sérieux et la contribution que vous avez apportée durant votre présence parmi nous. Votre travail a compté.

Sachez qu'il ne s'agit pas nécessairement d'un adieu : ce serait avec plaisir que nous ferions de nouveau appel à vous si nos besoins venaient à le justifier.

Concernant vos documents de fin de contrat, votre C4 sera signé par la direction et mis à votre disposition dès sa réception auprès de notre secrétariat social. Nous restons par ailleurs à votre entière disposition pour vous fournir tout élément utile à la mise en conformité de votre situation sociale.

Nous vous souhaitons une pleine réussite dans la suite de votre parcours.

Bien cordialement,
La direction — Caftan Factory`;
  return { subject, body };
}
