// Karim 2026-06-16 : helper UNIQUE d'insertion de notifications.
// Centralise la logique pour éviter les liens génériques ("/me", "/")
// qui rendent le clic push inutile.
//
// Le trigger Postgres `trg_notify_push_after_insert` déclenche le push
// automatiquement après chaque INSERT -> NE PAS appeler sendPushToProfile ici.
//
// Server-only : ne pas importer côté client.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotifyInput {
  recipientId: string;
  kind: string;
  title: string;
  body?: string;
  /** Lien OBLIGATOIRE vers l'objet concerné. Doit pointer vers une ressource
   *  précise (ex. "/admin/cdd-renewals", "/planning/employees/abc123").
   *  Interdit : chaîne vide, "/" seul, "/me" seul. */
  link: string;
  data?: Record<string, unknown>;
}

type NotifyInputWithoutRecipient = Omit<NotifyInput, "recipientId">;

// ---------------------------------------------------------------------------
// Validation interne
// ---------------------------------------------------------------------------

/** Lève en développement, console.warn en production. */
function assertLink(link: string): void {
  const bad =
    !link ||
    link.trim() === "" ||
    link.trim() === "/" ||
    link.trim() === "/me";

  if (!bad) return;

  const msg =
    `[notify] Lien générique interdit : "${link}". ` +
    `Fournir un lien vers l'objet concerné (ex. "/admin/cdd-renewals", "/planning/employees/:id").`;

  if (process.env.NODE_ENV === "development") {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/** Insère une notification pour un seul destinataire. */
export async function notify(input: NotifyInput): Promise<void> {
  assertLink(input.link);

  const supabase = createAdminClient();
  const { error } = await supabase.from("notifications").insert({
    recipient_id: input.recipientId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link,
    data: input.data ?? null,
  });

  if (error) {
    console.error(`[notify] Erreur insert notification (kind=${input.kind}):`, error.message);
    throw new Error(error.message);
  }
}

/** Insère une notification en batch pour plusieurs destinataires. */
export async function notifyMany(
  recipientIds: string[],
  input: NotifyInputWithoutRecipient,
): Promise<void> {
  if (recipientIds.length === 0) return;
  assertLink(input.link);

  const supabase = createAdminClient();
  const rows = recipientIds.map((recipientId) => ({
    recipient_id: recipientId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link,
    data: input.data ?? null,
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error(`[notifyMany] Erreur insert batch (kind=${input.kind}):`, error.message);
    throw new Error(error.message);
  }
}

/** Résout les profiles par rôle, puis insère une notification pour chacun. */
export async function notifyRoles(
  roles: string[],
  input: NotifyInputWithoutRecipient,
): Promise<void> {
  if (roles.length === 0) return;
  assertLink(input.link);

  const supabase = createAdminClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id")
    .in("role", roles);

  if (error) {
    console.error(`[notifyRoles] Erreur résolution rôles (${roles.join(",")}):`, error.message);
    throw new Error(error.message);
  }

  const ids = (profiles ?? []).map((p: { id: string }) => p.id);
  await notifyMany(ids, input);
}
