import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, FileText, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge, STATUS_LABELS } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/utils";
import { StatusControl } from "./status-control";
import { NotesPanel } from "./notes-panel";
import { InterviewsPanel } from "./interviews-panel";
import { SendEmailButton } from "./send-email-button";
import { ScheduleButton } from "./schedule-button";
import { WhatsAppButton, WhatsAppCandidateBadgesView } from "./whatsapp-button";
import { CandidateAdminForm } from "./admin-form";
import { TimelinePanel } from "./timeline-panel";
import { DocumentsPanel } from "./documents-panel";
import { CandidateScoreCard } from "./score-card";
import { GfFormView } from "./gf-form-view";
import { distanceCandidateToSites } from "@/lib/distance";
import { detectGender, genderEmoji, genderLabel } from "@/lib/heuristics/gender";
import { PreInterviewPanel } from "./pre-interview-panel";
import { HireCandidateButton } from "./hire-button";
import { loadQuestionsFor, preInterviewPublicUrl } from "@/lib/pre-interview";
import type {
  PreInterview,
  PreInterviewQuestion,
  PreInterviewResponse,
} from "@/lib/pre-interview-types";

export default async function CandidateDetailPage(props: PageProps<"/rh/candidates/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select(
      `id, status, rating, motivation, created_at, updated_at,
       candidate:candidates(*),
       job:jobs(id, title, location, contract_type)`,
    )
    .eq("id", id)
    .single();

  if (!app) notFound();

  const [notesRes, interviewsRes, docsRes, preIntRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id, body, is_private, created_at, author:profiles(id, full_name)")
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("interviews")
      .select("id, scheduled_at, duration_min, type, status, location, meeting_url, notes, interviewer_profile:profiles(id, full_name)")
      .eq("application_id", id)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id, file_name, kind, mime_type, size_bytes, storage_path, created_at")
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pre_interviews")
      .select(
        "id, application_id, position_role, token, language_code, sent_at, expires_at, started_at, completed_at, status, reviewer_id, reviewed_at, decision, decision_note, created_at",
      )
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const currentPreInterview = (preIntRes.data ?? null) as PreInterview | null;
  let preInterviewQuestions: PreInterviewQuestion[] = [];
  let preInterviewResponses: PreInterviewResponse[] = [];
  let preInterviewPublicLink: string | null = null;
  if (currentPreInterview) {
    const [qs, respRes] = await Promise.all([
      loadQuestionsFor(currentPreInterview.position_role, currentPreInterview.language_code),
      supabase
        .from("pre_interview_responses")
        .select(
          "id, pre_interview_id, question_id, answer_text, answer_choices, answer_scale, answered_at, video_storage_path, video_duration_sec, video_purge_after",
        )
        .eq("pre_interview_id", currentPreInterview.id),
    ]);
    preInterviewQuestions = qs;
    preInterviewResponses = (respRes.data ?? []) as PreInterviewResponse[];
    preInterviewPublicLink = preInterviewPublicUrl(currentPreInterview.token);
  } else {
    // Preview all role-tagged questions so the panel can filter on role change.
    const supabaseAdmin = await createClient();
    const { data: allQ } = await supabaseAdmin
      .from("pre_interview_questions")
      .select(
        "id, slug, position_role, language_code, prompt, kind, choices, min_chars, max_chars, is_required, sort_order, is_active, video_max_seconds",
      )
      .eq("is_active", true)
      .eq("language_code", "fr")
      .order("sort_order", { ascending: true });
    preInterviewQuestions = (allQ ?? []) as PreInterviewQuestion[];
  }

  const candidate = app.candidate as unknown as {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    birth_date: string | null;
    nrn: string | null;
    city: string | null;
    address: string | null;
    postal_code: string | null;
    country: string | null;
    iban: string | null;
    motivation?: string | null;
    available_from: string | null;
    wanted_contract_type: string | null;
    langs: Record<string, string> | null;
    raw_payload: Record<string, unknown> | null;
    cv_url: string | null;
    gf_full_payload: Record<string, unknown> | null;
    gf_entry_id: string | null;
    applied_at: string | null;
    created_at: string | null;
    whatsapp_opt_in?: boolean | null;
    whatsapp_blocked?: boolean | null;
    whatsapp_last_inbound_at?: string | null;
  };

  // WhatsApp compliance badges for the header.
  const waOptIn = !!candidate.whatsapp_opt_in;
  const waBlocked = !!candidate.whatsapp_blocked;
  const waInWindow24h = (() => {
    if (!candidate.whatsapp_last_inbound_at) return false;
    const last = new Date(candidate.whatsapp_last_inbound_at).getTime();
    return Date.now() - last < 24 * 3600 * 1000;
  })();

  // Approved + active templates for the WhatsApp dialog.
  const { data: waTemplates } = await supabase
    .from("whatsapp_templates")
    .select("slug, language_code, category, body, variables_count, twilio_content_sid")
    .eq("status", "approved")
    .eq("is_active", true)
    .order("slug");
  const approvedWaTemplates = ((waTemplates ?? []) as {
    slug: string;
    language_code: string;
    category: string;
    body: string;
    variables_count: number;
    twilio_content_sid: string | null;
  }[]).map((t) => ({
    slug: t.slug,
    language_code: t.language_code,
    category: t.category,
    body: t.body,
    variables_count: t.variables_count,
    has_content_sid: !!t.twilio_content_sid,
  }));

  const firstName = candidate.full_name.split(/\s+/)[0] ?? "";
  const detectedGender = detectGender(firstName);

  // Templates emails pour le bouton "Envoyer email"
  const { data: tmpls } = await supabase
    .from("email_templates")
    .select("slug, label, subject, body_html, needs_dates, needs_times")
    .eq("is_active", true)
    .order("label");

  // Sites actifs pour le bouton « Embaucher »
  const { data: sitesRaw } = await supabase
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("sort_order");
  const sitesForHire = ((sitesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>);

  // Distance domicile candidat ↔ chaque site (haversine, via be_postcodes).
  const dist = await distanceCandidateToSites(candidate.postal_code, candidate.city);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/rh/candidates"><ArrowLeft className="h-3.5 w-3.5" /> Retour</Link>
        </Button>
        <div className="ml-auto flex items-start gap-2 flex-wrap">
          {candidate.cv_url ? (
            <Button asChild variant="gold" size="sm">
              <a href={candidate.cv_url} target="_blank" rel="noopener noreferrer">
                <FileText className="h-3.5 w-3.5" /> Ouvrir le CV
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          ) : null}
          <HireCandidateButton
            applicationId={app.id}
            candidateName={candidate.full_name}
            candidateHasEmail={!!candidate.email}
            defaultPosition={
              (app.job as { title?: string } | null)?.title ?? "Vendeur·euse"
            }
            sites={sitesForHire}
            alreadyHired={app.status === "hired"}
          />
          <ScheduleButton applicationId={app.id} />
          <WhatsAppButton
            applicationId={app.id}
            candidateName={candidate.full_name}
            candidatePhone={candidate.phone}
            approvedTemplates={approvedWaTemplates}
          />
          <SendEmailButton applicationId={app.id} candidateName={candidate.full_name} templates={(tmpls ?? []) as never} />
        </div>
      </div>

      <Card>
        <div className="p-4 flex items-start gap-4 flex-wrap">
          <NameAvatar name={candidate.full_name} className="h-14 w-14 text-base rounded-xl" />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{candidate.full_name}</h1>
              {detectedGender !== "unknown" ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-light text-gold-dark"
                  title={`Genre détecté à partir du prénom — ${genderLabel(detectedGender)}`}
                >
                  {genderEmoji(detectedGender)} {genderLabel(detectedGender)}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-ink-2 mt-0.5">{(app.job as { title?: string } | null)?.title ?? "Candidature spontanée"}</div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {candidate.email}</span>
              {candidate.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {candidate.phone}</span> : null}
              {candidate.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {candidate.city}</span> : null}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Reçue le {formatDate(app.created_at)}</span>
            </div>
            {candidate.phone ? (
              <div className="mt-2">
                <WhatsAppCandidateBadgesView
                  state={{ optIn: waOptIn, blocked: waBlocked, inWindow24h: waInWindow24h }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={app.status as never} className="text-xs px-3 py-1">{STATUS_LABELS[app.status]}</Badge>
          </div>
        </div>
        <div className="border-t border-line p-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Info label="Adresse">{candidate.address ? `${candidate.address}, ${candidate.postal_code ?? ""} ${candidate.city ?? ""}` : "—"}</Info>
          <Info label="Date de naissance">{candidate.birth_date ? formatDate(candidate.birth_date) : "—"}</Info>
          <Info label="NRN">{candidate.nrn ?? "—"}</Info>
          <Info label="Pays">{candidate.country ?? "—"}</Info>
          <Info label="IBAN">{candidate.iban ?? "—"}</Info>
          <Info label="Disponible à partir du">
            {candidate.available_from ? formatDate(candidate.available_from) : "—"}
          </Info>
          <Info label="Contrat souhaité">{candidate.wanted_contract_type ?? "—"}</Info>
          <Info label="Langues">
            {candidate.langs && Object.keys(candidate.langs).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {Object.entries(candidate.langs).map(([lang, level]) => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-info-light text-info text-[10px] font-bold uppercase"
                  >
                    {lang} · {level}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            )}
          </Info>
          <Info label="CV">
            {candidate.cv_url ? (
              <a
                href={candidate.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-dark hover:underline inline-flex items-center gap-1"
              >
                <FileText className="h-3.5 w-3.5" /> Télécharger
              </a>
            ) : (
              <span className="text-ink-3 italic">Non fourni</span>
            )}
          </Info>
        </div>
      </Card>

      <StatusControl applicationId={app.id} currentStatus={app.status} currentRating={app.rating ?? 0} />

      <CandidateScoreCard
        candidate={{
          email: candidate.email,
          phone: candidate.phone,
          birth_date: candidate.birth_date,
          city: candidate.city,
          address: candidate.address,
          postal_code: candidate.postal_code,
          nrn: candidate.nrn,
          iban: candidate.iban,
          motivation: app.motivation,
          available_from: candidate.available_from,
          wanted_contract_type: candidate.wanted_contract_type,
          langs: candidate.langs,
          raw_payload: candidate.raw_payload,
          applied_at: candidate.applied_at,
          created_at: candidate.created_at,
          status: app.status,
          closest_site_distance_km: dist.closestDistanceKm,
        }}
        closestSiteCode={dist.closestCode}
      />

      {Object.keys(dist.byCode).length > 0 ? (
        <Card>
          <div className="p-3 flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-ink-2 mr-1">
              <MapPin className="h-3.5 w-3.5 inline mr-1" />
              Domicile candidat
            </span>
            <span className="text-ink-3">
              {candidate.address ? `${candidate.address}, ` : ""}
              {candidate.postal_code ?? ""} {candidate.city ?? ""}
              {!candidate.postal_code && !candidate.city ? "—" : ""}
            </span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              {Object.entries(dist.byCode).map(([code, km]) => {
                const isClosest = code === dist.closestCode;
                return (
                  <span
                    key={code}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      isClosest
                        ? "bg-success-light text-success font-bold"
                        : "bg-surface-2 text-ink-2"
                    }`}
                    title={
                      km === null
                        ? "Distance non calculée (postcode manquant)"
                        : `Distance approximative ${code}`
                    }
                  >
                    Site {code} :{" "}
                    {km === null ? "—" : `${km.toFixed(1)} km`}
                  </span>
                );
              })}
            </span>
          </div>
        </Card>
      ) : null}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="pre-interview">Pré-entretien{currentPreInterview ? ` · ${currentPreInterview.status}` : ""}</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notesRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="interviews">Entretiens ({interviewsRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({docsRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="dossier-docs">Dossier docs</TabsTrigger>
          <TabsTrigger value="motivation">Motivation</TabsTrigger>
          <TabsTrigger value="form">Formulaire candidat</TabsTrigger>
          <TabsTrigger value="admin">Dossier admin</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <TimelinePanel applicationId={app.id} />
        </TabsContent>

        <TabsContent value="pre-interview">
          <PreInterviewPanel
            applicationId={app.id}
            candidateName={candidate.full_name}
            candidateEmail={candidate.email}
            preInterview={currentPreInterview}
            questions={preInterviewQuestions}
            responses={preInterviewResponses}
            publicUrl={preInterviewPublicLink}
            preInterviewScore={(candidate as unknown as { pre_interview_score?: number | null }).pre_interview_score ?? null}
            preInterviewBreakdown={
              (candidate as unknown as {
                pre_interview_breakdown?: {
                  availability: number; mobility: number; communication: number;
                  text_quality: number; videos: number; engagement: number;
                  availability_label: string; mobility_label: string;
                  channels_count: number; videos_count: number;
                } | null;
              }).pre_interview_breakdown ?? null
            }
          />
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel applicationId={app.id} notes={(notesRes.data ?? []) as never} />
        </TabsContent>

        <TabsContent value="interviews">
          <InterviewsPanel applicationId={app.id} interviews={(interviewsRes.data ?? []) as never} />
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <div className="p-4">
              {(docsRes.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-3">Aucun document.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {docsRes.data!.map((d) => (
                    <li key={d.id} className="py-2 flex items-center gap-3 text-sm">
                      <span className="font-semibold flex-1">{d.file_name}</span>
                      <span className="text-xs text-ink-3 uppercase">{d.kind}</span>
                      <span className="text-xs text-ink-3">{formatDateTime(d.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dossier-docs">
          <DocumentsPanel applicationId={app.id} />
        </TabsContent>

        <TabsContent value="motivation">
          <Card>
            <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {app.motivation || <span className="text-ink-3">Aucune motivation fournie.</span>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="form">
          <Card>
            <div className="p-4 space-y-3">
              {candidate.gf_full_payload ? (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-line">
                    <div>
                      <h3 className="font-bold text-sm">Réponses du formulaire Gravity Forms</h3>
                      {candidate.gf_entry_id ? (
                        <p className="text-xs text-ink-3">
                          Entrée GF #{candidate.gf_entry_id} ·{" "}
                          {candidate.applied_at
                            ? `postulé le ${formatDate(candidate.applied_at)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    {candidate.cv_url ? (
                      <a
                        href={candidate.cv_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gold-dark hover:underline font-bold"
                      >
                        <FileText className="h-3.5 w-3.5" /> CV joint{" "}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  <GfFormView payload={candidate.gf_full_payload} />
                </>
              ) : candidate.raw_payload ? (
                <>
                  <p className="text-xs text-ink-3 mb-2">
                    Payload partiel (fallback raw_payload — relancer{" "}
                    <code className="font-mono bg-surface-2 px-1 rounded">
                      npm run sync:gf
                    </code>{" "}
                    pour récupérer le payload GF complet).
                  </p>
                  <GfFormView payload={candidate.raw_payload} />
                </>
              ) : (
                <p className="text-sm text-ink-3 italic">
                  Aucune donnée de formulaire disponible. Le candidat n'est pas
                  issu de Gravity Forms ou la sync n'a pas encore récupéré son
                  entrée.
                </p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="admin">
          <CandidateAdminForm candidate={candidate as never} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-md p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{children}</div>
    </div>
  );
}
