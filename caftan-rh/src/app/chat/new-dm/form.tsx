"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createDmAction } from "../actions";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

export function NewDmForm({ profiles }: { profiles: Profile[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = q
    ? profiles.filter((p) =>
        (p.full_name ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : profiles.slice(0, 30);

  function open() {
    if (!selected) return;
    startTransition(async () => {
      const r = await createDmAction(selected);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.roomId) router.push(`/chat/${r.roomId}`);
    });
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Rechercher un nom…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
      />
      <ul className="max-h-72 overflow-y-auto divide-y divide-line border border-line rounded-md">
        {filtered.length === 0 ? (
          <li className="p-3 text-sm text-ink-3 italic text-center">
            Aucun résultat.
          </li>
        ) : (
          filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelected(p.id)}
                className={`w-full text-left p-2.5 hover:bg-surface-2 transition-colors ${
                  selected === p.id ? "bg-gold-light" : ""
                }`}
              >
                <div className="font-bold text-sm">{p.full_name ?? "—"}</div>
                <div className="text-xs text-ink-3">
                  {p.role ?? "employee"}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex justify-end">
        <button
          onClick={open}
          disabled={!selected || pending}
          className="bg-gold text-[#1a1a0d] disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-md px-4 py-2 text-sm"
        >
          {pending ? "Ouverture…" : "Ouvrir la conversation"}
        </button>
      </div>
    </div>
  );
}
