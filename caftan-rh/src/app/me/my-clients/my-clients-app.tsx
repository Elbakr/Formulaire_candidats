"use client";

// /me/my-clients — application mobile-first pour la vendeuse.
// Utilisée en boutique sur smartphone. Layout 1 colonne, gros boutons, peu de
// chrome. La RGPD impose une checkbox de consentement EXPLICITE à la création.

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Phone,
  Mail,
  Cake,
  ShoppingBag,
  ShirtIcon,
  RotateCcw,
  Eye,
  ChevronRight,
  X,
  CalendarPlus,
  StickyNote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  createVipClientAction,
  deactivateVipClientAction,
  logVipVisitAction,
  type VipKind,
} from "./actions";

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
  kind: VipKind;
  notes: string | null;
  follow_up_date: string | null;
  seller_id: string | null;
  site_id: string | null;
};

type Site = { id: string; code: string; name: string };

const KIND_LABEL: Record<VipKind, string> = {
  visit: "Visite",
  fitting: "Essayage",
  purchase: "Achat",
  return: "Retour",
};

const KIND_ICON: Record<VipKind, React.ComponentType<{ className?: string }>> = {
  visit: Eye,
  fitting: ShirtIcon,
  purchase: ShoppingBag,
  return: RotateCcw,
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-BE", { day: "2-digit", month: "short" });
}
function fmtBirth(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("fr-BE", { day: "2-digit", month: "long" });
}
function isBirthdayThisWeek(d: string | null): boolean {
  if (!d) return false;
  const today = new Date();
  const bd = new Date(d + "T00:00:00");
  // Met le birthday sur l'année en cours
  const upcoming = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  const diff = (upcoming.getTime() - today.getTime()) / 86_400_000;
  return diff >= -1 && diff <= 7;
}

export function MyClientsApp({
  myEmployeeId,
  clients,
  visits,
  sites,
}: {
  myEmployeeId: string;
  clients: Client[];
  visits: Visit[];
  sites: Site[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openCreate, setOpenCreate] = useState(false);
  const [openVisit, setOpenVisit] = useState(false);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const visitFormRef = useRef<HTMLFormElement>(null);
  const [search, setSearch] = useState("");

  const visitsByClient = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) {
      const arr = m.get(v.client_id) ?? [];
      arr.push(v);
      m.set(v.client_id, arr);
    }
    return m;
  }, [visits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.full_name, c.phone, c.email, c.dress_size, c.notes]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }, [clients, search]);

  function refresh() {
    router.refresh();
  }

  function onCreate(fd: FormData) {
    startTransition(async () => {
      const r = await createVipClientAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Cliente VIP enregistrée.");
        formRef.current?.reset();
        setOpenCreate(false);
        refresh();
      }
    });
  }

  function onLogVisit(fd: FormData) {
    startTransition(async () => {
      const r = await logVipVisitAction(fd);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Visite enregistrée.");
        visitFormRef.current?.reset();
        setOpenVisit(false);
        setActiveClient(null);
        refresh();
      }
    });
  }

  function onDeactivate(c: Client) {
    if (!confirm(`Désactiver "${c.full_name}" ? (reste consultable côté admin)`)) return;
    startTransition(async () => {
      const r = await deactivateVipClientAction(c.id);
      if ("error" in r && r.error) toast.error(r.error);
      else {
        toast.success("Cliente désactivée.");
        refresh();
      }
    });
  }

  return (
    <div className="space-y-3 max-w-2xl pb-safe">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mes clientes VIP</h1>
          <p className="text-sm text-ink-2">
            {clients.length} cliente{clients.length > 1 ? "s" : ""} suivie
            {clients.length > 1 ? "s" : ""}.
          </p>
        </div>
        <Button
          variant="gold"
          size="lg"
          className="ml-auto h-11 px-4"
          onClick={() => setOpenCreate(true)}
        >
          <Plus className="h-4 w-4" /> Nouvelle
        </Button>
      </div>

      <Input
        placeholder="Rechercher (nom, téléphone, taille…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11"
      />

      {filtered.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-ink-3">
            {search
              ? "Aucune cliente ne correspond à ta recherche."
              : "Tu n'as pas encore de cliente VIP. Clique « Nouvelle » pour démarrer."}
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const cVisits = visitsByClient.get(c.id) ?? [];
            const lastVisit = cVisits[0] ?? null;
            const birthSoon = isBirthdayThisWeek(c.birth_date);
            return (
              <li key={c.id}>
                <Card>
                  <div className="p-3 flex items-start gap-3 flex-wrap">
                    <div className="h-10 w-10 rounded-full bg-gold-light text-gold-dark flex items-center justify-center shrink-0 font-bold">
                      {c.full_name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base truncate">{c.full_name}</div>
                      <div className="text-xs text-ink-3 flex items-center gap-2 flex-wrap mt-0.5">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1 hover:text-gold-dark"
                          >
                            <Phone className="h-3 w-3" /> {c.phone}
                          </a>
                        ) : null}
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="inline-flex items-center gap-1 hover:text-gold-dark"
                          >
                            <Mail className="h-3 w-3" /> {c.email}
                          </a>
                        ) : null}
                        {c.dress_size ? (
                          <span className="inline-flex items-center gap-1">
                            <ShirtIcon className="h-3 w-3" /> Taille {c.dress_size}
                          </span>
                        ) : null}
                        {c.birth_date ? (
                          <span
                            className={`inline-flex items-center gap-1 ${birthSoon ? "font-bold text-rose-600" : ""}`}
                          >
                            <Cake className="h-3 w-3" />
                            {fmtBirth(c.birth_date)}
                            {birthSoon ? " (cette semaine)" : ""}
                          </span>
                        ) : null}
                      </div>
                      {c.color_prefs ? (
                        <div className="text-xs text-ink-2 mt-0.5">
                          Couleurs : {c.color_prefs}
                        </div>
                      ) : null}
                      {c.notes ? (
                        <div className="text-xs text-ink-3 italic mt-0.5">
                          {c.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Timeline visites */}
                  {cVisits.length > 0 ? (
                    <div className="border-t border-line">
                      <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-ink-3 flex items-center gap-2">
                        Historique ({cVisits.length})
                        {lastVisit ? (
                          <span className="text-ink-3 font-normal">
                            · dernière {fmt(lastVisit.visited_at)}
                          </span>
                        ) : null}
                      </div>
                      <ul className="px-3 pb-2 space-y-1">
                        {cVisits.slice(0, 4).map((v) => {
                          const Icon = KIND_ICON[v.kind];
                          return (
                            <li
                              key={v.id}
                              className="flex items-start gap-2 text-xs"
                            >
                              <Icon className="h-3.5 w-3.5 text-ink-3 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-bold">
                                  {KIND_LABEL[v.kind]}
                                </span>{" "}
                                <span className="text-ink-3">
                                  · {fmt(v.visited_at)}
                                </span>
                                {v.follow_up_date ? (
                                  <span className="text-rose-600 ml-1">
                                    · suivi {fmt(v.follow_up_date)}
                                  </span>
                                ) : null}
                                {v.notes ? (
                                  <div className="text-ink-2 mt-0.5 line-clamp-2">{v.notes}</div>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                        {cVisits.length > 4 ? (
                          <li className="text-[11px] text-ink-3 italic">
                            + {cVisits.length - 4} plus anciennes
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}

                  <div className="border-t border-line p-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="gold"
                      className="flex-1 h-10"
                      onClick={() => {
                        setActiveClient(c);
                        setOpenVisit(true);
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" /> Logger visite
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDeactivate(c)}
                      title="Désactiver"
                    >
                      <X className="h-4 w-4 text-ink-3" />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dialog création */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle cliente VIP</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={onCreate} className="space-y-3">
            <div>
              <Label htmlFor="vc-name">Nom complet *</Label>
              <Input id="vc-name" name="full_name" required autoFocus className="h-11" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="vc-phone">Téléphone</Label>
                <Input id="vc-phone" name="phone" type="tel" className="h-11" placeholder="+32..." />
              </div>
              <div>
                <Label htmlFor="vc-email">Email</Label>
                <Input id="vc-email" name="email" type="email" className="h-11" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vc-size">Taille</Label>
                <Input id="vc-size" name="dress_size" placeholder="38, M, …" className="h-11" />
              </div>
              <div>
                <Label htmlFor="vc-lang">Langue</Label>
                <Select name="language" defaultValue="fr">
                  <SelectTrigger id="vc-lang" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="nl">Néerlandais</SelectItem>
                    <SelectItem value="ar">Arabe</SelectItem>
                    <SelectItem value="en">Anglais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="vc-colors">Couleurs préférées</Label>
              <Input id="vc-colors" name="color_prefs" className="h-11" placeholder="Bordeaux, doré..." />
            </div>
            <div>
              <Label htmlFor="vc-birth">Anniversaire (mois-jour suffit)</Label>
              <Input id="vc-birth" name="birth_date" type="date" className="h-11" />
            </div>
            <div>
              <Label htmlFor="vc-site">Boutique préférée</Label>
              <Select name="preferred_site_id" defaultValue="">
                <SelectTrigger id="vc-site" className="h-11">
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucune</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vc-notes">Notes</Label>
              <Textarea id="vc-notes" name="notes" rows={2} placeholder="Cliente fidèle, préfère les essayages le matin..." />
            </div>
            <label className="flex items-start gap-2 text-sm bg-warn-light/40 border border-warn-light p-3 rounded-md">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-1 h-4 w-4"
              />
              <span>
                <strong>Consentement RGPD obligatoire.</strong> Je confirme que la
                cliente m'a donné son accord explicite pour que la boutique
                conserve ses informations (taille, préférences, contact, anniv.)
                à des fins de service personnalisé. La cliente peut retirer son
                consentement à tout moment.
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" disabled={pending}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog logger visite */}
      <Dialog open={openVisit} onOpenChange={setOpenVisit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Logger une visite — {activeClient?.full_name ?? "—"}
            </DialogTitle>
          </DialogHeader>
          <form ref={visitFormRef} action={onLogVisit} className="space-y-3">
            <input type="hidden" name="client_id" value={activeClient?.id ?? ""} />
            <input type="hidden" name="seller_id" value={myEmployeeId} />
            <div>
              <Label htmlFor="vv-kind">Type</Label>
              <Select name="kind" defaultValue="visit">
                <SelectTrigger id="vv-kind" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visit">Visite</SelectItem>
                  <SelectItem value="fitting">Essayage</SelectItem>
                  <SelectItem value="purchase">Achat</SelectItem>
                  <SelectItem value="return">Retour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vv-site">Boutique</Label>
              <Select
                name="site_id"
                defaultValue={activeClient?.preferred_site_id ?? ""}
              >
                <SelectTrigger id="vv-site" className="h-11">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vv-notes">Notes</Label>
              <Textarea
                id="vv-notes"
                name="notes"
                rows={3}
                placeholder="Ex. : a essayé le caftan rouge taille 38, attend une nouvelle livraison verte."
              />
            </div>
            <div>
              <Label htmlFor="vv-followup">Date de suivi (optionnel)</Label>
              <Input id="vv-followup" name="follow_up_date" type="date" className="h-11" />
              <p className="text-[11px] text-ink-3 mt-0.5">
                On te rappellera de la rappeler à cette date.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenVisit(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" disabled={pending}>
                Logger
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
