// Types partagés client/serveur pour les quotas (sans dépendance à
// `next/headers` ou `@/lib/supabase/server`).

export type QuotaSnapshot = {
  weekHours: number;
  weekTarget: number;
  monthHours: number;
  monthTarget: number;
  yearHours: number;
  yearTarget: number | null;
  nextWeekHours: number;
};

export type EmployeeQuotaRow = {
  employee: {
    id: string;
    full_name: string;
    contract_type: string | null;
    weekly_hours: number | null;
    annual_hours_budget: number | null;
  };
  quota: QuotaSnapshot;
};
