"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, X, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendManualMailAction, uploadMailAttachmentAction } from "./actions";

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
}

interface Attachment {
  name: string;
  url: string;
  size?: number;
  storage_path?: string;
}

export function ComposeMailForm({
  employees,
  preselectEmployeeId,
}: {
  employees: Employee[];
  preselectEmployeeId: string | null;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState<string>(preselectEmployeeId ?? "");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  const filteredEmployees = search
    ? employees.filter(
        (e) =>
          e.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (e.email ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : employees;

  function selectEmployee(emp: Employee) {
    setEmployeeId(emp.id);
    setRecipientEmail(emp.email ?? "");
    setSearch(emp.full_name);
  }

  async function handleFileChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadMailAttachmentAction(fd);
      if (res.ok) {
        setAttachments((p) => [...p, { name: file.name, url: res.url!, size: file.size, storage_path: res.storage_path }]);
      } else {
        toast.error(`Upload ${file.name} : ${res.error}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSend() {
    if (!recipientEmail) {
      toast.error("Destinataire requis");
      return;
    }
    if (!subject) {
      toast.error("Sujet requis");
      return;
    }
    if (!body) {
      toast.error("Corps du mail requis");
      return;
    }
    startTransition(async () => {
      const res = await sendManualMailAction({
        recipient_email: recipientEmail,
        recipient_name: employees.find((e) => e.id === employeeId)?.full_name ?? null,
        employee_id: employeeId || null,
        subject,
        body,
        attachments,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Erreur envoi");
        return;
      }
      toast.success("Mail envoyé + archivé");
      router.push("/rh/mails");
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <Label>Destinataire (employé)</Label>
        <Input
          placeholder="Chercher un employé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && !employeeId && (
          <div className="border border-line rounded mt-1 max-h-48 overflow-y-auto">
            {filteredEmployees.slice(0, 10).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => selectEmployee(e)}
                className="w-full text-left p-2 hover:bg-muted/30 text-sm flex justify-between"
              >
                <span>{e.full_name}</span>
                <span className="text-xs text-ink-3 font-mono">{e.email ?? "-"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Email destinataire</Label>
        <Input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="ex: prenom.nom@example.com"
        />
        <p className="text-[10px] text-ink-3 mt-0.5">
          Pré-rempli depuis l&apos;employé sélectionné. Modifiable pour envoyer à une adresse externe (comptable, etc.)
        </p>
      </div>

      <div>
        <Label>Sujet</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div>
        <Label>Corps du mail</Label>
        <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" />
      </div>

      <div>
        <Label>Pièces jointes</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={(e) => handleFileChange(e.target.files)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Paperclip className="w-3.5 h-3.5 mr-1" />}
            {uploading ? "Upload..." : "Ajouter fichier"}
          </Button>
          {attachments.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-800 border border-blue-200"
            >
              <Paperclip className="w-3 h-3" />
              {a.name}
              <button
                type="button"
                onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))}
                className="hover:bg-blue-200 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button variant="outline" onClick={() => router.push("/rh/mails")}>
          Annuler
        </Button>
        <Button
          disabled={pending || !recipientEmail || !subject || !body}
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {pending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Envoyer
        </Button>
      </div>
    </Card>
  );
}
