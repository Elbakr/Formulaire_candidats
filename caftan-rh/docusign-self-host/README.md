# DocuSeal self-hosted — déploiement pour CaftanRH

## Pré-requis

- Docker Desktop installé (Windows / Mac) OU Docker Engine (Linux)
- 1 GB RAM dispo
- Port 3001 libre (modifiable dans `docker-compose.yml`)

## Setup en 3 commandes

```bash
# 1. Génère une SECRET_KEY_BASE (à mettre dans .env.local du dossier docusign-self-host)
openssl rand -hex 64 > docuseal.secret

# 2. Crée le fichier d'env
echo "DOCUSEAL_SECRET_KEY_BASE=$(cat docuseal.secret)" > .env

# 3. Lance le conteneur
docker compose up -d
```

Attendre ~30 secondes que le service démarre, puis ouvrir : **http://localhost:3001**

## Configuration initiale (1ère visite)

1. Créer le compte admin :
   - Nom : Karim Elbazi
   - Email : `elbazikarim@gmail.com`
   - Password : choisir un fort
2. Aller dans **Settings → API** et copier la clé API
3. Aller dans **Settings → Webhooks** et créer un webhook :
   - URL : `https://<ton-domaine-vercel>/api/docuseal/webhook`
   - Events : `form.completed`, `form.declined`, `form.signed`
   - Secret : générer un random (sera comparé côté CaftanRH)

## Variables d'env CaftanRH à remplir

Dans `.env.local` du projet `caftan-rh/` :

```
DOCUSEAL_BASE_URL=http://localhost:3001
DOCUSEAL_API_KEY=<clé copiée depuis Settings → API>
DOCUSEAL_WEBHOOK_SECRET=<secret du webhook>
SIGNATURE_PROVIDER=docuseal
```

Pour Vercel (prod) :
- Remplir les mêmes 4 variables dans le dashboard Vercel (Settings → Environment Variables)
- `DOCUSEAL_BASE_URL` doit pointer vers ton DocuSeal accessible publiquement (pas localhost)

## Exposer DocuSeal publiquement

Options pour rendre `localhost:3001` accessible depuis Internet :

### Option A — Cloudflare Tunnel (gratuit, rapide)
```bash
cloudflared tunnel --url http://localhost:3001
```
Retourne une URL random https://*.trycloudflare.com — à utiliser comme `DOCUSEAL_BASE_URL`.

### Option B — VPS + Caddy/Nginx reverse proxy
Sur un VPS Hetzner/OVH (4 EUR/mois) :
```bash
# Caddy s'occupe du HTTPS automatiquement
caddy reverse-proxy --from docuseal.amdmegastore.be --to localhost:3001
```

### Option C — Railway / Render / Fly.io (cloud)
Déployer le `docker-compose.yml` directement via leur UI.
- Railway : 5 EUR/mois après free tier
- Render : 7 USD/mois
- Fly.io : free tier généreux

## Sauvegardes

Les données sont dans 2 volumes Docker :
- `caftanrh-docuseal-data` : config + DB SQLite
- `caftanrh-docuseal-storage` : PDF signés

Backup :
```bash
docker run --rm -v caftanrh-docuseal-data:/data -v $(pwd):/backup alpine tar czf /backup/docuseal-backup-$(date +%Y%m%d).tar.gz /data
```

## Désactiver / supprimer

```bash
docker compose down              # arrête mais garde les volumes
docker compose down -v           # supprime aussi les données (irrévocable)
```

## Switch retour à signature interne canvas

Dans `.env.local` du projet CaftanRH :
```
SIGNATURE_PROVIDER=internal
```
DocuSeal continue de tourner mais n'est plus utilisé.
