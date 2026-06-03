// Source unique pour la barre de navigation principale.
//
// Avant : chaque sous-route (`/admin/*`, `/planning/*`, `/rh/*`, `/me/*`, ...)
// avait son propre `layout.tsx` qui hardcodait sa propre nav. Conséquence :
// quand un admin était sur /admin/cockpit, il ne voyait QUE les liens admin —
// /scoring, /planning/swaps, /admin/tuya/*, /admin/overtime-audit étaient
// invisibles depuis cette vue. Beaucoup de pages n'étaient atteignables que
// par URL directe.
//
// Maintenant : un seul `getNavSections(role)` retourne la nav complète
// regroupée en sections collapsibles (Mon espace / Planning / RH / Pointage /
// Reporting / Admin). Chaque layout appelle simplement ce builder.
//
// La nav est filtrée par rôle (admin/rh/manager/candidate). Un manager ne
// voit pas les liens admin ; un candidate ne voit que sa propre section
// "Mon espace".

import type { NavIconName } from "@/components/app-shell";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: NavIconName;
  items: NavItem[];
  /** Section toujours dépliée et sans chevron (utile pour "Mon espace"). */
  alwaysOpen?: boolean;
};

type Role = "admin" | "rh" | "manager" | "candidate" | string;

function isPro(role: Role): boolean {
  return role === "admin" || role === "rh" || role === "manager";
}

function isHR(role: Role): boolean {
  return role === "admin" || role === "rh";
}

function isAdmin(role: Role): boolean {
  return role === "admin";
}

/**
 * Construit la nav principale pour un rôle donné.
 *
 * Règles :
 * - Tous les rôles ont accès à "Mon espace" (leur fiche perso + chat).
 * - admin/rh/manager voient Planning + RH + Pointage + Reporting.
 * - rh+ voit Reporting avancé (analytics, scoring, audit).
 * - admin seul voit la section Admin (settings, intégrations, debug, tuya...).
 */
export function getNavSections(role: Role): NavGroup[] {
  const groups: NavGroup[] = [];

  // ────────────────────────────────────────────────────────────────
  // 1) Mon espace — visible par TOUS (admin, rh, manager, candidate).
  //    Pour les pros c'est un raccourci vers leur propre vue ;
  //    pour le candidate/employee c'est l'unique section utile.
  // ────────────────────────────────────────────────────────────────
  const meItems: NavItem[] = [
    { href: "/me", label: "Mes candidatures", icon: "LayoutDashboard" },
    { href: "/me/today", label: "Aujourd'hui", icon: "LayoutDashboard" },
    { href: "/me/clock", label: "Pointage", icon: "Clock" },
    { href: "/me/planning", label: "Mon planning", icon: "CalendarDays" },
    { href: "/me/availability", label: "Mes dispos", icon: "Clock" },
    { href: "/me/time-off", label: "Mes congés", icon: "CalendarOff" },
    { href: "/me/swaps", label: "Échanges shifts", icon: "ArrowRightLeft" },
    { href: "/me/absence", label: "Signaler absence", icon: "AlertCircle" },
    { href: "/me/onboarding", label: "Mon onboarding", icon: "FileText" },
    { href: "/me/screening", label: "Questionnaire profilage", icon: "Sparkles" },
    { href: "/me/scoring", label: "Mon score", icon: "FileBarChart" },
    { href: "/me/my-bonus", label: "Mes primes", icon: "Star" },
    { href: "/me/my-clients", label: "Mes clientes VIP", icon: "Users" },
    { href: "/me/documents", label: "Mes documents", icon: "FileText" },
    { href: "/me/messages", label: "Messages", icon: "MessageSquare" },
    { href: "/me/mails", label: "Mails reçus", icon: "Mail" },
    { href: "/me/termination", label: "Rupture amiable", icon: "FileSignature" },
    { href: "/me/expenses", label: "Notes de frais", icon: "Receipt" },
    { href: "/faq", label: "FAQ / Aide", icon: "LifeBuoy" },
    { href: "/chat-ai", label: "Assistant IA RH ✨", icon: "Sparkles" },
    { href: "/chat", label: "Chat équipe", icon: "MessageSquare" },
    { href: "/me/profile", label: "Mon profil", icon: "User" },
  ];
  groups.push({
    id: "me",
    label: "Mon espace",
    icon: "User",
    items: meItems,
    // Pour candidate, c'est la seule section : on la laisse toujours dépliée.
    alwaysOpen: !isPro(role),
  });

  // À partir d'ici, seuls les pros voient la suite.
  if (!isPro(role)) return groups;

  // ────────────────────────────────────────────────────────────────
  // 2) Planning — admin / rh / manager
  // ────────────────────────────────────────────────────────────────
  groups.push({
    id: "planning",
    label: "Planning",
    icon: "CalendarDays",
    items: [
      { href: "/today", label: "Aujourd'hui", icon: "LayoutDashboard" },
      { href: "/m", label: "📱 Mobile dashboard", icon: "Sparkles" },
      { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays" },
      { href: "/planning/all-sites", label: "Vue ensemble", icon: "LayoutDashboard" },
      { href: "/planning/sites", label: "Sites", icon: "Building2" },
      { href: "/planning/employees", label: "Employés", icon: "UserCheck" },
      { href: "/planning/quotas", label: "Quotas", icon: "Activity" },
      { href: "/planning/validation", label: "Validation employés", icon: "ShieldCheck" },
      { href: "/planning/time-off", label: "Congés", icon: "CalendarOff" },
      { href: "/planning/swaps", label: "Échanges shifts", icon: "ArrowRightLeft" },
      { href: "/planning/auto-drafts", label: "Drafts auto", icon: "Sparkles" },
      { href: "/planning/reinforcement", label: "Renfort", icon: "LifeBuoy" },
      { href: "/requests", label: "Demandes équipe", icon: "ShoppingBag" },
      { href: "/chat", label: "Chat équipe", icon: "MessageSquare" },
    ],
  });

  // ────────────────────────────────────────────────────────────────
  // 3) RH — recrutement, candidats, onboarding (admin / rh / manager)
  // ────────────────────────────────────────────────────────────────
  const rhItems: NavItem[] = [
    { href: "/rh", label: "Tableau de bord", icon: "LayoutDashboard" },
    { href: "/rh/candidates", label: "Candidats", icon: "Users" },
    { href: "/rh/top-candidates", label: "Top candidats", icon: "Star" },
    { href: "/rh/pipeline", label: "Pipeline", icon: "KanbanSquare" },
    { href: "/rh/jobs", label: "Offres d'emploi", icon: "Briefcase" },
    { href: "/rh/agenda", label: "Agenda RDV", icon: "Calendar" },
    { href: "/rh/inbox", label: "Inbox actions IA", icon: "Sparkles" },
    { href: "/onboarding", label: "Onboarding", icon: "UserCheck" },
  ];
  if (role === "manager") {
    rhItems.unshift(
      { href: "/manager", label: "Mes candidats", icon: "Users" },
      { href: "/manager/calendar", label: "Mon agenda", icon: "Calendar" },
    );
  }
  if (isHR(role)) {
    rhItems.push(
      { href: "/rh/messages", label: "Messagerie email", icon: "Mail" },
      { href: "/rh/mails", label: "Mails envoyés", icon: "Mail" },
      { href: "/rh/screening", label: "Profilage candidats", icon: "Sparkles" },
      { href: "/rh/templates", label: "Templates emails", icon: "FileText" },
      { href: "/rh/sequences", label: "Séquences auto", icon: "FileText" },
      { href: "/rh/reports", label: "Rapports", icon: "FileBarChart" },
      { href: "/onboarding/templates", label: "Templates onboarding", icon: "FileText" },
    );
  }
  if (isAdmin(role)) {
    rhItems.push(
      { href: "/admin/cdd-renewals", label: "Renouvellements CDD", icon: "RefreshCw" },
      { href: "/admin/absences", label: "Absences imprévues", icon: "AlertCircle" },
      { href: "/admin/holidays", label: "Jours fériés & fermetures", icon: "Calendar" },
      { href: "/admin/seasonal", label: "Saisonnalités", icon: "Sparkles" },
    );
  }
  groups.push({
    id: "rh",
    label: "RH",
    icon: "Briefcase",
    items: rhItems,
  });

  // ────────────────────────────────────────────────────────────────
  // 4) Pointage — présence live, géofence, terminaux Tuya (admin / rh+)
  // ────────────────────────────────────────────────────────────────
  if (isHR(role)) {
    const pointageItems: NavItem[] = [
      { href: "/admin/presence", label: "Présence live", icon: "Activity" },
      { href: "/admin/heures-prestees", label: "Heures prestées", icon: "Clock" },
      { href: "/admin/encode-shifts", label: "Encoder shifts manqués", icon: "ClipboardEdit" },
      { href: "/admin/anomalies", label: "Anomalies pointage", icon: "AlertTriangle" },
    ];
    if (isAdmin(role)) {
      pointageItems.push(
        { href: "/admin/settings/geofence", label: "Géofence sites", icon: "ShieldCheck" },
        { href: "/admin/tuya/devices", label: "Terminaux Tuya", icon: "Activity" },
        { href: "/admin/tuya/users", label: "Empreintes Tuya", icon: "UserCheck" },
        { href: "/admin/tuya/logs", label: "Logs Tuya", icon: "FileBarChart" },
        { href: "/admin/tuya/auto-corrections", label: "Auto-corrections", icon: "AlertTriangle" },
        { href: "/admin/tuya/import", label: "Import CSV pointages", icon: "Upload" },
      );
    }
    groups.push({
      id: "pointage",
      label: "Pointage",
      icon: "Clock",
      items: pointageItems,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // 5) Reporting — analytics, scoring, audit (admin / rh / manager)
  // ────────────────────────────────────────────────────────────────
  const reportingItems: NavItem[] = [
    { href: "/planning/employees", label: "Prestations employés", icon: "Activity" },
    { href: "/scoring", label: "Scoring équipe", icon: "FileBarChart" },
    { href: "/scoring/weekly", label: "Notation hebdo", icon: "Star" },
  ];
  if (role === "manager") {
    reportingItems.push({ href: "/manager/performance", label: "Performance magasin", icon: "TrendingUp" });
  }
  if (isHR(role)) {
    reportingItems.push(
      { href: "/admin/analytics", label: "Analytics", icon: "FileBarChart" },
      { href: "/admin/analytics/sites", label: "Analytics par site", icon: "FileBarChart" },
      { href: "/admin/cockpit", label: "Cockpit exécutif", icon: "LayoutDashboard" },
      { href: "/admin/payroll", label: "Paie & exports", icon: "FileText" },
      { href: "/admin/payslips", label: "Fiches de paie + QR EPC", icon: "Wallet" },
      { href: "/admin/legal-rules", label: "Règles légales", icon: "ShieldCheck" },
      { href: "/admin/documents", label: "Documents centralisés", icon: "FileText" },
      { href: "/admin/overtime-audit", label: "Audit heures sup", icon: "Activity" },
      { href: "/admin/activity", label: "Journal d'activité", icon: "FileBarChart" },
    );
  }
  if (isAdmin(role)) {
    reportingItems.push(
      { href: "/admin/ai-audit", label: "AI audit", icon: "Sparkles" },
      { href: "/admin/digest", label: "Digest IA", icon: "Sparkles" },
    );
  }
  groups.push({
    id: "reporting",
    label: "Reporting",
    icon: "FileBarChart",
    items: reportingItems,
  });

  // ────────────────────────────────────────────────────────────────
  // 6) Admin — settings, intégrations, debug (admin uniquement)
  // ────────────────────────────────────────────────────────────────
  if (isAdmin(role)) {
    groups.push({
      id: "admin",
      label: "Admin",
      icon: "Sliders",
      items: [
        { href: "/admin", label: "Vue d'ensemble", icon: "LayoutDashboard" },
        { href: "/rh/documents", label: "Valise documents", icon: "Briefcase" },
        { href: "/rh/terminations", label: "Ruptures amiables", icon: "FileSignature" },
        { href: "/rh/dimona", label: "Déclarations Dimona", icon: "FileText" },
        { href: "/rh/stats", label: "Stats salaires + Export", icon: "TrendingUp" },
        { href: "/rh/expenses", label: "Notes de frais", icon: "Receipt" },
        { href: "/rh/trainings", label: "Formations & certifs", icon: "Sparkles" },
        { href: "/faq", label: "FAQ / Aide", icon: "LifeBuoy" },
        { href: "/admin/users", label: "Utilisateurs", icon: "Users" },
        { href: "/admin/departments", label: "Services", icon: "Building2" },
        { href: "/admin/settings", label: "Paramètres généraux", icon: "Sliders" },
        { href: "/admin/settings/leave-rules", label: "Règles congés", icon: "CalendarOff" },
        { href: "/admin/settings/kpi-weights", label: "Pondération KPI", icon: "FileBarChart" },
        { href: "/admin/settings/autoplaner-rules", label: "Règles auto-planning", icon: "Sliders" },
        { href: "/admin/settings/aid-dates", label: "Dates Aïd", icon: "Calendar" },
        { href: "/admin/settings/my-signature", label: "Ma signature ✍️", icon: "FileSignature" },
        { href: "/admin/settings/signature", label: "Provider signature (config)", icon: "Sliders" },
        { href: "/admin/bonus", label: "Primes & concours", icon: "Star" },
        { href: "/admin/vip-clients", label: "Clientes VIP", icon: "Users" },
        { href: "/admin/broadcasts", label: "Annonces broadcast", icon: "Megaphone" },
        { href: "/admin/pre-interview", label: "Pré-entretiens", icon: "Sparkles" },
        { href: "/admin/pre-interview/questions", label: "Questions pré-entretien", icon: "FileText" },
        { href: "/admin/integrations/gravity-forms", label: "Gravity Forms", icon: "Briefcase" },
        { href: "/admin/integrations/whatsapp", label: "WhatsApp", icon: "MessageSquare" },
        { href: "/admin/integrations/whatsapp/templates", label: "Templates WhatsApp", icon: "FileText" },
        { href: "/admin/help/planning", label: "Aide planning", icon: "LifeBuoy" },
        { href: "/admin/debug/push", label: "Debug push", icon: "Stethoscope" },
        { href: "/admin/debug/solver", label: "Debug solver", icon: "Stethoscope" },
      ],
    });
  }

  return groups;
}
