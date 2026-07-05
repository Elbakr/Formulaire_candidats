import { createAdminClient } from "@/lib/supabase/server";
import { RenewalForm } from "./renewal-form";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-canvas flex items-start sm:items-center justify-center p-4 pt-safe pb-safe"
    >
      <div className="w-full max-w-md">
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-ink text-white px-5 py-4">
            <div className="text-gold font-bold uppercase tracking-[0.12em] text-[11px]">Caftan Factory</div>
            <div className="text-sm font-bold mt-0.5">Renouvellement de contrat</div>
          </div>
          <div className="p-5">{children}</div>
        </div>
        <p className="text-center text-[11px] text-ink-3 mt-3">By AMD Megastore — RH</p>
      </div>
    </main>
  );
}

export default async function RenewalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: rowRaw } = await admin
    .from("cdd_renewal_responses")
    .select("id, contract_end_date, responded_at, wants_renewal, employee:employees(full_name)")
    .eq("token", token)
    .maybeSingle();
  const row = rowRaw as {
    id: string;
    contract_end_date: string;
    responded_at: string | null;
    wants_renewal: boolean | null;
    employee: { full_name: string | null } | null;
  } | null;

  if (!row) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Lien invalide ou expiré</div>
          <p className="text-sm text-ink-2 mt-1">
            Ce lien n'est plus valide. Contacte l'équipe RH si besoin.
          </p>
        </div>
      </Shell>
    );
  }

  const fullName = row.employee?.full_name ?? "";
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const dateFr = new Date(`${row.contract_end_date}T12:00:00`).toLocaleDateString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "numeric", month: "long", year: "numeric",
  });

  if (row.responded_at) {
    return (
      <Shell>
        <div className="text-center py-4">
          <div className="text-base font-bold text-ink">Merci {firstName} !</div>
          <p className="text-sm text-ink-2 mt-1">
            Ta réponse ({row.wants_renewal ? "Oui" : "Non"}) a déjà été enregistrée. L'équipe RH revient vers toi.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-ink-2 leading-relaxed mb-4">
        Bonjour <b className="text-ink">{firstName}</b>, ton contrat se termine le{" "}
        <b className="text-ink">{dateFr}</b>. Nous avons été <b className="text-ink">ravis de travailler avec toi</b> 🙏
        <br />
        Selon les besoins de l'entreprise, nous serions heureux de te renouveler. Dis-nous simplement ton souhait :
      </p>
      <RenewalForm token={token} firstName={firstName} />
    </Shell>
  );
}
