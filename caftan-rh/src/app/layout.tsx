import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Sans, DM_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/install-prompt";
import { PushActivationBanner } from "@/components/push-activation-banner";
import { getPublicVapidKey } from "@/lib/push-notify";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CaftanRH — Recrutement",
  description: "Plateforme de recrutement et gestion RH CaftanRH",
  applicationName: "CaftanRH",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CaftanRH",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const vapidPublic = getPublicVapidKey();
  return (
    <html lang="fr" className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <InstallPrompt />
        <PushActivationBanner publicKey={vapidPublic} />
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(()=>{});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
