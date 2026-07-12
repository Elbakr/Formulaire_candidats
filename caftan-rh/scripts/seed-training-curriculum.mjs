// Karim 2026-07-12 : DOSSIER COMPLET du manuel de formation, reconstruit à partir du
// contenu ChatGPT fourni par Karim (uniquement les parties rédigées par ChatGPT).
// Parcours drip 30 modules : 24 leçons riches + 6 examens crescendo. Enchaînement :
// accueil -> fondations -> métier -> excellence -> situations réelles -> évolution -> bilan.
// NL laissé vide (fallback FR côté page) -> passe de traduction en suivi.
import { readFileSync } from "node:fs";
import pg from "pg";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.replace(/^["']|["']$/g, "").trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const Q = (q_fr, cf, correct) => ({ q_fr, q_nl: null, choices_fr: cf, choices_nl: null, correct });

const L = []; // lessons + exams, dans l'ordre
const lesson = (category, title_fr, body_fr) => L.push({ kind: "lesson", category, title_fr, body_fr });
const exam = (level, title_fr, body_fr, questions) => L.push({ kind: "exam", category: "Examen", title_fr, body_fr, exam_level: level, questions });

// ── 1. Accueil & fondations ──────────────────────────────────────────────────
lesson("Bienvenue", "Bienvenue chez Caftan Factory 🎉",
`Bonjour et bienvenue dans l'équipe ! 🎉

Ta formation démarre aujourd'hui et va t'accompagner, pas à pas, pendant tes premières semaines. Chaque jour, tu recevras une courte section — concrète et utile tout de suite en magasin.

Personne n'attend la perfection : chacun débute. Ce qui se remarque très vite, ce n'est pas l'expérience, c'est la manière d'aborder ses débuts : la maturité, le sens du collectif, et la capacité à s'adapter à l'équipe que l'on rejoint — car chaque équipe a ses codes, son rythme et ses équilibres.

En gardant ces repères à l'esprit dès maintenant, tu corrigeras naturellement les petites maladresses de débutant, et tu montreras — sans même avoir à le dire — que tu as l'étoffe d'un(e) vrai(e) professionnel(le) et d'un(e) coéquipier(ère) précieux(se).

Retiens l'esprit plus que la lettre, et fais-nous confiance : nous sommes là pour t'accompagner. 💛`);

lesson("Les fondations", "L'esprit Caftan Factory & le code couleur des règles 🔴🟠🟢",
`Pour t'y retrouver facilement, chaque règle de ce guide a une couleur :

🔴 RÈGLE NON NÉGOCIABLE — tout écart est une faute grave.
(ex. la caisse, la sécurité, le téléphone perso en service, les remises non autorisées)

🟠 STANDARD DE QUALITÉ — attendu de chaque collaborateur.
(ex. l'accueil, le rangement, la tenue, la ponctualité)

🟢 BONNE PRATIQUE — ce qui distingue un bon collaborateur d'un excellent.
(ex. l'entraide, l'anticipation, l'attention aux détails, l'amélioration continue)

Garde ce code en tête : il te dira toujours, en un coup d'œil, ce qui relève de la conformité, de la qualité de service, ou de ce qui te fera te démarquer positivement. 😉`);

lesson("Ponctualité & présence", "Ponctualité & présence ⏰",
`La base d'un pro : être là, à l'heure, prêt(e). 🟠

✅ Sois présent(e) et prêt(e) à l'ouverture du shift — pas « à l'heure pile ».
✅ Ne quitte pas ton poste avant la fin du shift ou de la fermeture.
✅ Toute absence du rayon, même courte, se signale au responsable (jamais la surface sans personne).
🔴 Ne jamais laisser le magasin sans surveillance pendant les heures d'ouverture.
✅ En cas de retard ou d'empêchement, préviens le responsable le plus tôt possible.
✅ Consulte et respecte le planning affiché ; on n'improvise pas ses horaires.`);

lesson("Tenue & attitude", "Tenue & attitude ✨",
`Ton attitude et ta tenue, c'est la première image du magasin. 🟠

✅ Tenue soignée et conforme aux consignes : tu portes l'image de l'enseigne.
✅ Le sourire et l'amabilité avec chaque client, du premier au dernier.
✅ Reste ouvert(e), à l'écoute et positif(ve), même face à une remarque.
🟢 De l'énergie et de l'implication : évite la nonchalance et la passivité.`);

exam(1, "Petit examen — niveau 1 🧩",
`Un premier petit défi pour valider les bases (accueil, ponctualité, tenue). Réponds avec sincérité — c'est aussi pour t'aider à progresser. 💪`,
[
 Q("À quelle heure dois-tu être prêt(e) à travailler ?", ["À l'heure pile du shift", "Prêt(e) avant le début du shift", "Quelques minutes après"], 1),
 Q("Le magasin peut-il rester sans surveillance en heures d'ouverture ?", ["Oui un court instant", "Jamais", "Si je reste près de la porte"], 1),
 Q("Ta tenue et ton attitude, c'est…", ["Sans importance", "La première image du magasin, à soigner", "Seulement pour les responsables"], 1),
]);

// ── 2. Le métier ─────────────────────────────────────────────────────────────
lesson("Vente", "La priorité n°1 : le client — accueil & vente 🛍️",
`Le cœur du métier : accueillir et conseiller chaque client. 🟠🟢

🔴 PRIORITÉ N°1 : accueille, salue et va vers CHAQUE client qui entre.
✅ Sois en surface, disponible et actif(ve) : la caisse n'est pas un poste de repli.
🟢 Conseille : propose les tailles, les pièces complémentaires, la vente additionnelle.
✅ Ne laisse jamais un client sans réponse ou en attente : prends-le en charge vite.
✅ Connais la gamme, les tailles et le stock pour bien conseiller.
🟢 Oriente vers la retouche express quand elle permet de conclure une vente.`);

lesson("Rayon & présentation", "Le rayon : ordre et attractivité 👕",
`Un rayon net et complet donne envie d'acheter. 🟠

✅ Rayons ordonnés et attractifs en permanence.
✅ Sors les tailles/variantes disponibles en réserve pour compléter le rayon.
✅ Réassortis dès qu'un modèle se vide, sans attendre.
🟢 Cintres dans le bon sens, tailles classées : présentation soignée.
✅ Vitrine propre, complète et à jour : c'est la première impression du magasin.`);

lesson("Propreté & cabines", "Cabines & propreté 🧽",
`Un magasin propre, c'est un magasin qui inspire confiance. 🟠

✅ Sol, vitrines, cabines et caisse : propres et rangés toute la journée.
✅ Reconditionne et replie immédiatement après chaque client.
✅ Remets les cabines en ordre après chaque passage — le client suivant ne doit jamais subir le désordre du précédent.
✅ Assure le rangement complet avant la fermeture.`);

lesson("Caisse & procédures", "La caisse : rigueur absolue 💳",
`La caisse, c'est de la rigueur et de la confiance à chaque transaction. 🔴

🔴 Encaisse avec rigueur : rendu de monnaie, montants, moyens de paiement.
🔴 Échanges et remboursements STRICTEMENT réglementés : toujours faire valider par le responsable.
🔴 Respecte la procédure de caisse à chaque transaction (ticket, ouverture/fermeture).
🔴 Ne jamais laisser la caisse ouverte ou sans surveillance.`);

exam(2, "Petit examen — niveau 2 🧩",
`On monte d'un cran ! 🧩 Un défi sur le client, le rayon et la caisse.`,
[
 Q("Quand un client entre, ta priorité n°1 est de…", ["Finir ce que tu fais", "L'accueillir et aller vers lui", "Attendre qu'il demande"], 1),
 Q("Un client veut un échange ou un remboursement. Tu…", ["Le fais toi-même", "Fais valider par le responsable", "Refuses directement"], 1),
 Q("La caisse peut-elle rester ouverte sans surveillance ?", ["Oui un instant", "Jamais", "Si je reste à proximité"], 1),
 Q("Un modèle se vide alors qu'il y a du stock. Tu…", ["Attends la fin de journée", "Réassortis dès que possible", "Ne fais rien"], 1),
]);

// ── 3. La vie d'équipe ───────────────────────────────────────────────────────
lesson("Pauses", "Les pauses : ne jamais laisser un magasin découvert ☕",
`Bien prendre sa pause = ne jamais laisser un point de vente sans personne. 🔴🟠

🔴 Une pause ne doit JAMAIS laisser une équipe ou un magasin sans personne : coordonne impérativement.
✅ Décale ta pause hors des pics d'affluence pour rester disponible.
✅ Respecte la durée et le nombre de pauses convenus, et reviens à l'heure exacte.
✅ Annonce et fais valider ta pause pour assurer la continuité du service.
✅ N'enchaîne pas pause + retour tardif : cela double l'absence du poste.`);

lesson("Communication & hiérarchie", "Communication & hiérarchie 🗣️",
`Bien communiquer évite 90% des problèmes. 🟠

🔴 Remonte IMMÉDIATEMENT tout problème, incident ou anomalie au responsable.
🔴 Aucune remise, modification de prix ou geste commercial sans l'accord du responsable.
✅ Transmets les infos clés : livraisons, ruptures, clients particuliers, consignes.`);

lesson("Relations avec les collègues", "Vivre en équipe : relations avec les collègues 🤝",
`Une bonne équipe, c'est du respect et de l'entraide. 🟠🟢

✅ Garde une distance professionnelle : trop de proximité nuit au cadre.
✅ Priorité au client et au service, pas à la vie sociale.
✅ Évite les attroupements et bavardages en rayon ; reste réparti(e) en surface.
✅ Aucun commentaire sur un client ou un collègue à portée d'oreille de la clientèle.
✅ Ne prends pas parti dans les conflits internes ; évite rumeurs et commérages.
✅ Reste sur ton point de vente ; ne te promène pas dans les autres magasins sans motif, et informe le responsable de tout déplacement.
✅ Hors service, quitte le magasin ; ne reste pas pour socialiser.`);

lesson("Téléphone & réseaux", "Téléphone & réseaux sociaux 📵",
`En service, le téléphone perso reste rangé. 🔴

🔴 Le téléphone personnel n'a pas sa place en surface pendant le service.
🔴 Pas de photos/vidéos en magasin sans autorisation.
✅ Les appels privés se font en dehors du service, hors surface.`);

exam(3, "Petit examen — niveau 3 🧩",
`Ça se corse un peu ! 🧩 Un défi sur la vie d'équipe : pauses, communication, collègues, téléphone.`,
[
 Q("Ta pause tombe en pleine affluence. Tu…", ["La prends quand même", "La décales hors du pic, en coordination", "L'annules complètement"], 1),
 Q("Une pause peut-elle laisser un magasin sans personne ?", ["Oui si c'est court", "Jamais : on coordonne pour tout couvrir", "Oui en heures creuses"], 1),
 Q("Ton téléphone personnel pendant le service…", ["Reste rangé, hors surface", "OK si discret", "OK à la caisse"], 0),
 Q("Tu apprends une info importante (livraison, rupture). Tu…", ["La gardes pour toi", "La transmets à l'équipe / au responsable", "Attends qu'on te demande"], 1),
 Q("Un désaccord avec un collègue devant des clients. Tu…", ["Règles ça tout de suite devant tout le monde", "Le règles à l'écart, jamais devant la clientèle", "Ignores le collègue toute la journée"], 1),
]);

// ── 4. Excellence ────────────────────────────────────────────────────────────
lesson("Sécurité & anti-vol", "Sécurité & anti-vol 🔒",
`Protéger le magasin, c'est protéger l'équipe. 🔴

🔴 Reste vigilant(e) : surveillance active de la surface et prévention du vol.
🔴 Ne laisse pas de zones aveugles ou non surveillées, surtout en affluence.
🔴 Applique strictement les consignes de sécurité et la procédure de fermeture.`);

lesson("Situations difficiles", "Garder son calme : les situations difficiles 🧘",
`Garder son calme fait toute la différence. 🟠🟢

✅ Face à un client mécontent : reste calme, courtois(e) et professionnel(le) ; escalade au responsable si besoin.
✅ Règle tout désaccord (client ou collègue) à l'écart et hors des heures de pointe — jamais devant la clientèle.

🟢 La bonne attitude qui marche presque toujours : écouter, respecter, rester honnête, chercher une solution.`);

lesson("Les 10 règles d'or", "Les 10 règles d'or ⭐",
`Si tu ne devais retenir que dix choses, ce serait celles-ci :

1. Le client passe toujours avant ton téléphone.
2. Chaque vêtement doit être replacé comme si tu étais le client suivant.
3. Un problème signalé rapidement est presque toujours un petit problème.
4. Les mauvaises habitudes se propagent aussi vite que les bonnes.
5. La qualité se cache dans les détails.
6. Chaque client doit repartir avec une bonne image de Caftan Factory.
7. Lorsque tu ne sais pas, demande.
8. Nous gagnons ensemble.
9. La confiance vaut plus que n'importe quelle vente.
10. Ton attitude est aussi importante que tes compétences. ⭐`);

lesson("Erreurs coûteuses", "Les erreurs qui coûtent le plus cher ⚠️",
`Certaines erreurs coûtent bien plus que les autres. Garde-les en tête :

⚠️ Oublier un antivol.
⚠️ Laisser une caisse ouverte.
⚠️ Oublier de fermer une cabine.
⚠️ Oublier un article.
⚠️ Mal rendre la monnaie.
⚠️ Appliquer une remise non autorisée.
⚠️ Ne pas accueillir un client.
⚠️ Ne pas signaler un incident.

La bonne nouvelle : toutes s'évitent avec un peu d'attention et le réflexe de demander en cas de doute. 😉`);

exam(4, "Petit examen — niveau 4 🧩",
`Niveau costaud ! 💪 Sécurité, sang-froid, règles d'or et erreurs à éviter.`,
[
 Q("En forte affluence, la surveillance anti-vol…", ["Peut être relâchée", "Doit rester active, pas de zone aveugle", "N'est plus ta responsabilité"], 1),
 Q("Face à un client mécontent, tu…", ["Hausses le ton", "Restes calme et courtois(e), escalades si besoin", "L'ignores"], 1),
 Q("Parmi ces erreurs, laquelle coûte le plus cher ?", ["Replier un pull lentement", "Laisser une caisse ouverte", "Sourire trop"], 1),
 Q("Quand tu ne sais pas / tu as un doute, la règle d'or dit…", ["Prendre une initiative risquée", "Demander", "Ne rien faire du tout"], 1),
 Q("Un incident survient. Le bon réflexe :", ["Ne rien dire pour éviter les ennuis", "Le signaler immédiatement au responsable", "Le régler seul(e) sans en parler"], 1),
]);

// ── 5. Se démarquer ──────────────────────────────────────────────────────────
lesson("Les meilleurs vendeurs", "Les habitudes des meilleurs vendeurs 🏆",
`Ce que font, tous les jours, celles et ceux sur qui l'équipe compte le plus :

🏆 Ils observent avant d'agir, et écoutent avant de répondre.
🏆 Ils vont vers le client avec le même sourire à 10h qu'à 19h55.
🏆 Ils connaissent leurs produits, leurs tailles et leur stock.
🏆 Ils anticipent : ils rangent, réassortissent et aident avant qu'on le demande.
🏆 Ils signalent vite le moindre problème.
🏆 Ils forment et rassurent les nouveaux.
🏆 Ils quittent le magasin en meilleur état qu'ils ne l'ont trouvé.

Le talent aide ; ce sont les habitudes qui font la différence. 😉`);

lesson("Les mots justes", "Les mots qui font la différence : à dire / à éviter 💬",
`Les mots comptent autant que le geste.

✅ À DIRE
Au lieu de « Je ne sais pas » → « Je vais vérifier afin de vous donner la bonne information. »
« Avec plaisir. » · « Je vous accompagne. » · « Prenez votre temps. » · « Merci de votre visite. »

❌ À ÉVITER
« Ce n'est pas mon rayon. »
« Ce n'est pas mon problème. »
« Je ne peux rien faire. »

Une phrase positive transforme une hésitation en confiance. 💬`);

lesson("Les petits détails", "Les petits détails qui changent tout ✨",
`Ces détails ne figurent presque jamais dans les manuels — et c'est exactement là qu'on fait la différence :

✨ Toujours remettre les cintres dans le même sens.
✨ Regarder le client lorsqu'on lui parle.
✨ Ne jamais pointer du doigt.
✨ Accompagner le client jusqu'au rayon plutôt que de montrer une direction.
✨ Remercier même un client qui n'achète rien.
✨ Ne jamais faire sentir au client qu'il dérange.`);

lesson("Situations réelles", "Situations réelles du terrain — partie 1 🎭",
`Sur le terrain, la vraie question n'est pas « quelle est la procédure ? » mais « que faire quand ça m'arrive ? ». Voici des cas vécus. 🎭

1) Une cliente veut essayer 18 robes → accueille avec enthousiasme, prépare la cabine, range au fur et à mesure. À la fin : « Si nous devions garder vos trois préférées, lesquelles ? » Tu aides, tu ne décides pas à sa place.
2) Elle regarde souvent le prix → parle d'abord de la valeur, de la qualité, du confort, de l'occasion. Puis laisse-la réfléchir.
3) Appel vidéo avec son mari → autorisé. Ne l'interromps jamais ; propose même de présenter la robe face à la caméra.
4) « Je reviendrai avec ma mère » → « Avec plaisir, nous vous accueillerons toutes les deux. » Pas de pression, plus de retours.
5) Elle veut un avis sincère → ne dis jamais « tout vous va ». Choisis vraiment, explique, justifie.
6) Deux clientes en même temps → « Je termine avec Madame et je viens vers vous. » Être vue suffit à faire patienter.
7) Un enfant joue derrière les robes → approche les parents en souriant : « Nous avons des articles fragiles, pourriez-vous garder votre petit près de vous ? Merci beaucoup. » Toujours avec douceur.
8) Cabine laissée en désordre → remercie, puis remets en état immédiatement. Jamais d'agacement.
9) « Je vais commander sur Internet » → ne critique jamais Internet : « Je comprends, si je peux répondre à une question, avec plaisir. »
10) Un client reste 20 min sans rien demander → « Je vois que vous prenez le temps ; si je peux vous orienter, avec plaisir. »`);

exam(5, "Petit examen — niveau 5 🧩",
`Presque au bout ! 🎭 Un défi sur les habitudes gagnantes, les mots justes et les situations réelles.`,
[
 Q("Un client hésite à cause du prix. Tu…", ["Baisses le prix toi-même", "Parles d'abord de la valeur, qualité, confort", "Lui dis que c'est cher partout"], 1),
 Q("Au lieu de « Je ne sais pas », tu dis…", ["« Ce n'est pas mon rayon »", "« Je vais vérifier afin de vous donner la bonne information »", "« Je ne peux rien faire »"], 1),
 Q("Une cliente laisse la cabine en désordre. Tu…", ["Montres ton agacement", "Remercies et remets en état immédiatement", "Attends la fermeture"], 1),
 Q("Un client reste 20 min sans rien demander. Tu…", ["Le laisses seul, il veut la paix", "T'approches : « si je peux vous orienter, avec plaisir »", "Lui demandes de se dépêcher"], 1),
 Q("Un petit détail qui fait la différence :", ["Pointer du doigt la direction", "Accompagner le client jusqu'au rayon", "Ignorer un client qui n'achète pas"], 1),
]);

// ── 6. Évolution & bilan ─────────────────────────────────────────────────────
lesson("Situations réelles", "Situations réelles du terrain — partie 2 + les 10 réflexes 🎭",
`La suite des cas vécus :

11) Cliente 5 min avant la fermeture → même accueil que les autres ; informe avec courtoisie des horaires tout en continuant à l'aider.
12) Cliente qui ne parle pas français → mots simples, gestes, sourire ; demande l'aide d'un collègue si besoin. Nous accueillons le monde entier.
13) Cliente pressée → montre 3 modèles, les plus adaptés. La qualité du conseil prime sur la quantité.
14) « Vous choisiriez laquelle ? » → explique toujours pourquoi. Le raisonnement inspire plus confiance que la réponse.
15) Elle change d'avis trois fois → aucune impatience. Accompagne, ne pousse jamais.
16) Groupe de 5 personnes qui parlent à sa place → recentre : « Et vous, dans laquelle vous sentez-vous le mieux ? »
17) « Quel est votre meilleur vendeur ? » → « Nous travaillons en équipe ; dites-moi ce que vous cherchez, nous vous conseillons au mieux. »
18) Demande de photos → explique la politique, puis propose l'alternative : « les appels vidéo sont autorisés ».
19) Cliente gênée en cabine → respecte l'intimité, frappe doucement, demande avant d'ouvrir un rideau.
20) Tu ne connais pas la réponse → « Je préfère vérifier pour vous donner une information exacte. »

🔟 LES 10 RÉFLEXES : Observer avant d'agir · Écouter avant de répondre · Expliquer avant de refuser · Vérifier avant d'affirmer · Rassurer avant de convaincre · Aider avant qu'on te le demande · Respecter avant tout · Anticiper les besoins · Garder son calme · Donner envie de revenir.`);

lesson("Ta progression", "Ta progression : de Jour 1 à 3 mois 📈",
`Voici ce que l'on regarde, étape par étape — pas pour te juger, mais pour t'aider à monter en compétence :

📈 Jour 1 : observation — découvrir le magasin, les produits, les procédures ; observer un collègue ; poser des questions. On ne te laisse pas seul(e).
📈 Jour 2 : autonomie accompagnée — tenir un magasin si nécessaire (ouverture/fermeture, caisse de base, accueil).
📈 Jour 3 : consolidation — gagner en aisance à la vente sans relâcher la rigueur.
📈 Semaine 2 : maîtrise des procédures.
📈 Premier mois : montée en compétence.
📈 Trois mois : autonomie complète.

Chacun avance à son rythme — l'important, c'est la progression. 🚀`);

lesson("Évoluer chez Caftan Factory", "Évoluer chez Caftan Factory : les 4 niveaux 🚀",
`Chez nous, on ne recrute pas sans perspective. Un vendeur peut devenir référent, un référent responsable, un responsable superviser plusieurs magasins. Mais l'évolution ne dépend pas de l'ancienneté — elle dépend du comportement au quotidien.

NIVEAU 1 — Le collaborateur FIABLE (la base) : arrive à l'heure, respecte les procédures, dit la vérité, reconnaît vite ses erreurs, termine son travail, ne laisse jamais un collègue en difficulté.

NIVEAU 2 — Le collaborateur AUTONOME : prend des initiatives utiles, anticipe, pose des questions quand il hésite, trouve des solutions simples, respecte les procédures sans qu'on le lui rappelle.

NIVEAU 3 — Le collaborateur INFLUENT : accueille les nouveaux, rassure, montre l'exemple, calme les tensions, partage ses connaissances. Quand il est absent, l'équipe le ressent.

NIVEAU 4 — Le futur RESPONSABLE : capable de protéger l'équipe, les clients et l'entreprise, de prendre des décisions justes, de rester calme sous pression, de représenter dignement Caftan Factory.`);

lesson("Construire sa carrière", "Ce qui freine / ce qui accélère une évolution 🧭",
`⛔ CE QUI FREINE (quelques exemples) : retards réguliers · critiquer les collègues · créer des tensions · ne jamais reconnaître ses erreurs · téléphone en service · attendre qu'on lui dise quoi faire · négliger les détails · se plaindre sans proposer · refuser d'aider · rumeurs · refuser les remarques · ne pas progresser.

🚀 CE QUI ACCÉLÈRE : ponctualité · honnêteté · organisation · aider naturellement · curiosité · apprendre vite · garder son calme · proposer des améliorations · respecter tout le monde · donner une bonne image · prendre soin du magasin · former les nouveaux · prévenir avant qu'un problème n'arrive · créer une bonne ambiance · inspirer confiance.

🔎 CE QUE JE REGARDE (le mot du fondateur) : la personne qui ramasse un vêtement sans qu'on le lui demande ; celle qui reste 5 min de plus pour aider ; celle qui accueille chaque client avec le même sourire à 10h comme à 19h55 ; celle qui protège un nouveau ; celle qui vient dire « je pense qu'il y a un problème » AVANT qu'il n'explose.

🏅 Le plus beau compliment n'est pas « tu vends bien », c'est : « Je peux partir deux heures, je sais que tout se passera bien. » À ce moment-là, tu es devenu(e) une personne de confiance — et c'est cette confiance qui ouvre les portes.`);

exam(6, "Examen final — niveau 6 🎓",
`Le grand final ! 🎓 Un examen qui reprend tout ton parcours. Donne le meilleur — et bravo pour tout ce chemin.`,
[
 Q("Le niveau 1 de l'évolution, c'est être…", ["Le meilleur vendeur en chiffre", "Le collaborateur FIABLE (base de tout)", "Le plus ancien"], 1),
 Q("Quel comportement ACCÉLÈRE une évolution ?", ["Se plaindre sans proposer", "Prévenir avant qu'un problème n'arrive", "Utiliser son téléphone en service"], 1),
 Q("Une cliente ne parle pas français. Tu…", ["Abandonnes", "Mots simples, gestes, sourire, aide d'un collègue", "Lui demandes de revenir"], 1),
 Q("Le plus beau compliment d'un responsable, c'est…", ["« Tu vends bien »", "« Je peux partir 2h, tout se passera bien »", "« Tu es rapide »"], 1),
 Q("À 3 mois, on attend de toi…", ["De rester en observation", "Une autonomie complète", "De ne rien décider"], 1),
 Q("La bonne attitude face à un cas non prévu par le manuel :", ["Improviser au hasard", "Écouter, respecter, rester honnête, chercher une solution", "Refuser d'agir"], 1),
]);

// ── Insertion : séquence + numérotation, examens tous les 5 (5,10,15,20,25,30) ─
const modules = [];
let seq = 0;
for (const m of L) { seq += 1; modules.push({ ...m, seq }); }
// Vérif placement examens
const examSeqs = modules.filter((m) => m.kind === "exam").map((m) => m.seq);

await c.query("delete from training_modules");
for (const m of modules) {
  await c.query(
    "insert into training_modules(seq,kind,category,title_fr,body_fr,exam_level,questions) values($1,$2,$3,$4,$5,$6,$7)",
    [m.seq, m.kind, m.category, m.title_fr, m.body_fr || "", m.exam_level || null, m.questions ? JSON.stringify(m.questions) : null],
  );
}
console.log(`✅ ${modules.length} modules semés. Examens aux positions : ${examSeqs.join(", ")}`);
console.log("\n=== ENCHAÎNEMENT ===");
for (const m of modules) console.log(`${String(m.seq).padStart(2)}. ${m.kind === "exam" ? "🧩 EXAM L" + m.exam_level : "📘"} ${m.title_fr}`);
await c.end();
