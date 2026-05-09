import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Calendar } from "lucide-react";
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
import { CandidateAdminForm } from "./admin-form";

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

  const [notesRes, interviewsRes, docsRes] = await Promise.all([
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
  ]);

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
  };

  // Templates emails pour le bouton "Envoyer email"
  const { data: tmpls } = await supabase
    .from("email_templates")
    .select("slug, label, subject, body_html, needs_dates, needs_times")
    .eq("is_active", true)
    .order("label");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/rh/candidates"><ArrowLeft className="h-3.5 w-3.5" /> Retour</Link>
        </Button>
        <div className="ml-auto">
          <SendEmailButton applicationId={app.id} candidateName={candidate.full_name} templates={(tmpls ?? []) as never} />
        </div>
      </div>

      <Card>
        <div className="p-4 flex items-start gap-4 flex-wrap">
          <NameAvatar name={candidate.full_name} className="h-14 w-14 text-base rounded-xl" />
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-bold">{candidate.full_name}</h1>
            <div className="text-xs text-ink-2 mt-0.5">{(app.job as { title?: string } | null)?.title ?? "Candidature spontanée"}</div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {candidate.email}</span>
              {candidate.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {candidate.phone}</span> : null}
              {candidate.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {candidate.city}</span> : null}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Reçue le {formatDate(app.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={app.status as never} className="text-xs px-3 py-1">{STATUS_LABELS[app.status]}</Badge>
          </div>
        </div>
        <div className="border-t border-line p-4 grid md:grid-cols-2 gap-3">
          <Info label="Adresse">{candidate.address ? `${candidate.address}, ${candidate.postal_code ?? ""} ${candidate.city ?? ""}` : "—"}</Info>
          <Info label="Date de naissance">{candidate.birth_date ? formatDate(candidate.birth_date) : "—"}</Info>
          <Info label="NRN">{candidate.nrn ?? "—"}</Info>
          <Info label="Pays">{candidate.country ?? "—"}</Info>
        </div>
      </Card>

      <StatusControl applicationId={app.id} currentStatus={app.status} currentRating={app.rating ?? 0} />

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">Notes ({notesRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="interviews">Entretiens ({interviewsRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({docsRes.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="motivation">Motivation</TabsTrigger>
          <TabsTrigger value="admin">Dossier admin</TabsTrigger>
        </TabsList>

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

        <TabsContent value="motivation">
          <Card>
            <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {app.motivation || <span className="text-ink-3">Aucune motivation fournie.</span>}
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
