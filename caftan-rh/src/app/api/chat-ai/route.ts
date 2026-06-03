// Karim 2026-06-03 : endpoint chat IA RH via Anthropic Claude.
// Réponses ancrées dans le Code du travail BE + CCT 201 + ENV CaftanRH.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Tu es un assistant RH pour les employés de Caftan Factory (AMD Megastore SRL).
Tu réponds aux questions sur :
- Code du travail belge (loi 3 juillet 1978, etc.)
- CCT 201 (commerce alimentaire)
- Règlement eIDAS UE 910/2014 pour signatures électroniques
- RGPD pour protection des données
- Pratique RH usuelle en Belgique

Règles :
1. Réponses CONCRÈTES et orientées action (pas que théorie)
2. Cite la source légale précise quand pertinent (loi, article, CCT)
3. Si la question dépasse ton scope, dirige vers hr@caftanfactory.com
4. Tutoie l'utilisateur (style PME bienveillant)
5. Maximum 4-5 phrases sauf si la question demande des détails
6. Si la question est sur une situation personnelle complexe (rupture, dispute, harcèlement, etc.), recommande TOUJOURS de contacter un avocat du travail ou un syndicat
7. N'invente JAMAIS de chiffres précis (salaires, primes, dates) — dirige vers la fiche de paie ou contrat
8. Réponds en FR (sauf si question en NL ou EN explicite)`;

interface Msg { role: "user" | "assistant"; content: string }

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Anthropic API non configurée (ANTHROPIC_API_KEY manquant)" }, { status: 503 });
  }

  // Auth - require logged user
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { messages: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages[] requis" }, { status: 400 });
  }
  const messages = body.messages.slice(-20); // max 20 derniers tours

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn("[chat-ai] Anthropic", res.status, txt.slice(0, 200));
      return NextResponse.json({ error: `Anthropic HTTP ${res.status}` }, { status: 502 });
    }
    const data = await res.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    const reply = data.content?.[0]?.text ?? "(pas de réponse)";

    // Log non-bloquant
    try {
      const admin = createAdminClient();
      await admin.from("chat_ai_logs").insert({
        user_id: user.id,
        user_message: messages[messages.length - 1].content.slice(0, 1000),
        assistant_reply: reply.slice(0, 4000),
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      });
    } catch (e) {
      console.warn("[chat-ai] log err:", (e as Error).message);
    }

    return NextResponse.json({ reply, usage: data.usage });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
