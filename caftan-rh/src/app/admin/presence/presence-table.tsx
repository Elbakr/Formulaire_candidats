"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Pencil, MapPin, Camera } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { createClient } from "@/lib/supabase/client";
import {
  forceClockOutAction,
  getSelfieSignedUrlAction,
  managerOverrideClockAction,
} from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Person = {
  employee_id: string;
  last_entry_id: string;
  clock_in_at: string;
  site_id: string | null;
  shift_id: string | null;
  entry_method: string;
  full_name: string;
  profile_id: string | null;
  site_code: string | null;
  site_name: string | null;
  site_color: string | null;
  site_light_color: string | null;
  /** Storage path du selfie (bucket clock-selfies). Null si pas de selfie. */
  selfie_storage_path?: string | null;
};

type Site = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  light_color: string | null;
};

function elapsed(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function PresenceLiveTable({
  initial,
  sites,
}: {
  initial: Person[];
  sites: Site[];
}) {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>(initial);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [overrideOpen, setOverrideOpen] = useState<Person | null>(null);

  // Tick chaque 30s pour rafraîchir les durées affichées.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscribe — quand `clock_entries` change, on refresh la liste via router.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clock_entries" },
        () => {
          // Approche simple : refresh la page pour re-fetcher la vue.
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Sync prop -> state
  useEffect(() => {
    setPeople(initial);
  }, [initial]);

  const grouped = new Map<string, Person[]>();
  for (const p of people) {
    const key = p.site_id ?? "__none__";
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }

  const ordered = sites
    .map((s) => ({ site: s, list: grouped.get(s.id) ?? [] }))
    .filter((g) => g.list.length > 0);
  const noSite = grouped.get("__none__") ?? [];

  function handleForceOut(p: Person) {
    if (!confirm(`Forcer le clock-out de ${p.full_name} ?`)) return;
    startTransition(async () => {
      const r = await forceClockOutAction({ employeeId: p.employee_id });
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${p.full_name} a été clocké-out.`);
        router.refresh();
      }
    });
  }

  return (
    <>
      {ordered.length === 0 && noSite.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-ink-3">
            Personne n'est clocké-in en ce moment.
          </div>
        </Card>
      ) : null}

      {ordered.map(({ site, list }) => (
        <Card key={site.id} className="overflow-hidden">
          <div
            className="px-3 py-2 border-b border-line flex items-center gap-2"
            style={{ backgroundColor: site.light_color ?? undefined }}
          >
            <span
              className="inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold text-xs"
              style={{ backgroundColor: site.color ?? "#666" }}
            >
              {site.code}
            </span>
            <div className="font-bold text-sm">{site.name}</div>
            <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-ink-3">
              {list.length} présent{list.length > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li
                key={p.employee_id}
                className="p-3 flex items-center gap-3 text-sm"
              >
                <SelfieThumb
                  storagePath={p.selfie_storage_path ?? null}
                  fullName={p.full_name}
                />
                <div className="flex-1 min-w-0">
                  <EmployeeQuickLink
                    employeeId={p.employee_id}
                    fullName={p.full_name}
                    profileId={p.profile_id}
                    withAvatar
                    avatarSize="md"
                    variant="block"
                    fullWidth
                    subtitle={
                      <span className="tabular-nums">
                        Depuis{" "}
                        {new Date(p.clock_in_at).toLocaleTimeString("fr-BE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {elapsed(p.clock_in_at, now)}
                      </span>
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrideOpen(p)}
                  disabled={pending}
                  title="Override (corriger)"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleForceOut(p)}
                  disabled={pending}
                  className="shrink-0"
                  title="Forcer le clock-out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sortir</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {noSite.length > 0 ? (
        <Card>
          <div className="px-3 py-2 border-b border-line flex items-center gap-2">
            <MapPin className="h-4 w-4 text-ink-3" />
            <div className="font-bold text-sm">Sans site</div>
            <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-ink-3">
              {noSite.length}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {noSite.map((p) => (
              <li
                key={p.employee_id}
                className="p-3 flex items-center gap-3 text-sm"
              >
                <SelfieThumb
                  storagePath={p.selfie_storage_path ?? null}
                  fullName={p.full_name}
                />
                <div className="flex-1 min-w-0">
                  <EmployeeQuickLink
                    employeeId={p.employee_id}
                    fullName={p.full_name}
                    profileId={p.profile_id}
                    withAvatar
                    avatarSize="md"
                    variant="block"
                    fullWidth
                    subtitle={
                      <span className="tabular-nums">
                        Depuis{" "}
                        {new Date(p.clock_in_at).toLocaleTimeString("fr-BE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {elapsed(p.clock_in_at, now)}
                      </span>
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverrideOpen(p)}
                  disabled={pending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleForceOut(p)}
                  disabled={pending}
                  className="shrink-0"
                  title="Forcer le clock-out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sortir</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <OverrideDialog
        open={!!overrideOpen}
        person={overrideOpen}
        onClose={() => setOverrideOpen(null)}
        onDone={() => {
          setOverrideOpen(null);
          router.refresh();
        }}
      />
    </>
  );
}

function OverrideDialog({
  open,
  person,
  onClose,
  onDone,
}: {
  open: boolean;
  person: Person | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"in" | "out">("out");
  const [timestamp, setTimestamp] = useState<string>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  });
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corriger le pointage</DialogTitle>
        </DialogHeader>
        {person ? (
          <div className="space-y-3 px-5 py-4">
            <div className="text-sm">
              <span className="text-ink-3">Employé : </span>
              <span className="font-bold">{person.full_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction("in")}
                className={`rounded-md border-[1.5px] px-3 py-2 text-sm font-bold ${
                  action === "in"
                    ? "border-success bg-success-light text-success"
                    : "border-line text-ink-3"
                }`}
              >
                Clock-in
              </button>
              <button
                type="button"
                onClick={() => setAction("out")}
                className={`rounded-md border-[1.5px] px-3 py-2 text-sm font-bold ${
                  action === "out"
                    ? "border-danger bg-danger-light text-danger"
                    : "border-line text-ink-3"
                }`}
              >
                Clock-out
              </button>
            </div>
            <div>
              <Label htmlFor="ts">Horodatage</Label>
              <Input
                id="ts"
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reason">Raison</Label>
              <Input
                id="reason"
                placeholder="Oubli, panne réseau, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            disabled={pending || !person}
            onClick={() =>
              startTransition(async () => {
                if (!person) return;
                const r = await managerOverrideClockAction({
                  employeeId: person.employee_id,
                  action,
                  timestamp: new Date(timestamp).toISOString(),
                  reason,
                  siteId: person.site_id,
                });
                if (r.error) toast.error(r.error);
                else {
                  toast.success("Pointage corrigé.");
                  onDone();
                }
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mini-thumbnail du selfie de pointage. On charge la signed URL on-demand
 * (au montage) avec une TTL de 60s. Click → modale full-size.
 */
function SelfieThumb({
  storagePath,
  fullName,
}: {
  storagePath: string | null;
  fullName: string;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [fullUrl, setFullUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setThumbUrl(null);
      return;
    }
    setLoading(true);
    getSelfieSignedUrlAction(storagePath).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.url) setThumbUrl(r.url);
    });
    return () => { cancelled = true; };
  }, [storagePath]);

  if (!storagePath) {
    return (
      <span
        title="Aucun selfie (anomalie potentielle)"
        className="inline-flex w-9 h-9 rounded-md items-center justify-center bg-warn-light text-warn shrink-0"
      >
        <Camera className="h-4 w-4" />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        title="Voir le selfie de pointage"
        className="w-9 h-9 rounded-md overflow-hidden bg-surface-2 shrink-0 border border-line hover:border-gold-dark transition-colors"
        onClick={async () => {
          if (!storagePath) return;
          const r = await getSelfieSignedUrlAction(storagePath);
          if (r.url) {
            setFullUrl(r.url);
            setOpen(true);
          } else {
            toast.error(r.error ?? "Selfie introuvable.");
          }
        }}
        disabled={loading}
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`Selfie ${fullName}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-full h-full text-ink-3">
            <Camera className="h-4 w-4" />
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selfie pointage — {fullName}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-4">
            {fullUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fullUrl}
                alt={`Selfie ${fullName}`}
                className="w-full rounded-md"
              />
            ) : (
              <div className="text-sm text-ink-3 text-center py-10">
                Chargement…
              </div>
            )}
            <p className="text-[11px] text-ink-3 mt-3">
              Photo conservée 30 jours puis purgée automatiquement (RGPD).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
