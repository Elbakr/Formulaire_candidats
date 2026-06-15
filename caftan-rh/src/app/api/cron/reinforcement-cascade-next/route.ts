import { NextResponse, type NextRequest } from "next/server";
import { advanceCascades } from "@/lib/scheduling/urgent-cascade";

export const dynamic = "force-dynamic";

// Cron : fait avancer toutes les cascades de remplacement urgent.
// A cadencer toutes les ~5 min (cf. caftan-crons.yml, schedule '*/5 * * * *').
// Idempotent et sur a relancer : l'etat (qui a deja ete sollicite, quelle
// proposition est en cours, son expiration) vit en base, pas dans le cron.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await advanceCascades();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[reinforcement-cascade-next] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
