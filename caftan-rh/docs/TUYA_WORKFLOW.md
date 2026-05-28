# Workflow Tuya — CaftanRH

## Vue d'ensemble

Comment les pointages physiques (empreinte digitale) effectués sur les
terminaux Tuya remontent dans CaftanRH, sont attribués au bon employé,
puis consolidés en prestations payables.

L'app ne stocke pas d'empreinte biométrique — uniquement le `tuya_user_id`
local (le slot d'enrôlement) et le timestamp. La biométrie reste sur le
terminal Tuya.

## Cycle complet

1. L'employée pose son doigt sur le terminal physique (ex. terminal "Pointage A"
   à l'entrée du magasin Anvers).
2. Le terminal envoie un **unlock event** au cloud Tuya (HTTPS).
3. Le cron `tuya-poll` (toutes les 5 min, voir `vercel.json`) appelle l'API
   Tuya pour chaque terminal actif et récupère les events depuis le dernier
   `last_log_access_time` stocké dans `tuya_sync_state`.
4. Pour chaque event :
   - Décodage du buffer base64 → extraction du `tuya_user_id` (slot local
     numérique, ex. `1`, `2`, `42`).
   - Recherche dans `tuya_user_mapping` du couple
     `(tuya_device_id, tuya_user_id)` → un seul employé.
   - **Si mapping trouvé** : insert dans `clock_entries` avec
     `source='tuya'`, `entry_method='tap'`, `kind` inféré par alternance
     auto (premier tap du jour = IN, suivant = OUT, etc.).
   - **Si non trouvé** : event ignoré, log un warning. L'event reste visible
     dans `/admin/tuya/logs` pour enrôlement manuel.
5. Le cron `tuya-auto-out` (toutes les 15-30 min) ferme automatiquement les
   IN abandonnés (l'employée a oublié de pointer OUT) à
   `close_time + 30 min` du site, avec `entry_method='auto_shift'` et
   `auto_clocked_out=true`.
6. La page `/admin/presence` montre en temps réel qui est clocké-in
   (lecture de la vue SQL `clock_currently_in`).
7. La page `/planning/employees/[id]/prestations` consolide tous les
   pointages d'un employé sur jour/semaine/mois (multi-terminaux,
   multi-sites) et calcule les heures payables.

## Tables et flux

```
   ┌────────────┐    poll API    ┌──────────────┐
   │  Terminal  │  ───────────▶  │   Cron         │
   │  Tuya (HW) │                │ tuya-poll      │
   └────────────┘                └──────┬─────────┘
                                        │ lookup mapping
                                        ▼
                                ┌────────────────────┐
                                │ tuya_user_mapping  │
                                │  (device,slot)     │
                                │   → employee_id    │
                                └──────┬─────────────┘
                                       │ insert event
                                       ▼
   ┌────────────────────────────────────────────────┐
   │             clock_entries                       │
   │  kind=in|out, source=tuya|manual_admin,        │
   │  entry_method=tap|manual_admin|auto_shift...   │
   └──────┬──────────────────────┬──────────────────┘
          │                      │
          ▼                      ▼
   ┌──────────────┐       ┌──────────────────┐
   │ clock_       │       │ clock_sessions   │
   │ currently_in │       │ (vue IN+OUT      │
   │ (vue SQL)    │       │  appairés)       │
   └──────┬───────┘       └─────────┬────────┘
          │                         │
          ▼                         ▼
    /admin/presence        /planning/employees/[id]/prestations
```

## Workflow d'enrôlement (1ère empreinte d'un employé)

Le `tuya_user_id` (slot local) n'est PAS dérivable du `user_id`
alphanumérique Tuya — il faut faire le mapping manuel la première fois.

1. Sur le terminal physique, enrôler 2 empreintes par employée :
   "Prénom Nom IN" et "Prénom Nom OUT" (le label aide à retrouver le slot).
   Noter le numéro de slot affiché par le terminal lors de l'enrôlement.
2. Demander à l'employée de pointer 1 fois en IN et 1 fois en OUT pour
   générer des events.
3. Aller sur `/admin/tuya/logs`, filtrer sur le terminal concerné.
4. Repérer les events "Non mappé" récents → cliquer dessus → modal avec
   le slot pré-rempli → choisir l'employée → choisir la direction (IN ou OUT)
   → Enrôler.
5. Le mapping est créé en BD (`tuya_user_mapping`).
6. Au prochain poll, les events suivants seront attribués correctement.

> Alternative : enrôler directement depuis `/admin/tuya/users` en saisissant
> manuellement le `tuya_user_id` (slot vu sur le terminal).

## Workflow de correction

- **Auto-OUT erroné** (cron a fermé trop tôt parce que pas de OUT physique) :
  Page Prestations → cliquer "Modifier" sur le badge AUTO-OUT → ajuster
  l'heure réelle → l'entry passe en `entry_method='manager_override'`,
  `auto_clocked_out=false`.

- **Présence fantôme** (employée sortie sans pointer OUT, et l'auto-out
  n'a pas encore tourné) : `/admin/presence` → bouton "Forcer OUT" →
  saisir l'heure et la raison → insert d'une entry OUT manuelle.

- **Mapping erroné** (le slot 7 a été enrôlé sur Mme A mais c'est en fait
  Mme B) : `/admin/tuya/users` → ligne du mapping → "Modifier" ou
  "Supprimer puis recréer".

- **Pointage oublié sur jour ancien (> 7 jours)** : `/admin/tuya/import` —
  voir section suivante.

## Limitations Tuya

- **Historique cloud limité** : l'API Tuya ne retourne que ~7 jours d'unlock
  events (purge automatique côté Tuya). Pour les pointages plus anciens, il
  faut importer manuellement via CSV (`/admin/tuya/import`).
- **Slot local non dérivable** : le `tuya_user_id` n'a aucun lien
  algorithmique avec le `user_id` alphanumérique Tuya. Le mapping doit donc
  être créé manuellement au 1er enrôlement.
- **Rate limit API Tuya** : ~10 req/sec. Le poll boucle séquentiellement
  sur les terminaux pour rester sous la limite.
- **Pas de webhooks fiables** : Tuya propose des webhooks mais ils sont peu
  fiables → on reste sur du polling.
- **Dédup par `tuya_access_log_id`** : chaque event Tuya a un id unique
  côté Tuya qu'on stocke en BD ; un re-poll qui retourne le même event ne
  duplique pas.

## Import CSV pointages manuels

Format CSV attendu (en-tête optionnelle, séparateur `,` ou `;`) :

```
employee_full_name,date,in_time,out_time,site_code
Keltoum El Mrabet,2026-05-01,07:45,17:30,A
Selma Maïssa,2026-05-01,08:00,17:00,E
```

- `in_time` / `out_time` interprétés en **Europe/Brussels** (DST gérée).
- `out_time` vide → seule l'entrée IN est créée.
- `source='manual_admin'`, `entry_method='manual_admin'`, `shift_id=null`.
- Dédup soft : si une IN existe déjà à +/- 1 min pour cet employé, la ligne
  est skipped (pas de doublon en cas de re-import).
- Le rattachement au shift se fait ensuite automatiquement par la page
  Prestations (matching par proximité date/heure).

## Liens utiles

- `/admin/tuya/devices` — voir/configurer les terminaux + assignation site
- `/admin/tuya/users` — voir/corriger les mappings empreinte ↔ employé
- `/admin/tuya/logs` — events bruts Tuya (mappés ou non)
- `/admin/tuya/import` — importer pointages manuels (CSV)
- `/admin/presence` — qui est clocké-in en direct
- `/admin/anomalies` — pointages incohérents détectés
- `/planning/employees/[id]/prestations` — prestations d'un employé
  (jour/semaine/mois) avec calcul d'heures payables

## Endpoints / Crons

- `POST /api/cron/tuya-poll` — toutes les 5 min, poll des events
  (secret: `CRON_SECRET`).
- `POST /api/cron/tuya-auto-out` — toutes les 15-30 min, ferme les IN
  abandonnés.
- Pour forcer un poll manuel d'historique :
  `POST /api/cron/tuya-poll?force_lookback_days=7` (admin only).

## Schéma rapide des colonnes clés

| Table | Colonnes clés |
| --- | --- |
| `tuya_devices` | `tuya_device_id`, `site_id`, `is_pointage`, `is_active` |
| `tuya_user_mapping` | `tuya_device_id`, `tuya_user_id`, `employee_id`, `direction` |
| `clock_entries` | `employee_id`, `kind`, `occurred_at`, `source`, `entry_method`, `tuya_access_log_id`, `site_id`, `shift_id` |
| `tuya_sync_state` | `tuya_device_id`, `last_log_access_time`, `last_sync_at` |

## En cas de problème

1. Vérifier sur `/admin/tuya/devices` que le terminal est `is_active=true`
   et `online=true` (dernier heartbeat < 10 min).
2. Vérifier sur `/admin/tuya/logs` qu'on voit bien les events récents
   (filtrer par terminal).
3. Si les events arrivent mais ne s'attribuent pas → vérifier
   `/admin/tuya/users` que le slot est bien mappé.
4. Si rien ne remonte → vérifier `tuya_sync_state.last_error` et les logs
   Vercel du cron.
