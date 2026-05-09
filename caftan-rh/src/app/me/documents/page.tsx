import { FileText, Download } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  cv: "CV",
  cover_letter: "Lettre de motivation",
  id_card: "Pièce d'identité",
  diploma: "Diplôme",
  other: "Autre",
};

export default async function MyDocumentsPage() {
  const { user } = await requireProfile();
  const supabase = await createClient();

  // First get the user's candidate IDs
  const { data: cands } = await supabase
    .from("candidates")
    .select("id")
    .eq("profile_id", user.id);
  const candIds = ((cands ?? []) as { id: string }[]).map((c) => c.id);

  // Then fetch all documents on their applications
  let docs: Array<{
    id: string;
    file_name: string;
    kind: string;
    size_bytes: number | null;
    storage_path: string;
    created_at: string;
  }> = [];

  if (candIds.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("id")
      .in("candidate_id", candIds);
    const appIds = ((apps ?? []) as { id: string }[]).map((a) => a.id);
    if (appIds.length > 0) {
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, kind, size_bytes, storage_path, created_at")
        .in("application_id", appIds)
        .order("created_at", { ascending: false });
      docs = (data ?? []) as typeof docs;
    }
  }

  // Generate 1h signed URLs for each doc
  const docsWithUrl = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(d.storage_path, 60 * 60);
      return { ...d, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mes documents</h1>
        <p className="text-sm text-ink-2">CV et pièces jointes envoyés à l'équipe RH.</p>
      </div>
      <Card>
        {docsWithUrl.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="h-10 w-10 text-ink-3 mx-auto mb-3" />
            <p className="text-sm text-ink-2">Aucun document envoyé.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {docsWithUrl.map((d) => (
              <li key={d.id} className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-gold-light text-gold-dark flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{d.file_name}</div>
                  <div className="text-xs text-ink-3">
                    {KIND_LABELS[d.kind] ?? d.kind} ·{" "}
                    {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} Ko · ` : ""}
                    {formatDateTime(d.created_at)}
                  </div>
                </div>
                {d.url ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" /> Voir
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
