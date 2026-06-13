import { BRAND } from "@/lib/config";
import { CandidateLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function CandidatLoginPage(
  props: { searchParams: Promise<{ next?: string }> },
) {
  const { next } = await props.searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/candidat";

  return (
    <main
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-canvas flex items-start sm:items-center justify-center p-4 pt-safe pb-safe"
    >
      <div className="w-full max-w-md">
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-ink text-white px-5 py-4">
            <div className="text-gold font-bold uppercase tracking-[0.12em] text-[11px]">{BRAND.name}</div>
            <div className="text-sm font-bold mt-0.5">Espace candidat</div>
          </div>
          <div className="p-5">
            <p className="text-sm text-ink-2 leading-relaxed mb-4">
              Connecte-toi pour voir le détail des offres, postuler et suivre tes candidatures.
              C'est gratuit et sans mot de passe.
            </p>
            <CandidateLoginForm next={safeNext} />
          </div>
        </div>
        <p className="text-center text-[11px] text-ink-3 mt-3">By AMD Megastore — Recrutement</p>
      </div>
    </main>
  );
}
