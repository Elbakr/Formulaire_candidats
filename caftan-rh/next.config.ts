import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
