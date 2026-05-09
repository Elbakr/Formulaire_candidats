import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import { Toaster } from "sonner";
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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
