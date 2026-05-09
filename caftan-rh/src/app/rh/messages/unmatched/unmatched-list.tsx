"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Paperclip, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { attachInboundAction } from "./actions";

type Candidate = {
  id: string;
  full_name: string;
  email: string;
  application_id: string | null;
};

type Inbound = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  snippet: string;
  received_at: string;
  received_at_label: string;
  attachment_count: number;
};

export function UnmatchedList({
  initialInbounds,
  candidates,
}: {
  initialInbounds: Inbound[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const inbound = initialInbounds.find((i) => i.id === openId);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 50);
    return candidates
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [search, candidates]);

  function attach(applicationId: string) {
    if (!openId) return;
    startTransition(async () => {
      const res = await attachInboundAction(openId, applicationId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Email rattaché au candidat.");
      setOpenId(null);
      setSearch("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-2">
        {initialInbounds.map((i) => (
          <Card key={i.id}>
            <div className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">
                    {i.from_name ?? i.from_email}
                  </span>
                  {i.from_name ? (
                    <span className="text-[11px] text-ink-3">&lt;{i.from_email}&gt;</span>
                  ) : null}
                  <span className="text-[11px] text-ink-3 ml-auto">{i.received_at_label}</span>
                </div>
                {i.subject ? (
                  <div className="text-xs font-semibold mt-0.5 truncate">{i.subject}</div>
                ) : null}
                <div className="text-xs text-ink-3 mt-0.5 line-clamp-2">{i.snippet || "(pas de contenu)"}</div>
                {i.attachment_count > 0 ? (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3">
                    <Paperclip className="h-3 w-3" />
                    {i.attachment_count} pièce{i.attachment_count > 1 ? "s" : ""} jointe{i.attachment_count > 1 ? "s" : ""}
                  </div>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setOpenId(i.id);
                }}
              >
                <Link2 className="h-3.5 w-3.5" /> Attribuer
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => (!o ? setOpenId(null) : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Attribuer à un candidat</DialogTitle>
            <DialogDescription>
              {inbound
                ? `Email de ${inbound.from_email} — choisis le candidat à qui rattacher.`
                : "Sélectionne un candidat."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3 space-y-3">
            <div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Recherche par nom ou email…"
                  className="pl-8"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto border border-line rounded-md divide-y divide-line">
              {filteredCandidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-3">Aucun candidat trouvé.</div>
              ) : (
                filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={pending || !c.application_id}
                    onClick={() => c.application_id && attach(c.application_id)}
                    className="w-full text-left p-2.5 hover:bg-surface-2 transition-colors flex items-center gap-2.5 disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs truncate">{c.full_name}</div>
                      <div className="text-[11px] text-ink-3 truncate">{c.email}</div>
                    </div>
                    <Link2 className="h-3.5 w-3.5 text-ink-3" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
