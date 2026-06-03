// Karim 2026-06-03 : endpoint deep link langue.
// GET /lang/nl?to=/me => set cookie lang=nl + redirect /me
// Utilise pour les liens dans les mails (NL direct, FR direct).

import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, ctx: { params: Promise<{ locale: string }> }) {
  const { locale } = await ctx.params;
  const lang = locale === "nl" ? "nl" : "fr";
  const dest = req.nextUrl.searchParams.get("to") ?? "/me";
  const safeDest = dest.startsWith("/") ? dest : "/me";

  const c = await cookies();
  c.set("lang", lang, {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const base = req.nextUrl.origin;
  return NextResponse.redirect(new URL(safeDest, base));
}
