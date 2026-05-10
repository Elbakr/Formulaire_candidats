"use client";

// /admin/vip-clients — vue globale RH/admin.
// Liste filtrée par vendeuse + transfert d'une cliente entre vendeuses.

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, ArrowRightLeft, Cake, Phone, Mail, ShirtIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transferVipClientAction, deactivateVipClientAction } from "@/app/me/my-clients/actions";

type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dress_size: string | null;
  color_prefs: string | null;
  language: string | null;
  notes: string | null;
  birth_date: string | null;
  preferred_site_id: string | null;
  preferred_seller_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type Visit = {
  id: string;
  client_id: string;
  visited_at: string;
  kind: string;
  notes: string | null;
  follow_up_date: string | null;
  seller_id: string | null;
  site_id: string | null;
};

type Seller = { id: string; full_name: string; status: string };
type Site = { id: string; code: string; name: string };

export function VipAdmin({
  clients,
  sellers,
  sites,
  visits,
}: {
  clients: Client[];
  sellers: Seller[];
  sites: Site[];
  visits: Visit[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filterSeller, setFilterSeller] = useState("all");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferClient, setTransferClient] = useState<Client | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");

  const sellerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sellers) m.set(s.id, s.full_name);
    return m;
  }, [sellers]);
  const siteByCode = useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);
  const visitsByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits) m.set(v.client_id, (m.get(v.client_id) ?? 0) + 1);
    return m;
  }, [visits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (filterSeller === "all") {
        // pass
      } else if (filterSeller === "none") {
        if (c.preferred_seller_id) return false;
      } else if (c.preferred_seller_id !== filterSeller) {
        return false;
      }
      if (!q) return true;
      return [c.full_name, c.phone, c.email, c.notes]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [clients, filterSeller, search]);

  function refresh() {
    router.refresh();
  }

  function onConfirmTransfer() {
    if (!transferClient || !transferTarget) {
      toast.error("Choisis une vendeuse cible.");
      return;
    }
    const fd = new FormData();
    fd.set("id", transferClient.id);
    fd.set("new_seller_id", transferTarget);
    startTransition(async () => {
      const r = await transferVipClientAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Cliente transférée.");
        setTransferOpen(false);
        setTransferClient(null);
        setTransferTarget("");
        refresh();
      }
    });
  }

  function onDeactivate(c: Client) {
    if (!confirm(`Désactiver "${c.full_name}" ?`)) return;
    startTransition(async () => {
      const r = await deactivateVipClientAction(c.id);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Désactivée.");
        refresh();
      }
    });
  }

  // Stats par vendeuse
  const statsBySeller = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) {
      if (!c.is_active) continue;
      const k = c.preferred_seller_id ?? "_none";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [clients]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Clientes VIP — vue globale</h1>
        <p className="text-sm text-ink-2">
          {clients.length} fiches, {clients.filter((c) => c.is_active).length} actives.
          Transfert et supervision (création se fait depuis /me/my-clients).
        </p>
      </div>

      {/* Stats par vendeuse */}
      <Card>
        <div className="p-3 sm:p-4 border-b border-line">
          <h2 className="font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-gold-dark" />
            Répartition par vendeuse
          </h2>
        </div>
        <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {sellers
            .filter((s) => (statsBySeller.get(s.id) ?? 0) > 0)
            .sort(
              (a, b) =>
                (statsBySeller.get(b.id) ?? 0) - (statsBySeller.get(a.id) ?? 0),
            )
            .map((s) => (
              <button
                key={s.id}
                onClick={() => setFilterSeller(s.id)}
                className={`text-left rounded-md p-2 border ${
                  filterSeller === s.id
                    ? "bg-gold-light border-gold"
                    : "bg-surface border-line hover:border-gold"
                } transition-colors`}
              >
                <div className="text-2xl font-extrabold font-mono">
                  {statsBySeller.get(s.id) ?? 0}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 truncate">
                  {s.full_name}
                </div>
              </button>
            ))}
          {(statsBySeller.get("_none") ?? 0) > 0 ? (
            <button
              onClick={() => setFilterSeller("none")}
              className={`text-left rounded-md p-2 border ${
                filterSeller === "none"
                  ? "bg-warn-light border-warn"
                  : "bg-surface border-line hover:border-warn"
              } transition-colors`}
            >
              <div className="text-2xl font-extrabold font-mono">
                {statsBySeller.get("_none") ?? 0}
              </div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-ink-3 truncate">
                Sans vendeuse
              </div>
            </button>
          ) : null}
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Rechercher (nom, tel, email, notes)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Select value={filterSeller} onValueChange={setFilterSeller}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les vendeuses</SelectItem>
            <SelectItem value="none">Sans vendeuse attribuée</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b border-line">
          <h2 className="font-bold">{filtered.length} cliente(s)</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">Aucun résultat.</div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((c) => {
              const seller = c.preferred_seller_id
                ? sellerName.get(c.preferred_seller_id)
                : null;
              const site = c.preferred_site_id ? siteByCode.get(c.preferred_site_id) : null;
              return (
                <li key={c.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-9 w-9 rounded-full bg-gold-light text-gold-dark flex items-center justify-center shrink-0 font-bold">
                      {c.full_name
                        .split(/\s+/)
                        .map((s) => s[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-2 flex-wrap">
                        {c.full_name}
                        {!c.is_active ? (
                          <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-surface-2 text-ink-3">
                            Inactive
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-ink-3 flex items-center gap-3 flex-wrap">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        ) : null}
                        {c.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        ) : null}
                        {c.dress_size ? (
                          <span className="inline-flex items-center gap-1">
                            <ShirtIcon className="h-3 w-3" /> {c.dress_size}
                          </span>
                        ) : null}
                        {c.birth_date ? (
                          <span className="inline-flex items-center gap-1">
                            <Cake className="h-3 w-3" />{" "}
                            {new Date(c.birth_date + "T00:00:00").toLocaleDateString(
                              "fr-BE",
                              { day: "2-digit", month: "short" },
                            )}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-ink-2 mt-0.5">
                        Vendeuse : <strong>{seller ?? "—"}</strong>
                        {site ? (
                          <>
                            {" · "}
                            Boutique : <strong>{site.code}</strong>
                          </>
                        ) : null}
                        {" · "}Visites : <strong>{visitsByClient.get(c.id) ?? 0}</strong>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTransferClient(c);
                        setTransferTarget(c.preferred_seller_id ?? "");
                        setTransferOpen(true);
                      }}
                      title="Transférer"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Transférer
                    </Button>
                    {c.is_active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeactivate(c)}
                      >
                        Désactiver
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Dialog transfert */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Transférer {transferClient?.full_name ?? "—"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Affecter cette cliente à une autre vendeuse. La précédente perdra
              l'accès dans son onglet « Mes clientes » mais l'historique reste
              consultable côté admin.
            </p>
            <div>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="gold"
              onClick={onConfirmTransfer}
              disabled={pending || !transferTarget}
            >
              Transférer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
