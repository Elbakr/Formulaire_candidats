// Karim 2026-06-01 : route Next.js qui rend la lettre 402.00 directement
// avec Content-Type: text/html (donc browser-rendered + Ctrl+P fonctionne).
// Authentification :
//   - admin/RH : check role via Supabase session
//   - destinataire externe (mail) : passe un token (?t=...) signe court
//
// Avantage vs Supabase signed URL : pas de dependance au bucket pour
// l'affichage. Le bucket reste pour archive si besoin futur.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { renderTerminationLetterHtml } from "@/lib/termination-letter";
import { logDocAudit } from "@/lib/document-audit-log";

export const dynamic = "force-dynamic";

const EMPLOYER_INFO: Record<string, { name: string; address: string; city: string }> = {
  amd_megastore: { name: "AMD MEGASTORE SRL", address: "Rue de Brabant 230", city: "1030 Schaerbeek" },
  caftan_factory: { name: "Caftan Factory", address: "Rue de Brabant 230", city: "1030 Schaerbeek" },
};

function decodeToken(token: string): { id: string; exp: number } | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tokenParam = req.nextUrl.searchParams.get("t");

  let authorized = false;
  let actorId: string | null = null;

  // 1) Auth via token (recipient externe)
  if (tokenParam) {
    const decoded = decodeToken(tokenParam);
    if (decoded && decoded.id === id && decoded.exp >= Math.floor(Date.now() / 1000)) {
      authorized = true;
    }
  }

  // 2) Auth via session admin/RH OU employee proprietaire
  if (!authorized) {
    const supa = await createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (user) {
      const { data: prof } = await supa.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = prof?.role as string | undefined;
      if (role === "admin" || role === "rh") {
        authorized = true;
        actorId = user.id;
      } else {
        // employee : verifie que la termination le concerne
        const { data: emp } = await supa.from("employees").select("id").eq("profile_id", user.id).maybeSingle();
        if (emp) {
          const { data: term } = await supa
            .from("contract_terminations")
            .select("employee_id")
            .eq("id", id)
            .maybeSingle();
          if (term?.employee_id === emp.id) {
            authorized = true;
            actorId = user.id;
          }
        }
      }
    }
  }

  if (!authorized) {
    return new NextResponse("Acces refuse", { status: 403 });
  }

  // 3) Charge la termination + employee
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("contract_terminations")
    .select("id, employee_id, employer_org_key, effective_date, city, employer_representative_name")
    .eq("id", id)
    .maybeSingle();
  if (!t) return new NextResponse("Convention introuvable", { status: 404 });

  const { data: emp } = await admin
    .from("employees")
    .select("full_name, address, city, postal_code")
    .eq("id", t.employee_id)
    .maybeSingle();
  if (!emp) return new NextResponse("Employee introuvable", { status: 404 });

  // Karim 2026-06-01 : mode=print → mention manuscrite (cases vides pour
  // signature stylo), sinon mention eIDAS pour signature electronique.
  const mode: "print" | "esign" = req.nextUrl.searchParams.get("mode") === "print" ? "print" : "esign";

  const employer = EMPLOYER_INFO[t.employer_org_key] ?? EMPLOYER_INFO.amd_megastore;
  const html = renderTerminationLetterHtml(
    {
      employer_org_name: employer.name,
      employer_address: employer.address,
      employer_city: employer.city,
      employer_representative_name: t.employer_representative_name,
      employee_full_name: emp.full_name ?? "",
      employee_address: emp.address ?? "",
      employee_city: emp.postal_code ? `${emp.postal_code} ${emp.city ?? ""}`.trim() : (emp.city ?? ""),
      effective_date_iso: t.effective_date ?? new Date().toISOString().slice(0, 10),
      signing_city: t.city ?? "Schaerbeek",
      signing_date_iso: new Date().toISOString().slice(0, 10),
      mode,
    },
    { toolbar: true }, // barre Imprimer + Fermer (sortie du mode aperçu)
  );

  // Audit log de la consultation
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  void logDocAudit({
    employee_id: t.employee_id,
    doc_type: "contract",
    doc_ref: id,
    doc_label: "Convention cessation contrat commun accord",
    action: "view",
    channel: tokenParam ? "direct_link" : "in_app",
    actor_profile_id: actorId,
    ip_address: ip,
    user_agent: ua,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
