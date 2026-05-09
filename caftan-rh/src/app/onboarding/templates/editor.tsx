"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  saveTemplateAction,
  deleteTemplateAction,
  saveTemplateItemAction,
  deleteTemplateItemAction,
  moveTemplateItemAction,
} from "../actions";
import type { Template, TemplateItem } from "./page";

const CATEGORY_LABELS: Record<string, string> = {
  admin: "Admin", tools: "Outils", training: "Formation", legal: "Légal",
};
const ROLE_LABELS: Record<string, string> = {
  rh: "RH", manager: "Manager", employee: "Employé",
};

export function TemplatesEditor({
  templates,
  items,
}: {
  templates: Template[];
  items: TemplateItem[];
}) {
  const [activeId, setActiveId] = useState<string | null>(templates[0]?.id ?? null);

  const itemsByTpl: Record<string, TemplateItem[]> = {};
  for (const it of items) {
    if (!itemsByTpl[it.template_id]) itemsByTpl[it.template_id] = [];
    itemsByTpl[it.template_id].push(it);
  }

  if (templates.length === 0) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-center text-sm text-ink-3 mb-3">Aucun template. Crée le premier.</div>
        <div className="flex justify-center">
          <NewTemplateDialog />
        </div>
      </div>
    );
  }

  return (
    <Tabs value={activeId ?? templates[0].id} onValueChange={setActiveId}>
      <div className="px-4 pt-4 flex items-center justify-between gap-3 flex-wrap">
        <TabsList className="flex-wrap h-auto">
          {templates.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1">
              {t.is_default ? <Star className="h-3 w-3 fill-gold text-gold" /> : null}
              {t.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <NewTemplateDialog />
      </div>
      {templates.map((t) => (
        <TabsContent key={t.id} value={t.id} className="p-4">
          <TemplateBlock template={t} items={itemsByTpl[t.id] ?? []} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TemplateBlock({ template, items }: { template: Template; items: TemplateItem[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    if (!confirm(`Supprimer le template "${template.name}" et ses items ?`)) return;
    startTransition(async () => {
      const r = await deleteTemplateAction(template.id);
      if (r?.error) toast.error(r.error);
      else { toast.success("Template supprimé."); router.refresh(); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            {template.name}
            {template.is_default ? <Badge variant="gold">Par défaut</Badge> : null}
          </h2>
          {template.description ? (
            <p className="text-sm text-ink-3">{template.description}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <EditTemplateDialog template={template} />
          <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3 border border-dashed border-line rounded-md">
            Aucun item.
          </div>
        ) : (
          items.map((it, idx) => (
            <ItemRow
              key={it.id}
              item={it}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
            />
          ))
        )}
      </div>

      <NewItemDialog templateId={template.id} />
    </div>
  );
}

function ItemRow({ item, isFirst, isLast }: { item: TemplateItem; isFirst: boolean; isLast: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const r = await moveTemplateItemAction(item.id, direction);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Supprimer l'item "${item.label}" ?`)) return;
    startTransition(async () => {
      const r = await deleteTemplateItemAction(item.id);
      if (r?.error) toast.error(r.error);
      else { toast.success("Item supprimé."); router.refresh(); }
    });
  }

  return (
    <div className="flex items-center gap-2 p-2.5 border border-line rounded-md bg-surface">
      <span className="text-[11px] font-mono text-ink-3 w-6 text-center shrink-0">#{item.position}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{item.label}</span>
          <Badge variant="muted" className="text-[9px]">
            {CATEGORY_LABELS[item.category ?? "admin"] ?? item.category}
          </Badge>
          <Badge variant="muted" className="text-[9px]">{ROLE_LABELS[item.responsible_role] ?? item.responsible_role}</Badge>
          {item.is_required ? (
            <Badge variant="gold" className="text-[9px]">Requis</Badge>
          ) : null}
        </div>
        {item.description ? <p className="text-xs text-ink-3 mt-0.5">{item.description}</p> : null}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => move("up")} disabled={pending || isFirst} aria-label="Monter">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => move("down")} disabled={pending || isLast} aria-label="Descendre">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <EditItemDialog item={item} />
        <Button variant="ghost" size="icon" onClick={remove} disabled={pending} aria-label="Supprimer">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function NewTemplateDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold" size="sm">
          <Plus className="h-3.5 w-3.5" /> Nouveau template
        </Button>
      </DialogTrigger>
      <TemplateDialogContent close={() => setOpen(false)} />
    </Dialog>
  );
}

function EditTemplateDialog({ template }: { template: Template }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit3 className="h-3.5 w-3.5" /> Éditer
        </Button>
      </DialogTrigger>
      <TemplateDialogContent template={template} close={() => setOpen(false)} />
    </Dialog>
  );
}

function TemplateDialogContent({ template, close }: { template?: Template; close: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    if (template?.id) fd.set("id", template.id);
    fd.set("is_default", fd.get("is_default") === "on" ? "true" : "false");
    startTransition(async () => {
      const r = await saveTemplateAction(fd);
      if (r?.error) toast.error(r.error);
      else { toast.success("Template enregistré."); close(); router.refresh(); }
    });
  }

  return (
    <DialogContent className="max-w-[560px]">
      <DialogHeader>
        <DialogTitle>{template ? "Éditer le template" : "Nouveau template"}</DialogTitle>
      </DialogHeader>
      <form action={submit} className="p-5 space-y-3">
        <div>
          <Label htmlFor="name">Nom *</Label>
          <Input id="name" name="name" required defaultValue={template?.name ?? ""} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={template?.description ?? ""} />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="is_default"
            name="is_default"
            type="checkbox"
            defaultChecked={template?.is_default}
            className="h-4 w-4 accent-gold"
          />
          <Label htmlFor="is_default" className="!mb-0">Définir comme template par défaut (utilisé à la création d'un employé)</Label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Annuler</Button>
          </DialogClose>
          <Button type="submit" variant="gold" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function NewItemDialog({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" /> Ajouter un item
        </Button>
      </DialogTrigger>
      <ItemDialogContent templateId={templateId} close={() => setOpen(false)} />
    </Dialog>
  );
}

function EditItemDialog({ item }: { item: TemplateItem }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Éditer">
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <ItemDialogContent item={item} templateId={item.template_id} close={() => setOpen(false)} />
    </Dialog>
  );
}

function ItemDialogContent({ templateId, item, close }: { templateId: string; item?: TemplateItem; close: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    fd.set("template_id", templateId);
    if (item?.id) fd.set("id", item.id);
    startTransition(async () => {
      const r = await saveTemplateItemAction(fd);
      if (r?.error) toast.error(r.error);
      else { toast.success("Item enregistré."); close(); router.refresh(); }
    });
  }

  return (
    <DialogContent className="max-w-[560px]">
      <DialogHeader>
        <DialogTitle>{item ? "Éditer l'item" : "Nouvel item"}</DialogTitle>
      </DialogHeader>
      <form action={submit} className="p-5 space-y-3">
        <div>
          <Label htmlFor="label">Libellé *</Label>
          <Input id="label" name="label" required defaultValue={item?.label ?? ""} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={item?.description ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Catégorie</Label>
            <Select name="category" defaultValue={item?.category ?? "admin"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="tools">Outils</SelectItem>
                <SelectItem value="training">Formation</SelectItem>
                <SelectItem value="legal">Légal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Responsable</Label>
            <Select name="responsible_role" defaultValue={item?.responsible_role ?? "rh"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rh">RH</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="employee">Employé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Obligatoire ?</Label>
            <Select name="is_required" defaultValue={item?.is_required === false ? "false" : "true"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Requis</SelectItem>
                <SelectItem value="false">Optionnel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="position">Position</Label>
            <Input id="position" name="position" type="number" defaultValue={item ? String(item.position) : ""} placeholder="auto" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Annuler</Button>
          </DialogClose>
          <Button type="submit" variant="gold" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
