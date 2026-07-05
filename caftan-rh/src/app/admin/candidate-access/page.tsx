import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Smartphone } from "lucide-react";

export const dynamic = "force-dynamic";

// Karim 2026-07-04 : journal anti-fraude des accès candidat (ADMIN uniquement).
// Détecte les corrélations suspectes : même IP / même appareil sur PLUSIEURS
// candidats distincts (multi-comptes, concurrent, usurpation).

type Row = {
  id: string; created_at: string; candidate_id: string | null; context: string;
  ip: string | null; ip_country: string | null; ip_city: string | null;
  device_hint: string | null; ua_fingerprint: string | null;
  candidate?: { full_name: string | null } | null;
};

export default async function CandidateAccessPage() {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();

  const { data } = await admin
    .from("candidate_access_logs")
    .select("id, created_at, candidate_id, context, ip, ip_country, ip_city, device_hint, ua_fingerprint, candidate:candidates(full_name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as unknown as Row[];

  const nameOf = (r: Row) => r.candidate?.full_name ?? (r.candidate_id ? r.candidate_id.slice(0, 8) : "—");

  // Corrélations : clé -> ensemble de candidats distincts.
  function correlate(keyFn: (r: Row) => string | null) {
    const map = new Map<string, { key: string; candidates: Map<string, string>; sample: Row }>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!k || !r.candidate_id) continue;
      if (!map.has(k)) map.set(k, { key: k, candidates: new Map(), sample: r });
      map.get(k)!.candidates.set(r.candidate_id, nameOf(r));
    }
    return [...map.values()].filter((g) => g.candidates.size >= 2).sort((a, b) => b.candidates.size - a.candidates.size);
  }
  const byIp = correlate((r) => r.ip && r.ip !== "unknown" ? r.ip : null);
  const byFp = correlate((r) => r.ua_fingerprint);

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Sécurité candidats — accès & anti-fraude</h1>
        <p className="text-sm text-ink-2">
          Journal des connexions candidats (90 jours). Usage interne, base légale : intérêt légitime (prévention de la fraude). Conservation 24 mois.
        </p>
      </div>

      <Card>
        <div className="p-4">
          <div className="font-bold text-sm flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-4 w-4 text-warn" /> Même adresse IP sur plusieurs candidats ({byIp.length})
          </div>
          {byIp.length === 0 ? <p className="text-sm text-ink-3">Aucune corrélation par IP.</p> : (
            <ul className="space-y-1.5">
              {byIp.slice(0, 30).map((g) => (
                <li key={g.key} className="text-sm flex items-start gap-2 flex-wrap">
                  <Badge variant="muted" className="font-mono text-[11px]">{g.key}</Badge>
                  <span className="text-ink-3">{g.sample.ip_city ?? ""} {g.sample.ip_country ?? ""}</span>
                  <span className="font-semibold text-warn">{g.candidates.size} candidats :</span>
                  <span>{[...g.candidates.values()].join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <div className="font-bold text-sm flex items-center gap-1.5 mb-2">
            <Smartphone className="h-4 w-4 text-warn" /> Même appareil (empreinte) sur plusieurs candidats ({byFp.length})
          </div>
          {byFp.length === 0 ? <p className="text-sm text-ink-3">Aucune corrélation par appareil.</p> : (
            <ul className="space-y-1.5">
              {byFp.slice(0, 30).map((g) => (
                <li key={g.key} className="text-sm flex items-start gap-2 flex-wrap">
                  <Badge variant="muted" className="text-[11px]">{g.sample.device_hint ?? "appareil"}</Badge>
                  <span className="font-semibold text-warn">{g.candidates.size} candidats :</span>
                  <span>{[...g.candidates.values()].join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <div className="font-bold text-sm mb-2">Derniers accès ({rows.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-ink-3 text-left">
                <tr><th className="py-1 pr-3">Date</th><th className="pr-3">Candidat</th><th className="pr-3">IP</th><th className="pr-3">Lieu</th><th className="pr-3">Appareil</th><th>Contexte</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}</td>
                    <td className="pr-3">{nameOf(r)}</td>
                    <td className="pr-3 font-mono">{r.ip ?? "—"}</td>
                    <td className="pr-3"><MapPin className="h-3 w-3 inline mr-0.5 text-ink-3" />{[r.ip_city, r.ip_country].filter(Boolean).join(" ") || "—"}</td>
                    <td className="pr-3">{r.device_hint ?? "—"}</td>
                    <td>{r.context}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
