# CAFTAN HR — Master Spec v3
**Plateforme RH auto-pilotée pour Caftan Factory (3 magasins : Molenbeek, Schaerbeek, Antwerpen)**

## 0. Règles d'or pour Claude Code

1. Conserver intégralement la stack Next.js + Supabase déjà en place dans caftan-rh/. Cette spec ne dicte aucune technique. Tu continues sur ce que tu as commencé.
2. Ne jamais bypasser un élément existant. Si une fonctionnalité de cette spec entre en conflit avec quelque chose qui existe déjà, ou ressemble à quelque chose qui existe déjà avec un nom/logique différent, poser la question à Karim avant toute action. Si une fonctionnalité décrite ici n'existe pas encore, l'implémenter dans la stack actuelle.
3. Cette spec est une liste d'objectifs métier, pas d'instructions techniques.
4. Bilingue FR/NL partout dans l'UI utilisateur final.
5. Conformité Belgique (droit du travail, CDD, Dimona) + RGPD (données en UE).

## 1. Vision : la plateforme auto-pilotée

Objectif ultime : plateforme RH qui tourne quasiment seule. Chaque utilisateur déclare ce qui le concerne. La plateforme prend les décisions standards de façon autonome. Karim n'intervient que pour les décisions stratégiques (cible : moins d'1h/semaine).

Principe directeur : "Chaque action est faite par la personne la mieux placée pour la faire, au moment où elle a l'info en main, sans déléguer ni demander à un tiers."

### 4 piliers techniques de l'autonomie
- **Self-service total** : chaque utilisateur a tous les outils en main pour déclarer/modifier/soumettre ce qui le concerne
- **Validation par exception** : système exécute par défaut, alerte un humain seulement hors-norme
- **Règles paramétrables** : Karim définit les règles une fois, la plateforme applique
- **Notifications proactives** : prévenir au bon moment, action en 1 clic toujours proposée

### Décisions qui restent obligatoirement humaines (cadre légal Belgique)
- Signature du contrat d'embauche
- Décision finale de non-renouvellement de CDD
- Sanctions disciplinaires
- Validation Dimona avant prise de fonction

Tout le reste tend vers l'autonomie maximale.

## 2. Modules à couvrir

| Module | Niveau d'autonomie cible |
|---|---|
| 1. Acquisition | Très élevé (filtrage et pré-entretien automatiques, Karim voit seulement les finalistes) |
| 2. Embauche & Onboarding | Élevé (dossier prêt, signature humaine) |
| 3. Planning | Très élevé (système prépare, manager valide en 1 clic) |
| 4. Opérations quotidiennes | Maximal (auto-validation des cas standards) |
| 5. Performance & Cycle de vie | Élevé (dossier complet préparé, décision finale humaine en 1 clic) |

3 rôles utilisateurs : Admin (Karim) / Manager magasin / Employé.

## 3. Module 1 — Acquisition

- Formulaire candidat public bilingue FR/NL, compatible import Gravity Forms
- Auto-déclaration des langues parlées par le candidat (FR/NL/AR/EN/TR/DE/ES/IT). Pas de scoring CV par IA (test précédent peu fiable).
- Calcul automatique de distance commune candidat ↔ 3 magasins (GPS communes belges)
- Scoring multicritères automatique (poste, dispo, âge, présence CV, distance, langues), pondération transparente et modifiable
- **Pré-entretien automatisé (vidéo + écrit)** avant que Karim voie le candidat. Si scoring passe le seuil, le candidat reçoit automatiquement un lien. Volet écrit : 5-8 questions structurées. Volet vidéo : 2-3 questions courtes (présentation 60 sec, mise en situation, validation des langues parlées). Le candidat répond dans 5 jours, sinon relance auto puis mise en réserve. Karim ne voit que les candidats ayant passé cette étape.
- Pipeline visuel : Nouveau → Pré-entretien envoyé → Pré-entretien complété → Shortlistable → Convoqué entretien physique → Entretenu → Décision → Embauché/Refusé/Réserve. Transitions automatiques selon règles paramétrées.
- Communication automatique aux candidats à chaque étape (templates email via EmailJS sous marque Caftan Factory). Aucun candidat sans réponse.
- Génération automatique des questions d'entretien physique (templates par poste : Vendeuse / Gestionnaire / Gérant), pré-remplies avec résumé du pré-entretien.
- Convocation automatique : candidat shortlisté reçoit lien de prise de RDV, choisit son créneau lui-même.
- Fiche candidat persistante (devient automatiquement fiche employé si embauche).
- Version mobile-optimisée.

Karim n'intervient que pour : définir les seuils initiaux (1 fois), décider d'embaucher parmi les finalistes (1 clic), mener l'entretien physique final.

## 4. Module 2 — Embauche & Onboarding

- Génération automatique du dossier prêt à signer dès validation par Karim : contrat CDD belge pré-rempli (durée, fonction, salaire, lieu, période d'essai, conformité), checklist Dimona avec lien ONSS, plan d'onboarding 5 jours instancié, création du compte employé en attente.
- Activation automatique du compte employé à la signature : accès immédiat (rôle Employé), peut déclarer ses dispos, voir son planning d'onboarding, pointer dès le jour 1.
- Onboarding self-service : nouveau collaborateur coche au fur et à mesure, manager voit la progression, système signale les retards.

Karim n'intervient que pour : signer le contrat (légal), déclarer la Dimona (légal mais avec dossier déjà prêt).

## 5. Module 3 — Planning

- Bilingue FR/NL.
- **Pause vendredi verrouillée** (règle métier non négociable).
- Distribution intelligente des heures : équité, contraintes contractuelles (heures min/max par employé), dispos déclarées, événements prévus. Logique explicable.
- Auto-déclaration des dispos par les employés dans leur espace.
- Auto-planification continue : chaque dimanche, le système génère le planning de la semaine suivante. Manager valide en 1 clic. Peut ajuster avant validation s'il le souhaite. Une fois validé, envoi automatique aux employés sous marque Caftan Factory.
- Demandes de renfort ponctuelles ou urgentes : manager déclare le besoin → système liste employés disponibles classés par proximité et heures restantes → manager envoie proposition en 1 clic → employé accepte/refuse → mise à jour automatique.
- Vue par magasin et vue consolidée 3 magasins (Karim).
- Mobilité inter-magasins (Molenbeek ↔ Schaerbeek surtout) : acceptation employé en 1 clic.
- Prise en compte événements récurrents (jours marché, soldes, fêtes Aïd/Ramadan/fin d'année) et ponctuels.
- Export PDF multi-semaines pour affichage en magasin.
- Mécanisme d'undo (filet de sécurité).

## 6. Module 4 — Opérations quotidiennes

### Pointage
- Pointage avec géofence (refusé hors rayon défini autour du magasin).
- Photo selfie au clock-in, stockage temporaire 30 jours puis purge auto RGPD.
- Comparaison automatique heures pointées vs planifiées, flag automatique des écarts en fin de semaine, alimente les KPI.

### Demandes employé self-service avec auto-validation
- **Demandes de congé** : si respecte toutes les règles (préavis, solde dispo, pas de pic de charge, pas trop d'absents simultanés) → auto-validation immédiate, manager notifié pour info, planning mis à jour. Sinon → escalade manager qui décide en 1 clic avec recommandation système.
- **Échanges de shifts** : si swap respecte toutes les règles (compétences équivalentes, heures totales OK, pas de double-réservation) → auto-validation immédiate, manager notifié pour info. Sinon → escalade manager pour décision en 1 clic.
- **Signalement d'absence imprévue** : employé signale dans son espace → mise à jour planning + déclenchement procédure de remplacement automatique. Justificatif uploadable.

### Communication
- Chat 1-to-1 employé ↔ manager (trace écrite).
- Chat de groupe par magasin.
- Annonces broadcast par admin (Karim diffuse aux 3 magasins).

### Tableaux de bord
- Manager : vue temps réel de son magasin (qui a pointé, retards, manquants, congés, charge prévue).
- Karim : 3 magasins consolidés (effectifs, alertes, demandes en attente, pics à venir).

## 7. Module 5 — Performance & Cycle de vie

### KPI par employé (transparents et pondérés)
Calculés automatiquement : assiduité (% pointages à l'heure), heures travaillées vs planifiées, absences imprévues, notes manager hebdomadaires (1-5, optionnel), ventes individuelles si intégration WooCommerce activée. Consultables par l'employé concerné. Pondération modifiable par Karim.

### Notes manager hebdomadaires
Optionnel mais facilité : fin de semaine, manager reçoit notification pour noter rapidement (1-5) chaque employé avec commentaire libre court. Si non saisi, semaine neutre dans le calcul.

### Historique consultable
Toute l'activité d'un employé depuis sa candidature. Base de toute décision.

### Recommandation de renouvellement à 30 jours de la fin de CDD
Système prépare automatiquement la fiche décision : score global, tendances, charge prévisionnelle du magasin, recommandation explicable (Renouveler / Non-renouveler / Discuter), justification écrite générée et modifiable par Karim. Notification à Karim avec 2 boutons : "Envoyer la proposition" (1 clic) ou "Discuter" (1 clic). Si validation : envoi auto à l'employé, mise à jour contrat. Décision finale toujours humaine.

### Tableaux de bord
- Karim : 3 magasins consolidés (top performers, employés à risque, tendances, alertes CDD fin période, absentéisme anormal).
- Manager : son magasin uniquement.
- Employé : ses propres KPI, sa progression, sa note moyenne (transparence totale).

## 8. Petits éléments transverses

- Bilingue FR/NL avec sélecteur de langue persistant par utilisateur (i18n).
- 3 magasins de référence avec coordonnées GPS connues : Molenbeek, Schaerbeek, Antwerpen.
- Référentiel des communes belges avec coordonnées GPS (existait déjà).
- Marque visuelle Caftan Factory (logo, palette, ton) dans emails sortants et UI.
- Conformité RGPD : données UE, CV accessibles uniquement aux autorisés, photos pointage purgées 30j, vidéos pré-entretien purgées après décision finale + 30j, droit à l'effacement.
- Conformité droit du travail belge : max 38h/semaine, repos hebdo obligatoire, CDD avec dates claires, Dimona avant prise de fonction.
- Filet de sécurité Git : tout versionné, branches pour features, rollback possible.
- Audit log obligatoire sur actions sensibles (validation candidat, génération contrat, validation planning, auto-validation congé, décision renouvellement, sanction).
- **Système de paramétrage des règles (Karim only)** : seuils scoring candidats, seuil pré-entretien, délais relance, règles auto-validation congés (préavis min, % max absents simultanés, périodes interdites), règles auto-validation swaps, pondération KPI, rayon géofence, tout autre seuil métier — modifiables sans intervention dev.

## 9. Points à clarifier avec Karim avant implémentation

1. État actuel de l'app Next.js + Supabase : que reste-t-il vraiment à coder selon la spec ?
2. Existant à conserver tel quel : avant chaque module, vérifier l'existant et demander si garder, compléter, ou remplacer.
3. Pointage et chat : déjà commencés. Confirmer leur état avant toute modification.
4. Pré-entretien automatisé (vidéo + écrit) : technologie pour la captation vidéo côté candidat (intégration tierce ? captation native navigateur ? stockage Supabase) ?
5. Intégration WooCommerce (ventes par employé) : phase ultérieure ou maintenant ?
6. EmailJS reste le canal email ?
7. Géofence pointage : rayon exact (50m, 100m, 200m) ?
8. Règles d'auto-validation des congés : seuils définis dès le départ ou panneau de configuration paramétrable avec valeurs par défaut ?
9. Notes manager hebdomadaires : visibles par l'employé ou seulement KPI ?
10. Données existantes à migrer depuis les anciens fichiers HTML monolithiques (base candidats, employés) ?
11. Gestion des employés : un employé est rattaché à un seul magasin par défaut ou polyvalent dès l'embauche ?
