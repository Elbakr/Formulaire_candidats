"use client";

// Karim 2026-07-12 : verrouillage appareil de la formation.
//  - FormerEnrolling : 1re ouverture -> lie SILENCIEUSEMENT cet appareil puis affiche.
//  - FormerDenied : lien ouvert depuis un autre appareil que celui du travailleur.

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2, Lock } from "lucide-react";
import { bindTrainingDeviceAction } from "./actions";

export function FormerEnrolling({ token, firstName, lang }: { token: string; firstName: string; lang: "fr" | "nl" }) {
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const r = await bindTrainingDeviceAction(token);
      if (r.ok) window.location.reload();
      else setErr(r.error ?? "Erreur");
    })();
  }, [token]);

  const t =
    lang === "nl"
      ? { hi: `Welkom${firstName ? " " + firstName : ""}! 🎓`, sub: "Je opleiding wordt geopend…" }
      : { hi: `Bienvenue${firstName ? " " + firstName : ""} ! 🎓`, sub: "Ouverture de ta formation…" };

  return (
    <div className="min-h-[100dvh] bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-gold-light flex items-center justify-center text-gold-dark">
          <GraduationCap className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-ink">{t.hi}</h1>
        {err ? (
          <p className="mt-2 text-[13px] text-danger font-semibold">{err}</p>
        ) : (
          <p className="mt-1.5 text-sm text-ink-2 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.sub}
          </p>
        )}
      </div>
    </div>
  );
}

export function FormerDenied({ lang }: { lang: "fr" | "nl" }) {
  const t =
    lang === "nl"
      ? {
          title: "Deze link is persoonlijk",
          body: "Deze opleiding is gekoppeld aan het toestel van de medewerker en werkt niet op een ander toestel.",
          hint: "Open de link op je eigen telefoon. Probleem? Neem contact op met HR.",
        }
      : {
          title: "Ce lien est personnel",
          body: "Cette formation est liée à l'appareil du travailleur et ne fonctionne pas sur un autre appareil.",
          hint: "Ouvre le lien sur ton propre téléphone. Un souci ? Contacte les RH.",
        };
  return (
    <div className="min-h-[100dvh] bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-danger-light flex items-center justify-center text-danger">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-ink">{t.title}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{t.body}</p>
        <p className="mt-3 text-[12px] text-ink-3">{t.hint}</p>
      </div>
    </div>
  );
}
