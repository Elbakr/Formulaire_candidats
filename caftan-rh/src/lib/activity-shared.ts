// Activity log constants/types — safe for client AND server.
// (No server-only imports here so we can pull labels into client components.)

/**
 * Canonical list of activity kinds. Most are emitted by SQL triggers
 * (see migration 20260509000014_activity.sql) but a few server actions
 * (e.g. EmailJS / batch operations) call `logActivity()` directly.
 */
export const ACTIVITY_KINDS = [
  // applications
  "application.created",
  "application.status_changed",
  // notes / messages
  "note.added",
  "email.sent",
  "email.received",
  // planning
  "shift.created",
  "shift.updated",
  "time_off.decided",
  // employees / scoring
  "employee.updated",
  "evaluation.created",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number] | (string & {});

export type ActivityTargetType =
  | "application"
  | "candidate"
  | "employee"
  | "shift"
  | "time_off"
  | "evaluation"
  | "note"
  | "message"
  | (string & {});

export type ActivityRow = {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  kind: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Human-readable French labels for each canonical kind.
 */
export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  "application.created": "Candidature créée",
  "application.status_changed": "Statut candidature changé",
  "note.added": "Note ajoutée",
  "email.sent": "Email envoyé",
  "email.received": "Email reçu",
  "shift.created": "Shift créé",
  "shift.updated": "Shift modifié",
  "time_off.decided": "Congé décidé",
  "employee.updated": "Employé modifié",
  "evaluation.created": "Évaluation créée",
};

/**
 * Grouped option list for the admin Activity filter Select.
 */
export const ACTIVITY_KIND_GROUPS: { label: string; kinds: string[] }[] = [
  { label: "Candidatures", kinds: ["application.created", "application.status_changed"] },
  { label: "Communication", kinds: ["note.added", "email.sent", "email.received"] },
  { label: "Planning", kinds: ["shift.created", "shift.updated", "time_off.decided"] },
  { label: "Équipe", kinds: ["employee.updated", "evaluation.created"] },
];
