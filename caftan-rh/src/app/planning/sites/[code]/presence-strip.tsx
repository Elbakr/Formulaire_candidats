"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

type Person = {
  employee_id: string;
  full_name: string;
  clock_in_at: string;
  site_id: string | null;
};

function elapsed(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function SitePresenceStrip({
  siteId,
  initial,
}: {
  siteId: string;
  initial: Person[];
}) {
  const [people, setPeople] = useState<Person[]>(initial);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime — sur INSERT clock_entries lié à ce site, on refetch.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function refetch() {
      const { data } = await supabase
        .from("clock_currently_in")
        .select("employee_id, full_name, clock_in_at, site_id")
        .eq("site_id", siteId)
        .order("clock_in_at", { ascending: true });
      if (mounted) setPeople((data ?? []) as Person[]);
    }

    const channel = supabase
      .channel(`site-presence-${siteId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clock_entries" },
        () => {
          refetch();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [siteId]);

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-success" />
        <h2 className="font-bold text-sm">Présents en ce moment</h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-ink-3 ml-auto">
          {people.length}
        </span>
      </div>
      {people.length === 0 ? (
        <div className="text-xs text-ink-3 italic">
          Personne n'est clocké-in sur ce site actuellement.
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.map((p) => (
            <li
              key={p.employee_id}
              className="inline-flex items-center gap-2 rounded-full bg-success-light text-success px-2 py-1 text-xs"
              title={`Arrivé·e à ${new Date(p.clock_in_at).toLocaleTimeString(
                "fr-BE",
                { hour: "2-digit", minute: "2-digit" },
              )}`}
            >
              <NameAvatar name={p.full_name} className="h-5 w-5 text-[9px]" />
              <span className="font-bold">{p.full_name}</span>
              <span className="opacity-75 tabular-nums">
                · {elapsed(p.clock_in_at, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
