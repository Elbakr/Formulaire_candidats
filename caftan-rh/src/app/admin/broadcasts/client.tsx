"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { Megaphone, Plus, Send, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  sendBroadcastAction,
  deleteBroadcastAction,
  markBroadcastEmailSentAction,
  type BroadcastAudienceKind,
  type BroadcastPriority,
  type BroadcastEmailPayload,
} from "./actions";
import { formatDate } from "@/lib/utils";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

let emailjsInitialized = false;
function ensureEmailJSInit() {
  if (emailjsInitialized || !PUBLIC_KEY) return emailjsInitialized;
  try {
    emailjs.init({ publicKey: PUBLIC_KEY });
    emailjsInitialized = true;
  } catch (e) {
    console.warn("EmailJS init failed:", e);
  }
  return emailjsInitialized;
}

const EMAILJS_CONFIGURED = !!SERVICE_ID && !!TEMPLATE_ID && !!PUBLIC_KEY;

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Envoie les emails broadcast côté browser via EmailJS.
 * Rate limit 1/sec pour éviter les blocages côté plan gratuit.
 * Retourne { sent, failures }.
 */
async function sendBroadcastEmailsBrowser(
  payload: BroadcastEmailPayload,
  onProgress: (done: number, total: number) => void,
): Promise<{ sent: number; failures: Array<{ to: string; error: string }> }> {
  ensureEmailJSInit();
  const total = payload.recipients.length;
  let sent = 0;
  const failures: Array<{ to: string; error: string }> = [];

  for (let i = 0; i < total; i++) {
    const r = payload.recipients[i];
    try {
      await emailjs.send(
        SERVICE_ID!,
        TEMPLATE_ID!,
        {
          to_email: r.email,
          to_name: r.name,
          from_name: FROM_NAME,
          reply_to: REPLY_TO,
          subject: payload.subject,
          message: payload.body,
        },
        { publicKey: PUBLIC_KEY! },
      );
      sent += 1;
    } catch (e) {
      const err =
        (e as { text?: string; message?: string })?.text ??
        (e as Error)?.message ??
        "EmailJS error";
      failures.push({ to: r.email, error: err });
    }
    onProgress(i + 1, total);
    // Rate-limit : ne pas sprinter si EmailJS est en plan gratuit.
    if (i < total - 1) await sleep(1000);
  }

  return { sent, failures };
}

type Site = { id: string; code: string; name: string; color: string | null };
type Broadcast = {
  id: string;
  title: string;
  body: string;
  audience_kind: string;
  audience_site_ids: string[] | null;
  priority: string;
  send_chat: boolean;
  send_email: boolean;
  send_whatsapp: boolean;
  sent_at: string | null;
  created_at: string;
};

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

const PRIORITY_STYLES: Record<string, string> = {
  normal: "bg-info-light text-info border-info",
  important: "bg-warn-light text-warn border-warn",
  urgent: "bg-danger-light text-danger border-danger",
};

const AUDIENCE_LABELS: Record<string, string> = {
  all_sites: "Tous les magasins",
  specific_sites: "Sites spécifiques",
  role_managers: "Tous les managers",
  role_employees: "Tous les employés",
};

export function BroadcastsClient({
  broadcasts,
  sites,
}: {
  broadcasts: Broadcast[];
  sites: Site[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceKind, setAudienceKind] = useState<BroadcastAudienceKind>("all_sites");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<BroadcastPriority>("normal");
  const [sendChat, setSendChat] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);

  function reset() {
    setTitle("");
    setBody("");
    setAudienceKind("all_sites");
    setSiteIds([]);
    setPriority("normal");
    setSendChat(true);
    setSendEmail(false);
    setSendWhatsapp(false);
  }

  function toggleSite(id: string) {
    setSiteIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function submit() {
    startTransition(async () => {
      const r = await sendBroadcastAction({
        title,
        body,
        audienceKind,
        audienceSiteIds: siteIds,
        priority,
        sendChat,
        sendEmail,
        sendWhatsapp,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Annonce enregistrée ; toaster les retours informatifs côté server.
      const parts: string[] = ["Annonce enregistrée."];
      if (r.chatRoomsPosted) parts.push(`${r.chatRoomsPosted} chat(s) posté(s)`);
      toast.success(parts.join(" — "));
      if (r.warning) toast.message(r.warning, { duration: 8000 });

      // Email broadcast : envoi côté browser via EmailJS.
      if (sendEmail && r.emailPayload && r.emailPayload.recipients.length > 0) {
        if (!EMAILJS_CONFIGURED) {
          toast.error(
            "EmailJS non configuré (NEXT_PUBLIC_EMAILJS_*). Les destinataires ont été collectés mais aucun email n'a pu être envoyé.",
            { duration: 9000 },
          );
        } else {
          const total = r.emailPayload.recipients.length;
          const tid = toast.loading(`Envoi 0/${total}…`, { duration: Infinity });
          try {
            const { sent, failures } = await sendBroadcastEmailsBrowser(
              r.emailPayload,
              (done, tot) => {
                toast.loading(`Envoi ${done}/${tot}…`, { id: tid, duration: Infinity });
              },
            );
            toast.dismiss(tid);
            if (sent > 0) {
              toast.success(
                `${sent}/${total} email(s) envoyé(s).` +
                  (failures.length > 0 ? ` ${failures.length} échec(s).` : ""),
                { duration: 6000 },
              );
            }
            if (failures.length > 0) {
              console.warn("Broadcast email failures:", failures);
              toast.error(
                `Échecs : ${failures
                  .slice(0, 3)
                  .map((f) => `${f.to} (${f.error})`)
                  .join(" · ")}` + (failures.length > 3 ? ` (+${failures.length - 3})` : ""),
                { duration: 9000 },
              );
            }
            if (r.broadcastId) {
              const mark = await markBroadcastEmailSentAction(r.broadcastId, sent);
              if (mark.error) console.warn("markBroadcastEmailSent:", mark.error);
            }
          } catch (e) {
            toast.dismiss(tid);
            const msg = (e as Error)?.message ?? "Erreur EmailJS";
            toast.error(`Envoi interrompu : ${msg}`, { duration: 9000 });
          }
        }
      } else if (sendEmail && r.emailRecipients === 0) {
        toast.message("Aucun destinataire email trouvé pour cette audience.", {
          duration: 6000,
        });
      }

      setOpen(false);
      reset();
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Supprimer cette annonce ?")) return;
    startTransition(async () => {
      const r = await deleteBroadcastAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Annonce supprimée.");
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nouvelle annonce
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b border-line">
          <h2 className="font-bold text-sm">Annonces envoyées</h2>
        </div>
        {broadcasts.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">Aucune annonce envoyée pour le moment.</p>
            <p className="text-xs mt-1 max-w-sm mx-auto">
              Diffuse une information à tous les magasins ou à un sous-ensemble
              (chat, email).
            </p>
            <Button
              variant="gold"
              size="sm"
              className="mt-3"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Créer ma première annonce
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {broadcasts.map((b) => {
              const audienceLabel =
                b.audience_kind === "specific_sites" && b.audience_site_ids
                  ? `Sites : ${b.audience_site_ids
                      .map((id) => sites.find((s) => s.id === id)?.code ?? "?")
                      .join(", ")}`
                  : AUDIENCE_LABELS[b.audience_kind] ?? b.audience_kind;
              return (
                <div key={b.id} className="p-4 flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[b.priority] ?? PRIORITY_STYLES.normal}`}
                      >
                        {PRIORITY_LABELS[b.priority] ?? b.priority}
                      </span>
                      <h3 className="font-bold text-sm">{b.title}</h3>
                    </div>
                    <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap line-clamp-3">
                      {b.body}
                    </p>
                    <div className="text-[11px] text-ink-3 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{audienceLabel}</span>
                      <span>•</span>
                      <span>
                        Canaux :
                        {b.send_chat ? " Chat" : ""}
                        {b.send_email ? " · Email" : ""}
                        {b.send_whatsapp ? " · WhatsApp" : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {b.sent_at
                          ? `Envoyée ${formatDate(b.sent_at)}`
                          : `Brouillon (${formatDate(b.created_at)})`}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(b.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle annonce</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            <div>
              <Label htmlFor="bc_title">Titre</Label>
              <Input
                id="bc_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Nouvelle collection — accueil clients"
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="bc_body">Message</Label>
              <Textarea
                id="bc_body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Contenu de l'annonce…"
                maxLength={8000}
              />
            </div>

            <div>
              <Label>Audience</Label>
              <div className="grid sm:grid-cols-2 gap-2 mt-1">
                {(
                  [
                    "all_sites",
                    "specific_sites",
                    "role_managers",
                    "role_employees",
                  ] as BroadcastAudienceKind[]
                ).map((k) => (
                  <label
                    key={k}
                    className={`flex items-center gap-2 rounded-md border-[1.5px] px-3 py-2 text-sm cursor-pointer ${
                      audienceKind === k
                        ? "border-gold bg-gold-light text-gold-dark font-bold"
                        : "border-line hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="radio"
                      className="accent-gold"
                      checked={audienceKind === k}
                      onChange={() => setAudienceKind(k)}
                    />
                    {AUDIENCE_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>

            {audienceKind === "specific_sites" ? (
              <div>
                <Label>Sites concernés</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {sites.map((s) => {
                    const checked = siteIds.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleSite(s.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border-[1.5px] transition-colors ${
                          checked
                            ? "border-gold bg-gold-light text-gold-dark font-bold"
                            : "border-line text-ink-2 hover:bg-surface-2"
                        }`}
                      >
                        {s.code} · {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <Label>Priorité</Label>
              <div className="flex gap-1.5 mt-1">
                {(["normal", "important", "urgent"] as BroadcastPriority[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`text-xs px-3 py-1 rounded-full border-[1.5px] transition-colors ${
                      priority === p
                        ? `${PRIORITY_STYLES[p]} font-bold`
                        : "border-line text-ink-2 hover:bg-surface-2"
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Canaux</Label>
              <div className="flex flex-wrap gap-3 mt-1 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-gold"
                    checked={sendChat}
                    onChange={(e) => setSendChat(e.target.checked)}
                  />
                  Chat (recommandé)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-gold"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  Email
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-gold"
                    checked={sendWhatsapp}
                    onChange={(e) => setSendWhatsapp(e.target.checked)}
                  />
                  WhatsApp
                </label>
              </div>
              {sendWhatsapp ? (
                <p className="text-[11px] text-warn mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  V1 : WhatsApp broadcast non encore activé (compliance opt-in/window 24h).
                  L'annonce est tout de même tracée.
                </p>
              ) : null}
              {sendEmail ? (
                <p className="text-[11px] text-ink-3 mt-1.5">
                  L&apos;envoi email se fait côté navigateur via EmailJS (rate-limité à
                  1 email/seconde). Laisse l&apos;onglet ouvert jusqu&apos;à la fin de la
                  diffusion.
                  {!EMAILJS_CONFIGURED ? (
                    <span className="block text-danger mt-0.5">
                      ⚠ EmailJS non configuré dans .env.local — les destinataires seront
                      collectés mais aucun email ne partira.
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="gold" onClick={submit} disabled={pending}>
              <Send className="h-4 w-4" /> {pending ? "Envoi…" : "Envoyer l'annonce"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
