"use client";

import { useState, useTransition } from "react";
import { Send, Plus, ShoppingBag, ClipboardList, Clock, Package, Wrench, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendMessageAction, sendRequestAction, type RequestKind } from "../actions";

type KindOption = {
  value: RequestKind;
  label: string;
  Icon: typeof ShoppingBag;
};

const KINDS: KindOption[] = [
  { value: "product",     label: "Demande produit",     Icon: ShoppingBag },
  { value: "work_item",   label: "Tâche / mission",     Icon: ClipboardList },
  { value: "time_change", label: "Changement horaire",  Icon: Clock },
  { value: "supplies",    label: "Matériel / stock",    Icon: Package },
  { value: "maintenance", label: "Maintenance / panne", Icon: Wrench },
  { value: "other",       label: "Autre demande",       Icon: MessageSquare },
];

export function Composer({ roomId }: { roomId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  // Dialog demande
  const [reqOpen, setReqOpen] = useState(false);
  const [reqKind, setReqKind] = useState<RequestKind>("other");
  const [reqTitle, setReqTitle] = useState("");
  const [reqBody, setReqBody] = useState("");
  const [reqQty, setReqQty] = useState<string>("");
  const [reqRef, setReqRef] = useState("");
  const [reqUrgency, setReqUrgency] = useState<"low" | "normal" | "urgent">("normal");

  function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    startTransition(async () => {
      const r = await sendMessageAction(roomId, text);
      if (r.error) {
        toast.error(r.error);
        setBody(text);
      }
    });
  }

  function openRequest(k: RequestKind) {
    setReqKind(k);
    setReqTitle("");
    setReqBody("");
    setReqQty("");
    setReqRef("");
    setReqUrgency("normal");
    setReqOpen(true);
  }

  function submitRequest() {
    const t = reqTitle.trim();
    if (!t) {
      toast.error("Indique un titre.");
      return;
    }
    startTransition(async () => {
      const r = await sendRequestAction({
        roomId,
        kind: reqKind,
        title: t,
        body: reqBody.trim() || undefined,
        externalRef: reqRef.trim() || undefined,
        quantity: reqQty ? Number(reqQty) || undefined : undefined,
        urgency: reqUrgency,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setReqOpen(false);
    });
  }

  return (
    <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-md border border-line bg-canvas hover:bg-surface-2 p-3 sm:p-2.5 inline-flex items-center justify-center text-ink-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 active:scale-95 transition-transform"
            aria-label="Nouvelle demande"
            title="Faire une demande"
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          {KINDS.map((k) => (
            <DropdownMenuItem
              key={k.value}
              onClick={() => openRequest(k.value)}
              className="gap-2"
            >
              <k.Icon className="h-3.5 w-3.5" /> {k.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Écris un message ou clique « + » pour faire une demande…"
        rows={1}
        className="flex-1 resize-none rounded-md border border-line bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 max-h-32"
        disabled={pending}
      />
      <button
        onClick={send}
        disabled={pending || !body.trim()}
        className="bg-gold text-[#1a1a0d] disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-md p-3 sm:p-2.5 inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 active:scale-95 transition-transform"
        aria-label="Envoyer"
      >
        <Send className="h-4 w-4" />
      </button>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {KINDS.find((k) => k.value === reqKind)?.label}
            </DialogTitle>
            <DialogDescription>
              La direction et les membres du groupe verront cette demande comme
              une carte dédiée. Statut traçable (ouvert / en cours / fait /
              refusé).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="req-title">
                Titre <span className="text-danger">*</span>
              </Label>
              <Input
                id="req-title"
                value={reqTitle}
                onChange={(e) => setReqTitle(e.target.value)}
                placeholder={
                  reqKind === "product"
                    ? "Caftan ivoire taille 38"
                    : reqKind === "supplies"
                      ? "Sacs boutique 30×40"
                      : "Résumé en une phrase"
                }
              />
            </div>
            <div>
              <Label htmlFor="req-body">Détails (optionnel)</Label>
              <textarea
                id="req-body"
                value={reqBody}
                onChange={(e) => setReqBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                placeholder="Précise le contexte, l'urgence, les variantes…"
              />
            </div>
            {reqKind === "product" || reqKind === "supplies" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="req-qty">Quantité</Label>
                  <Input
                    id="req-qty"
                    type="number"
                    min={1}
                    value={reqQty}
                    onChange={(e) => setReqQty(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="req-ref">Réf. produit / SKU</Label>
                  <Input
                    id="req-ref"
                    value={reqRef}
                    onChange={(e) => setReqRef(e.target.value)}
                    placeholder="(facultatif)"
                  />
                </div>
              </div>
            ) : null}
            <div>
              <Label>Urgence</Label>
              <div className="flex gap-1 mt-1">
                {(["low", "normal", "urgent"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setReqUrgency(u)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      reqUrgency === u
                        ? u === "urgent"
                          ? "bg-danger text-white border-danger"
                          : u === "normal"
                            ? "bg-gold text-[#1a1a0d] border-gold"
                            : "bg-surface-2 border-line"
                        : "border-line hover:bg-surface-2"
                    }`}
                  >
                    {u === "low" ? "Faible" : u === "urgent" ? "Urgent" : "Normal"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReqOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              onClick={submitRequest}
              disabled={pending || !reqTitle.trim()}
            >
              {pending ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
