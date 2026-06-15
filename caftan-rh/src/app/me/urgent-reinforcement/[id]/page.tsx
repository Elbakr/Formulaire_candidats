import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, Zap } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UrgentReinforcementButtons } from "./response-buttons";

export const dynamic = "force-dynamic";

// Page d'acceptation 1-clic d'une offre de renfort URGENT (cascade).
// L'employe y arrive depuis la notification 'urgent_replacement_offer'.
export default async function UrgentReinforcementPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("reinforcement_requests")
    .select(
      `id, site_id, date, start_time, end_time, position, notes, status,
       proposed_employee_id, expires_at, is_urgent,
       site:sites(code, name, address, city)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();

  type Row = {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: string | null;
    notes: string | null;
    status: string;
    proposed_employee_id: string | null;
    expires_at: string | null;
    is_urgent: boolean | null;
    site: { code: string; name: string; address: string | null; city: string | null } | null;
  };
  const r = req as unknown as Row;

  // Verifie que l'utilisateur connecte est l'employe actuellement propose.
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const myEmpId = (emp as { id: string } | null)?.id ?? null;
  const itsMine = myEmpId !== null && myEmpId === r.proposed_employee_id;

  if (!itsMine && r.status === "sent_to_employee") {
    // La proposition est passee a quelqu'un d'autre.
    redirect("/me");
  }

  const dateFr = new Date(r.date + "T00:00:00").toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const canRespond = itsMine && r.status === "sent_to_employee";
  const expiresInMin = r.expires_at
    ? Math.max(0, Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/me">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Link>
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-line flex items-start gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-danger" /> Renfort urgent
            </h1>
            <p className="text-sm text-ink-2">On a besoin de toi rapidement — réponds vite.</p>
          </div>
          <span className="ml-auto px-3 py-1 rounded-full text-xs font-bold uppercase bg-danger-light text-danger">
            Urgent
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Site</div>
              <div className="font-bold mt-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-gold-dark" />
                {r.site?.code} — {r.site?.name}
              </div>
              {r.site?.address ? (
                <div className="text-xs text-ink-3 mt-1">{r.site.address}</div>
              ) : null}
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Quand</div>
              <div className="font-bold mt-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gold-dark" />
                {dateFr}
              </div>
              <div className="text-xs text-ink-3 mt-1">
                {r.start_time.slice(0, 5)} → {r.end_time.slice(0, 5)}
              </div>
            </div>
            {r.position ? (
              <div className="bg-surface-2 rounded-md p-3">
                <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Poste</div>
                <div className="font-bold mt-1">{r.position}</div>
              </div>
            ) : null}
            {r.notes ? (
              <div className="bg-surface-2 rounded-md p-3 sm:col-span-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-ink-3">Notes</div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{r.notes}</div>
              </div>
            ) : null}
          </div>

          {canRespond && expiresInMin != null ? (
            <div className="flex items-center gap-2 text-xs text-warn">
              <Clock className="h-3.5 w-3.5" />
              {expiresInMin > 0
                ? `La proposition passe au suivant dans ~${expiresInMin} min.`
                : "Réponds maintenant — la proposition est sur le point de passer au suivant."}
            </div>
          ) : null}

          {canRespond ? (
            <UrgentReinforcementButtons reinforcementId={r.id} />
          ) : (
            <div className="text-sm text-ink-3 italic">
              {r.status === "accepted"
                ? "Ce renfort a déjà été comblé."
                : "Cette proposition n'est plus active."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
