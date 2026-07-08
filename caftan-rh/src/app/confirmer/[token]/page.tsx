// Karim 2026-07-08 : page PUBLIQUE (sans auth) « Lire & confirmer le guide de
// conduite ». Accès par le token DURABLE du travailleur (employees.report_token,
// le MÊME que /signaler) — n'expire jamais. Bilingue FR/NL selon la locale.
//
// Affiche le guide conduite (recruit_conduct_items actifs, groupés par catégorie)
// puis 4 confirmations OBLIGATOIRES : lu / compris / assimilé / accepté.

import Link from "next/link";
import { XCircle, CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveEmployeeByReportToken } from "@/lib/worker-reports";
import { GUIDE_DOCUMENT_KEY } from "@/lib/worker-compliance";
import { getLocale } from "@/lib/locale-server";
import { fmtDateY } from "@/lib/datetime";
import { ConfirmerForm } from "./confirmer-form";

export const dynamic = "force-dynamic";

type ConductItem = {
  id: string;
  category: string;
  category_nl: string | null;
  title: string;
  title_nl: string | null;
  description: string | null;
  description_nl: string | null;
  severity: string;
  sort_order: number;
};

// Choisit la valeur NL si locale=nl ET non vide, sinon fallback FR (jamais vide).
function pick(locale: "fr" | "nl", fr: string, nl: string | null): string {
  if (locale === "nl") {
    const v = nl?.trim();
    if (v) return v;
  }
  return fr;
}

export default async function ConfirmerPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const locale = await getLocale();
  const admin = createAdminClient();
  const emp = await resolveEmployeeByReportToken(admin, token);

  const t = {
    fr: {
      badge: "Guide de conduite",
      invalidTitle: "Lien invalide",
      invalidBody: "Ce lien n'est pas (ou plus) valide. Contacte la direction si besoin.",
      back: "Retour au site",
      title: "Guide de conduite en magasin",
      intro:
        "Voici les règles de base et les attendus dès ton premier jour. Lis-les attentivement, puis confirme en bas de page.",
      alreadyTitle: "Déjà confirmé",
      alreadyBody: (d: string) =>
        `Tu as déjà confirmé ce guide le ${d}. Merci ! Tu peux le relire à tout moment ci-dessous.`,
    },
    nl: {
      badge: "Gedragsgids",
      invalidTitle: "Ongeldige link",
      invalidBody: "Deze link is niet (meer) geldig. Neem contact op met de directie indien nodig.",
      back: "Terug naar de site",
      title: "Gedragsgids in de winkel",
      intro:
        "Hier zijn de basisregels en verwachtingen vanaf je eerste dag. Lees ze aandachtig en bevestig onderaan de pagina.",
      alreadyTitle: "Reeds bevestigd",
      alreadyBody: (d: string) =>
        `Je hebt deze gids al bevestigd op ${d}. Bedankt! Je kan hem hieronder altijd opnieuw lezen.`,
    },
  }[locale];

  // Guide + accusé existant (best-effort, la page reste affichable si vide).
  type DisplayItem = { id: string; title: string; description: string | null; severity: string };
  let groups: Array<{ category: string; items: DisplayItem[] }> = [];
  let confirmedAt: string | null = null;
  if (emp) {
    const [{ data: itemsRaw }, { data: ackRaw }] = await Promise.all([
      admin
        .from("recruit_conduct_items")
        .select("id, category, category_nl, title, title_nl, description, description_nl, severity, sort_order")
        .eq("is_active", true)
        .order("category")
        .order("sort_order")
        .order("created_at"),
      admin
        .from("worker_document_acks")
        .select("confirmed_at")
        .eq("employee_id", emp.id)
        .eq("document_key", GUIDE_DOCUMENT_KEY)
        .maybeSingle(),
    ]);
    const items = (itemsRaw ?? []) as ConductItem[];
    // Groupe par la catégorie AFFICHÉE (NL en NL, sinon FR) — mapping FR↔NL
    // cohérent, donc l'ordre des catégories reste préservé.
    const byCat = new Map<string, DisplayItem[]>();
    for (const it of items) {
      const catLabel = pick(locale, it.category, it.category_nl);
      const arr = byCat.get(catLabel) ?? [];
      arr.push({
        id: it.id,
        title: pick(locale, it.title, it.title_nl),
        description: it.description ? pick(locale, it.description, it.description_nl) : null,
        severity: it.severity,
      });
      byCat.set(catLabel, arr);
    }
    groups = Array.from(byCat.entries()).map(([category, list]) => ({ category, items: list }));
    confirmedAt = (ackRaw as { confirmed_at: string | null } | null)?.confirmed_at ?? null;
  }

  const severityDot: Record<string, string> = {
    critique: "bg-danger",
    important: "bg-gold",
    info: "bg-ink-3",
  };

  return (
    <div className="min-h-screen bg-canvas pb-safe">
      <header className="bg-ink text-white px-4 py-4 sm:py-5 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
          <span className="text-[11px] tracking-[0.18em] uppercase font-bold text-gold">
            Caftan Factory
          </span>
          <span className="text-[11px] text-white/60 ml-auto">{t.badge}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {!emp ? (
          <div className="rounded-xl border border-danger-light bg-danger-light/40 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 flex-shrink-0 text-danger mt-0.5" />
              <div>
                <h1 className="font-bold text-base text-ink">{t.invalidTitle}</h1>
                <p className="text-sm text-ink-2 mt-1 leading-relaxed">{t.invalidBody}</p>
                <p className="text-xs text-ink-3 mt-3">
                  <Link href="https://caftanfactory.com" className="underline">{t.back}</Link>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold text-ink">{t.title}</h1>
              <p className="text-sm text-ink-2 mt-1 leading-relaxed">{t.intro}</p>
            </div>

            {confirmedAt ? (
              <div className="rounded-xl border border-success bg-success-light/40 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-success mt-0.5" />
                  <div>
                    <h2 className="font-bold text-sm text-ink">{t.alreadyTitle}</h2>
                    <p className="text-sm text-ink-2 mt-1 leading-relaxed">
                      {t.alreadyBody(fmtDateY(confirmedAt))}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {groups.map((g) => (
                <section key={g.category} className="rounded-xl border border-line bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-2 border-b border-line">
                    <h2 className="font-bold text-sm text-ink">{g.category}</h2>
                  </div>
                  <ul className="divide-y divide-line">
                    {g.items.map((it) => (
                      <li key={it.id} className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${severityDot[it.severity] ?? "bg-ink-3"}`}
                          />
                          <div>
                            <div className="text-sm font-semibold text-ink">{it.title}</div>
                            {it.description ? (
                              <div className="text-sm text-ink-2 mt-0.5 leading-relaxed">{it.description}</div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <ConfirmerForm token={token} locale={locale} />
          </>
        )}
      </main>
    </div>
  );
}
