"use client";

import { useState, useTransition } from "react";
import { Inbox, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { triggerImapPayslipsSyncAction } from "./actions";

interface PollResult {
  ok: boolean;
  fetched?: number;
  matched?: number;
  processed?: number;
  pdfs_total?: number;
  payslips_inserted?: number;
  payslips_matched_employee?: number;
  payslips_orphan?: number;
  errors?: Array<{ uid?: number; subject?: string; error: string }>;
  details?: Array<{ uid: number; subject: string; from: string; employer: string | null; pdf_count: number; inserted: number; matched: number; orphan: number }>;
  error?: string;
}

export function ImapSyncButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PollResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await triggerImapPayslipsSyncAction();
      setResult(res);
      if (res.ok) {
        const inserted = res.payslips_inserted ?? 0;
        const matched = res.payslips_matched_employee ?? 0;
        if (inserted > 0) {
          toast.success(`✓ Sync IMAP : ${inserted} fiche(s) importée(s), ${matched} matchée(s) à un employé`);
        } else {
          toast.info("Sync IMAP terminé : aucune nouvelle fiche à importer");
        }
      } else {
        toast.error(res.error ?? "Sync KO");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); run(); }}>
        <Inbox className="h-3.5 w-3.5" /> Sync IMAP fiches paie
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync auto fiches de paie depuis hr@caftanfactory.com</DialogTitle>
            <DialogDescription>
              Filtre les mails reçus avec sujet contenant &quot;fiche/feuille de paie&quot; (FR/NL),
              extrait les PDFs, détecte l&apos;employeur (HR Consult→AMD, Partena→Caftan),
              et importe via le même flow que le drop manuel. Les mails traités sont
              déplacés vers le label Gmail &quot;CaftanRH-Processed&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {pending && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion IMAP + analyse des mails non lus (90 derniers jours)...
              </div>
            )}

            {!pending && result && !result.ok && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-red-900">Erreur</div>
                  <div className="text-red-800 text-xs mt-1">{result.error}</div>
                  {result.error?.includes("GMAIL_USER") && (
                    <div className="text-xs mt-2 bg-white p-2 rounded">
                      <strong>Setup nécessaire</strong> : génère un App Password Google sur
                      <code className="bg-muted px-1 mx-1">hr@caftanfactory.com</code> via
                      <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-blue-700 underline ml-1">myaccount.google.com/apppasswords</a> (2FA active obligatoire).
                      <br/>Puis dans <code className="bg-muted px-1">.env.local</code> :
                      <pre className="bg-muted/50 p-1 mt-1 text-[10px]">GMAIL_USER=hr@caftanfactory.com{"\n"}GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx</pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!pending && result?.ok && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <Stat label="Mails analysés" value={result.fetched ?? 0} />
                  <Stat label="Mails matchés" value={result.matched ?? 0} color="text-blue-700" />
                  <Stat label="Fiches importées" value={result.payslips_inserted ?? 0} color="text-green-700" />
                  <Stat label="Matchées employé" value={result.payslips_matched_employee ?? 0} color="text-green-700" />
                </div>

                {(result.payslips_orphan ?? 0) > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                    <span><strong>{result.payslips_orphan}</strong> fiche(s) sans employé associé (orphelines). À matcher manuellement.</span>
                  </div>
                )}

                {result.details && result.details.length > 0 && (
                  <div className="border border-line rounded">
                    <div className="bg-muted/30 p-2 text-[11px] font-semibold border-b">
                      Détail des mails traités ({result.details.length})
                    </div>
                    <div className="divide-y text-xs max-h-60 overflow-y-auto">
                      {result.details.map((d) => (
                        <div key={d.uid} className="p-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            <span className="font-medium truncate flex-1">{d.subject}</span>
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{d.employer ?? "?"}</span>
                          </div>
                          <div className="text-[10px] text-ink-3 pl-5">
                            De : {d.from} · {d.pdf_count} PDF · {d.matched} matchée(s), {d.orphan} orphelin(s)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.errors && result.errors.length > 0 && (
                  <div className="border border-red-200 rounded">
                    <div className="bg-red-50 p-2 text-[11px] font-semibold border-b text-red-900">
                      Erreurs ({result.errors.length})
                    </div>
                    <div className="divide-y text-xs max-h-40 overflow-y-auto">
                      {result.errors.map((e, i) => (
                        <div key={i} className="p-2 text-[11px]">
                          {e.subject && <div className="font-medium">{e.subject}</div>}
                          <div className="text-red-700 italic">{e.error}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
            <Button variant="gold" onClick={run} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Relancer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-muted/30 rounded p-2">
      <div className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-ink-3 mt-0.5">{label}</div>
    </div>
  );
}
