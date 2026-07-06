// Karim 2026-07-06 : page PUBLIQUE (sans auth) « Signaler à la direction ».
// Accès par token DURABLE (employees.report_token) qui n'expire jamais : le
// travailleur peut y revenir et écrire autant qu'il veut pendant tout son
// contrat. Bilingue FR/NL selon la locale (cookie).

import Link from "next/link";
import { XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveEmployeeByReportToken } from "@/lib/worker-reports";
import { getLocale } from "@/lib/locale-server";
import { SignalerForm } from "./signaler-form";

export const dynamic = "force-dynamic";

export default async function SignalerPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const locale = await getLocale();
  const admin = createAdminClient();
  const emp = await resolveEmployeeByReportToken(admin, token);

  const invalid = {
    fr: {
      title: "Lien invalide",
      body: "Ce lien de signalement n'est pas (ou plus) valide. Contacte la direction si besoin.",
      back: "Retour au site",
    },
    nl: {
      title: "Ongeldige link",
      body: "Deze meldingslink is niet (meer) geldig. Neem contact op met de directie indien nodig.",
      back: "Terug naar de site",
    },
  }[locale];

  return (
    <div className="min-h-screen bg-canvas pb-safe">
      <header className="bg-ink text-white px-4 py-4 sm:py-5 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
          <span className="text-[11px] tracking-[0.18em] uppercase font-bold text-gold">
            Caftan Factory
          </span>
          <span className="text-[11px] text-white/60 ml-auto">
            {locale === "nl" ? "Melden aan de directie" : "Signaler à la direction"}
          </span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {emp ? (
          <SignalerForm token={token} locale={locale} />
        ) : (
          <div className="rounded-xl border border-danger-light bg-danger-light/40 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 flex-shrink-0 text-danger mt-0.5" />
              <div>
                <h1 className="font-bold text-base text-ink">{invalid.title}</h1>
                <p className="text-sm text-ink-2 mt-1 leading-relaxed">{invalid.body}</p>
                <p className="text-xs text-ink-3 mt-3">
                  <Link href="https://caftanfactory.com" className="underline">
                    {invalid.back}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
