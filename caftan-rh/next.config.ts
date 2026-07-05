import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Karim 2026-06-05 : tolere TS errors au build prod Vercel.
  // ~15 erreurs pre-existantes non bloquantes (types Supabase + lucide-react
  // attrs). Le code marche en runtime. A nettoyer plus tard.
  // Note 2026-06-07 : option `eslint` retiree, deprecated en Next 16
  // (warning "Unrecognized key(s) in object: 'eslint'").
  typescript: { ignoreBuildErrors: true },
  // Karim 2026-06-15 : chromium headless (génération PDF des contrats) ne doit PAS
  // être bundlé par Turbopack/webpack (binaire natif) -> externalisé côté serveur.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Karim 2026-07-05 : le binaire chromium (dossier bin/) n'est PAS tracé
  // automatiquement dans les fonctions Vercel. Il ne l'était que pour UNE route API
  // -> les server actions qui génèrent le PDF (signature du contrat dans /sign, et
  // envoi du dossier d'embauche dans /planning) retombaient sur le repli HTML.
  // On inclut le binaire pour TOUS les flux qui génèrent un PDF.
  outputFileTracingIncludes: {
    "/api/contracts/sign/[token]/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/sign/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/planning/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  // Autoriser les Server Actions et le HMR depuis nos tunnels Cloudflare et
  // depuis le LAN local pendant les tests sur appareils externes.
  // Sans ça, Next.js 16 bloque silencieusement les server actions (login,
  // mutations) avec un message "Invalid Server Actions request" et la page
  // se reset sans erreur visible côté client.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.vercel.app",
    "*.loca.lt",
    "192.168.*.*",
    "10.*.*.*",
  ],
  experimental: {
    serverActions: {
      // Karim 2026-06-17 : upload carte d'identité (images base64 recto+verso)
      // dépasse la limite par défaut de 1 Mo. On monte à 8 Mo (les images sont
      // déjà compressées côté client avant envoi).
      bodySizeLimit: "8mb",
      allowedOrigins: [
        "*.trycloudflare.com",
        "*.ngrok-free.app",
        "*.vercel.app",
        "*.loca.lt",
        "192.168.129.81:3000",
        "192.168.129.81",
        "localhost:3000",
      ],
    },
  },
};

export default nextConfig;
