import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

import { loadPreInterviewBundleByToken } from "@/lib/pre-interview";
import { isPreInterviewExpired } from "@/lib/pre-interview-types";
import { Card } from "@/components/ui/card";
import { PreInterviewForm } from "./pre-interview-form";
import { getLocale } from "@/lib/locale-server";
import { t, type Locale } from "@/lib/i18n";

export default async function PublicPreInterviewPage(
  props: PageProps<"/pre-interview/[token]">,
) {
  const { token } = await props.params;
  const bundle = await loadPreInterviewBundleByToken(token);
  // La locale candidate est dérivée du cookie. Le `language_code` du
  // pre_interview reste informatif pour les emails RH ; côté UI candidat on
  // suit le cookie (que le candidat peut basculer via <LangToggle>).
  const locale = await getLocale();

  if (!bundle) {
    return (
      <PublicShell locale={locale}>
        <ErrorState
          title={t("pre_interview.invalid_title", locale)}
          message={t("pre_interview.invalid_body", locale)}
          backLabel={t("pre_interview.back_to_site", locale)}
        />
      </PublicShell>
    );
  }

  const { preInterview, questions, responses } = bundle;

  if (preInterview.status === "discarded") {
    return (
      <PublicShell locale={locale}>
        <ErrorState
          title={t("pre_interview.discarded_title", locale)}
          message={t("pre_interview.discarded_body", locale)}
          backLabel={t("pre_interview.back_to_site", locale)}
        />
      </PublicShell>
    );
  }

  if (preInterview.status === "completed") {
    return (
      <PublicShell locale={locale}>
        <SuccessState
          title={t("pre_interview.submitted_thanks", locale)}
          message={t("pre_interview.submitted_body", locale)}
          footer={t("pre_interview.location_footer", locale)}
        />
      </PublicShell>
    );
  }

  if (isPreInterviewExpired(preInterview)) {
    return (
      <PublicShell locale={locale}>
        <ErrorState
          title={t("pre_interview.expired_title", locale)}
          message={t("pre_interview.expired_body", locale)}
          tone="warn"
          backLabel={t("pre_interview.back_to_site", locale)}
        />
      </PublicShell>
    );
  }

  const visibleQuestions = questions.filter(
    (q) => q.position_role === "all" || q.position_role === preInterview.position_role,
  );

  return (
    <PublicShell locale={locale}>
      <PreInterviewForm
        token={token}
        questions={visibleQuestions}
        initialResponses={responses}
        expiresAt={preInterview.expires_at}
        locale={locale}
      />
    </PublicShell>
  );
}

function PublicShell({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <div className="min-h-screen bg-canvas pb-safe">
      <header className="bg-ink text-white px-4 py-4 sm:py-5 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
          <span className="text-[11px] tracking-[0.18em] uppercase font-bold text-gold">
            Caftan Factory
          </span>
          <span className="text-[11px] text-white/60 ml-auto">
            {t("pre_interview.brand_label", locale)}
          </span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 scroll-smooth-touch">{children}</main>
      <footer className="max-w-2xl mx-auto px-4 pb-8 text-[11px] text-ink-3 text-center">
        {t("pre_interview.footer", locale)}
      </footer>
    </div>
  );
}

function ErrorState({
  title,
  message,
  tone = "danger",
  backLabel,
}: {
  title: string;
  message: string;
  tone?: "danger" | "warn";
  backLabel: string;
}) {
  const palette =
    tone === "danger"
      ? "border-danger-light bg-danger-light/40 text-danger"
      : "border-warn-light bg-warn-light/40 text-warn";
  return (
    <Card className={`p-5 ${palette}`}>
      <div className="flex items-start gap-3">
        {tone === "danger" ? (
          <XCircle className="h-6 w-6 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5" />
        )}
        <div>
          <h1 className="font-bold text-base text-ink">{title}</h1>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">{message}</p>
          <p className="text-xs text-ink-3 mt-3">
            <Link href="https://caftanfactory.com" className="underline">
              {backLabel}
            </Link>
          </p>
        </div>
      </div>
    </Card>
  );
}

function SuccessState({
  title,
  message,
  footer,
}: {
  title: string;
  message: string;
  footer: string;
}) {
  return (
    <Card className="p-5 border-success bg-success-light/40">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-success mt-0.5" />
        <div>
          <h1 className="font-bold text-base text-ink">{title}</h1>
          <p className="text-sm text-ink-2 mt-2 leading-relaxed">{message}</p>
          <p className="text-xs text-ink-3 mt-4">{footer}</p>
        </div>
      </div>
    </Card>
  );
}
