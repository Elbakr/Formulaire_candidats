import { Trophy, Sparkles, CheckCircle2, Hourglass } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  rule_kind: string;
  prize_distribution: Array<{ rank: number; amount: number }> | null;
  scope_site_id: string | null;
  is_active: boolean | null;
};

type Award = {
  id: string;
  campaign_id: string;
  amount: number;
  rank: number | null;
  reason: string | null;
  paid_at: string | null;
  created_at: string;
};

const RULE_LABEL_FR: Record<string, string> = {
  top_attendance: "Top présence",
  top_score: "Top score",
  top_seller: "Top vendeur",
  no_absence: "Aucune absence",
  custom: "Manuelle",
};

export default async function MyBonusPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  // employee actif lié à mon profile
  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .maybeSingle();
  const employee = empRaw as { id: string; full_name: string } | null;

  // Campagnes en cours (visibles par tous via policy bc_read).
  const { data: campaignsRaw } = await supabase
    .from("bonus_campaigns")
    .select(
      "id, name, description, start_date, end_date, rule_kind, prize_distribution, scope_site_id, is_active",
    )
    .eq("is_active", true)
    .gte("end_date", today)
    .order("start_date", { ascending: true });
  const activeCampaigns = (campaignsRaw ?? []) as Campaign[];

  // Mes awards (RLS policy ba_self filtre déjà sur l'employé du profil).
  let myAwards: Award[] = [];
  if (employee) {
    const { data: awardsRaw } = await supabase
      .from("bonus_awards")
      .select("id, campaign_id, amount, rank, reason, paid_at, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    myAwards = (awardsRaw ?? []) as Award[];
  }

  // Charge en + les noms de toutes les campagnes référencées par mes awards
  // (peut inclure des campagnes terminées non listées dans activeCampaigns).
  const referencedCampaignIds = Array.from(new Set(myAwards.map((a) => a.campaign_id)));
  let campNamesById = new Map<string, string>();
  if (referencedCampaignIds.length > 0) {
    const { data: refRaw } = await supabase
      .from("bonus_campaigns")
      .select("id, name, end_date, rule_kind")
      .in("id", referencedCampaignIds);
    for (const c of (refRaw ?? []) as Array<{ id: string; name: string }>) {
      campNamesById.set(c.id, c.name);
    }
  }
  for (const c of activeCampaigns) campNamesById.set(c.id, c.name);

  const totalEarned = myAwards.reduce((s, a) => s + Number(a.amount), 0);
  const totalPaid = myAwards.filter((a) => a.paid_at).reduce((s, a) => s + Number(a.amount), 0);
  const totalPending = totalEarned - totalPaid;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Mes primes</h1>
        <p className="text-sm text-ink-2">
          Concours en cours et historique de tes primes / récompenses.
        </p>
      </div>

      {/* Récap */}
      {myAwards.length > 0 ? (
        <Card>
          <div className="p-3 sm:p-4 grid grid-cols-3 gap-3 text-center">
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                Total reçu
              </div>
              <div className="text-2xl font-extrabold font-mono text-gold-dark mt-1">
                {totalEarned.toFixed(2)} €
              </div>
            </div>
            <div className="bg-success-light/40 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                Payé
              </div>
              <div className="text-2xl font-extrabold font-mono text-success mt-1">
                {totalPaid.toFixed(2)} €
              </div>
            </div>
            <div className="bg-warn-light/40 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3">
                À recevoir
              </div>
              <div className="text-2xl font-extrabold font-mono text-warn mt-1">
                {totalPending.toFixed(2)} €
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Concours en cours */}
      <Card>
        <div className="p-3 sm:p-4 border-b border-line flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-dark" />
          <h2 className="font-bold">Concours en cours ({activeCampaigns.length})</h2>
        </div>
        {activeCampaigns.length === 0 ? (
          <div className="p-6 text-sm text-ink-3 text-center">
            Aucun concours actif. Reviens plus tard ou demande à la RH !
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {activeCampaigns.map((c) => {
              const dist = c.prize_distribution ?? [];
              const isUpcoming = c.start_date > today;
              return (
                <li key={c.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{c.name}</div>
                      <div className="text-xs text-ink-3">
                        {formatDate(c.start_date)} → {formatDate(c.end_date)} ·{" "}
                        {RULE_LABEL_FR[c.rule_kind] ?? c.rule_kind}
                      </div>
                      {c.description ? (
                        <div className="text-xs text-ink-2 mt-0.5">{c.description}</div>
                      ) : null}
                    </div>
                    {isUpcoming ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-info-light text-info">
                        À venir
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-success-light text-success">
                        En cours
                      </span>
                    )}
                  </div>
                  {dist.length > 0 ? (
                    <div className="mt-2 ml-11 flex items-center gap-3 flex-wrap text-xs">
                      <span className="text-ink-3 uppercase tracking-wider font-bold text-[10px]">
                        Prix :
                      </span>
                      {dist.map((d) => (
                        <span key={d.rank} className="px-2 py-0.5 rounded bg-gold-light text-gold-dark font-bold">
                          #{d.rank} = {Number(d.amount).toFixed(2)} €
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Historique de mes awards */}
      <Card>
        <div className="p-3 sm:p-4 border-b border-line">
          <h2 className="font-bold">Historique de mes primes</h2>
        </div>
        {myAwards.length === 0 ? (
          <div className="p-6 text-sm text-ink-3 text-center">
            Aucune prime reçue pour l'instant. Continue comme ça !
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {myAwards.map((a) => (
              <li key={a.id} className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="h-8 w-8 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
                    {a.rank ? (
                      <span className="font-bold text-xs">#{a.rank}</span>
                    ) : (
                      <Trophy className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">
                      {campNamesById.get(a.campaign_id) ?? "Campagne"}
                    </div>
                    {a.reason ? (
                      <div className="text-xs text-ink-2 mt-0.5">{a.reason}</div>
                    ) : null}
                  </div>
                  <span className="font-mono font-bold text-base text-gold-dark">
                    {Number(a.amount).toFixed(2)} €
                  </span>
                  {a.paid_at ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-success-light text-success"
                      title={`Payée le ${formatDate(a.paid_at)}`}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Payée
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-warn-light text-warn">
                      <Hourglass className="h-3 w-3" /> En attente
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
