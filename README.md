# CaftanRH — Plateforme de recrutement

Application full-stack de gestion du recrutement et des candidatures, prête à déployer en entreprise. Synchronisation **temps réel** entre tous les utilisateurs (RH, managers, candidats, admin).

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
├── supabase/migrations/         ← SCHÉMA SQL
│   ├── 20260509000001_schema.sql    ← tables + types + triggers + realtime
│   ├── 20260509000002_rls.sql       ← Row Level Security par rôle
│   ├── 20260509000003_storage.sql   ← buckets et policies storage
│   └── 20260509000004_seed.sql      ← départements + offres exemple
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

Dans **Supabase → SQL Editor**, exécute dans l'ordre les fichiers de `supabase/migrations/` :

1. `20260509000001_schema.sql`
2. `20260509000002_rls.sql`
3. `20260509000003_storage.sql`
4. `20260509000004_seed.sql`

Active aussi **Realtime** sur les tables `applications`, `interviews`, `notes`, `messages` (déjà fait via `alter publication ... add table` dans la 1re migration, mais vérifie dans **Database → Replication**).

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

| Rôle | Espace | Accès |
|---|---|---|
| `admin` | `/admin` | Tout. Gestion users, services, offres, paramètres. |
| `rh` | `/rh` | Candidats, pipeline, offres, messages, rapports. |
| `manager` | `/manager` | Candidats qui leur sont assignés, agenda, notes, entretiens. |
| `candidate` | `/me` | Leurs propres candidatures, documents, messages, profil. |

Les **candidats anonymes** postulent via `/postuler` (pas besoin de compte).

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

## Évolutions prévues

- [ ] Génération des types TypeScript depuis Supabase (`supabase gen types typescript > types/database.types.ts`)
- [ ] Vue messagerie agrégée (RH)
- [ ] Notifications push / email automatiques sur changement de statut
- [ ] Export PDF candidature
- [ ] Calendrier partagé Google/Outlook pour les entretiens
- [ ] Tests E2E (Playwright)

## License

Privé. © Karim Elbazi.
