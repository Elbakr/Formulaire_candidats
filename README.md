# CaftanRH — Plateforme RH intelligente

Plateforme full-stack autonome qui gère **tout le cycle de vie RH** : sourcing → recrutement → embauche → planning → scoring → paie. Synchronisation **temps réel** entre tous les utilisateurs.

**Les ponts automatiques** :
- **Sourcing → Recrutement** : import auto des candidatures Gravity Forms (caftanfactory.com) toutes les 15 min
- **Embauche → GestiPlanning** : trigger PG qui crée automatiquement l'employé quand `application.status='hired'`
- **Shifts → Scoring** : métriques auto (fiabilité, couverture) recalculées chaque nuit
- **Shifts → Paie** : export CSV mensuel pour secrétariat social (SD Worx, Securex…)

## Modules

| Module | Objet |
|---|---|
| **Recrutement** | Pipeline 7 statuts + kanban drag&drop, fiche candidat (notes, entretiens, docs), formulaire public `/postuler`, emails auto (accusé/convocation/refus/embauche). |
| **GestiPlanning** | Liste employés, planning hebdo grille, **génération automatique de la semaine** (algo qui distribue shifts selon contraintes), gestion congés avec workflow approbation. |
| **Scoring équipe** | Évaluations manager 5 axes (fiabilité, autonomie, esprit d'équipe, qualité, présentation) + métriques auto (% shifts honorés, % couverture, jours de congé). Score global 0-100. |
| **Paie (export)** | Export CSV mensuel pivot universel (heures normales / week-end / nuit / jours de congé). À envoyer au secrétariat social. |
| **Intégrations** | Gravity Forms WordPress (REST API v2), Resend (emails), Cron Vercel toutes les 15 min. |

## Stack

| | |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| Backend / DB | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| Emails | Resend |
| UI | shadcn-style (Radix UI + Tailwind) |
| Hébergement | Vercel (recommandé) |

## Structure du repo

```
.
├── caftan-rh/                  ← APPLICATION PRINCIPALE (Next.js)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public landing) page.tsx
│   │   │   ├── login/, signup/, auth/
│   │   │   ├── postuler/        ← formulaire candidat public
│   │   │   ├── rh/              ← dashboard RH
│   │   │   ├── manager/         ← interface manager
│   │   │   ├── me/              ← espace candidat
│   │   │   └── admin/           ← console admin
│   │   ├── components/ui/       ← composants design system
│   │   ├── lib/                 ← supabase, auth, queries, emails, utils
│   │   ├── hooks/               ← use-realtime
│   │   └── proxy.ts             ← middleware d'auth (Next.js 16)
│   └── package.json
│
├── supabase/migrations/         ← SCHÉMA SQL (10 migrations)
│   ├── 20260509000001_schema.sql        ← recrutement (candidates, applications, jobs…)
│   ├── 20260509000002_rls.sql           ← Row Level Security par rôle
│   ├── 20260509000003_storage.sql       ← buckets documents/avatars
│   ├── 20260509000004_seed.sql          ← seed initial
│   ├── 20260509000005_planning.sql      ← GestiPlanning + auto-promotion candidat→employé
│   ├── 20260509000006_org_settings.sql  ← paramètres organisation
│   ├── 20260509000007_gf.sql            ← Gravity Forms (config + dédup)
│   ├── 20260509000008_scoring.sql       ← évaluations + métriques auto + view employee_scores
│   ├── 20260509000008b_scoring_fix.sql  ← fix enum shift_status no_show
│   ├── 20260509000009_employee_constraints.sql ← contraintes pour auto-planning
│   └── 20260509000010_payroll_export.sql ← audit log exports paie
│
├── recrutement.html, formulaire-candidat.html, …  ← ANCIENNE app (GitHub Pages)
└── README.md (ce fichier)
```

L'ancienne app HTML monolithique (`recrutement.html`, etc.) est conservée à la racine pour que GitHub Pages continue à fonctionner pendant la transition. Une fois la nouvelle app déployée et validée, ces fichiers pourront être supprimés ou déplacés dans `legacy/`.

## Setup (5 minutes)

### 1. Crée un projet Supabase

1. Va sur https://supabase.com → "Start your project"
2. Crée un projet : nom `caftan-rh`, région UE, mot de passe DB fort
3. Une fois créé, dans **Project Settings → API**, récupère :
   - `Project URL`
   - `anon` `public` key
   - `service_role` `secret` key (nécessaire pour le formulaire public)

### 2. Applique le schéma SQL

Deux options :

**Option A — Script automatique (recommandé)** :

```bash
cd caftan-rh
npm run migrate
```

Le script lit la `DATABASE_URL` dans `.env.local`, applique les migrations dans l'ordre, et trace celles déjà appliquées (table `_caftanrh_migrations`).

**Option B — Manuel via SQL Editor Supabase** : copie-colle chaque fichier de `supabase/migrations/` dans l'ordre dans le SQL Editor.

Le Realtime est activé via `alter publication supabase_realtime add table ...` dans les migrations.

### 3. Crée un compte Resend (optionnel mais recommandé)

1. https://resend.com → Sign up
2. Crée une API key (gratuit : 3 000 emails/mois)
3. Pour la prod, ajoute ton domaine et configure les DNS

### 4. Configure les variables d'environnement

```bash
cd caftan-rh
cp .env.local.example .env.local
```

Édite `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=CaftanRH <recrutement@tondomaine.com>

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Lance l'app

```bash
cd caftan-rh
npm install        # déjà fait si tu reprends ce projet
npm run dev
```

Ouvre http://localhost:3000

### 6. Crée ton premier compte admin

1. Va sur `/signup` → crée un compte
2. Confirme l'email
3. Dans Supabase → Table Editor → `profiles` → trouve ta ligne et change `role` en `admin`
4. Reconnecte-toi : tu seras redirigé vers `/admin`

## Rôles et URLs

| Rôle | Espaces | Accès |
|---|---|---|
| `admin` | `/admin`, `/rh`, `/planning` | Tout. Gestion users, services, offres, paramètres. |
| `rh` | `/rh`, `/planning` | Candidats, pipeline, offres, **GestiPlanning** complet, messages, rapports. |
| `manager` | `/manager`, `/planning` | Candidats assignés, agenda, **GestiPlanning** (lecture + édition shifts de son équipe). |
| `candidate` / employé | `/me` | Candidatures + **mon planning** + **mes congés** + profil. |

Les **candidats anonymes** postulent via `/postuler` (pas besoin de compte).

## Modules

### Recrutement
- Formulaire candidat public (`/postuler`) + upload CV
- Pipeline 7 statuts avec kanban drag & drop
- Notes (publiques/privées), entretiens, notation 5★
- Emails automatiques (accusé, convocation, refus, embauche)

### GestiPlanning
- Liste des employés (auto-créés à l'embauche, ou ajoutés manuellement)
- Planning hebdomadaire (grille employés × jours, drag-edit shifts)
- Calcul automatique des heures vs cible hebdo
- Demandes de congés (employé) + workflow approbation (manager/RH)
- Vue "Mon planning" pour les employés (shifts à venir)

## Déploiement (Vercel)

1. Pousse le repo sur GitHub (déjà fait normalement)
2. https://vercel.com → New Project → importe `Formulaire_candidats`
3. **Root Directory** : `caftan-rh`
4. Ajoute les variables d'environnement (voir étape 4 ci-dessus)
5. Deploy

Vercel redéploiera automatiquement à chaque push.

## Sécurité

- **Row Level Security (RLS)** activée sur toutes les tables : un candidat ne peut voir QUE ses données, un manager QUE celles de son service, etc.
- La `service_role_key` n'est utilisée que côté serveur (formulaire public) — jamais exposée au browser.
- L'auth Supabase gère les sessions avec rotation des tokens.

## Scripts npm

| Commande | Action |
|---|---|
| `npm run dev` | serveur de dev local |
| `npm run build` | build de prod |
| `npm run migrate` | applique les migrations SQL en attente |
| `npm run seed:employees` | seed les 15 employés actifs (génère credentials dans `employees-credentials.md`) |
| `npm run make-admin -- <email>` | promouvoir un compte en admin |
| `npm run sync:gf` | sync manuelle Gravity Forms |
| `npm run scoring:recompute` | recalcule les métriques auto pour tous les employés actifs |

## Cron jobs (Vercel)

Configurés dans `caftan-rh/vercel.json` :

| Path | Schedule | Action |
|---|---|---|
| `/api/cron/gf-sync` | toutes les 15 min | importe les nouvelles candidatures Gravity Forms |
| `/api/cron/scoring-recompute` | tous les jours à 3h | recalcule les métriques auto de scoring |

Les deux endpoints exigent un `Authorization: Bearer ${CRON_SECRET}`. À configurer aussi dans les Environment Variables Vercel.

## Évolutions prévues

- [ ] Time clock mobile (clock-in/out géo-localisé) — débloquera la métrique ponctualité réelle
- [ ] Onboarding checklist post-embauche (NRN, contrat signé, badge…)
- [ ] E-signature des contrats
- [ ] AI ranking de candidats (LLM scoring de la motivation)
- [ ] NL/EN i18n (Belgique néerlandophone)
- [ ] Génération des types TypeScript depuis Supabase
- [ ] Tests E2E Playwright

## License

Privé. © Karim Elbazi.
