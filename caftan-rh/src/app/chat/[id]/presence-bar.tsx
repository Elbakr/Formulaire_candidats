"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

type Person = {
  employee_id: string;
  full_name: string;
  clock_in_at: string;
  profile_id: string | null;
};

function elapsed(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function ChatPresenceBar({
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

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function refetch() {
      const { data } = await supabase
        .from("clock_currently_in")
        .select("employee_id, full_name, clock_in_at, profile_id")
        .eq("site_id", siteId)
        .order("clock_in_at", { ascending: true });
      if (mounted) setPeople((data ?? []) as Person[]);
    }

    const channel = supabase
      .channel(`chat-presence-${siteId}`)
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

  if (people.length === 0) {
    return (
      <div className="px-3 py-1.5 border-t border-line bg-surface-2/30 text-[11px] text-ink-3 flex items-center gap-1.5">
        <Activity className="h-3 w-3" />
        Personne n'est sur site en ce moment.
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 border-t border-line bg-success-light/40 flex items-center gap-2 overflow-x-auto">
      <Activity className="h-3 w-3 text-success shrink-0" />
      <span className="text-[10px] uppercase font-bold tracking-wider text-success shrink-0">
        Présents
      </span>
      <ul className="flex gap-1.5 items-center">
        {people.map((p) => (
          <li
            key={p.employee_id}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[11px] border border-line shrink-0"
            title={`Arrivé·e à ${new Date(p.clock_in_at).toLocaleTimeString(
              "fr-BE",
              { hour: "2-digit", minute: "2-digit" },
            )}`}
          >
            <NameAvatar name={p.full_name} className="h-4 w-4 text-[8px]" />
            <span className="font-bold truncate max-w-[100px]">{p.full_name}</span>
            <span className="text-ink-3 tabular-nums">
              {elapsed(p.clock_in_at, now)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
