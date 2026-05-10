# Instructions pour Claude Code — Caftan HR

## Source de vérité
Lis MASTER_SPEC.md à la racine avant tout travail. La spec décrit les objectifs métier, pas la technique.

## Vision produit
Plateforme RH auto-pilotée. Chaque utilisateur déclare ce qui le concerne. Le système traite les cas standards seul. Les humains ne sont sollicités QUE pour les exceptions ou les décisions stratégiques. Cible : moins d'1h/semaine de présence RH côté Karim.

## Règles dures
- Conserver la stack actuelle (Next.js + Supabase, app dans caftan-rh/)
- Ne jamais bypasser ou écraser un élément existant sans demander d'abord
- Bilingue FR/NL dans toute l'UI utilisateur
- Conformité Belgique (droit du travail) + RGPD (UE)
- Pause vendredi verrouillée dans les plannings (règle métier)
- Tagging des langues candidat : auto-déclaré + vérifié au pré-entretien (pas d'IA d'extraction CV)
- Toute recommandation système doit être explicable

## Règles d'autonomie (essence du produit)
- Self-service maximum pour chaque type d'utilisateur
- Auto-validation par défaut quand les règles paramétrées sont respectées
- Escalade humaine uniquement pour les exceptions
- Toujours proposer une action en 1 clic à l'humain quand son intervention est requise
- Notifier proactivement, ne jamais attendre que l'humain pense à venir

## Décisions obligatoirement humaines
- Signature du contrat
- Décision finale de non-renouvellement de CDD
- Sanctions disciplinaires
- Validation Dimona

## En cas de conflit ou d'ambiguïté
Poser la question à Karim avant d'agir. Ne jamais trancher seul sur :
- un remplacement de code existant
- un changement de stack ou d'architecture
- une suppression de fonctionnalité
- un choix de convention différent de l'existant

## Workflow attendu
1. Avant tout chantier : proposer un plan, demander validation
2. Pendant : suivre la spec, conserver l'existant
3. Après : résumer les changements en quelques lignes
4. Commits versionnés, possibilité de rollback toujours préservée
