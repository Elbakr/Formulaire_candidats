import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TemplatesEditor } from "./editor";

export type Template = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
};

export type TemplateItem = {
  id: string;
  template_id: string;
  position: number;
  label: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  responsible_role: string;
};

export default async function OnboardingTemplatesPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { data: tpls } = await supabase
    .from("onboarding_templates")
    .select("id, name, description, is_default, created_at")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  const templates = (tpls ?? []) as unknown as Template[];

  const tplIds = templates.map((t) => t.id);
  let items: TemplateItem[] = [];
  if (tplIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("onboarding_template_items")
      .select("id, template_id, position, label, description, category, is_required, responsible_role")
      .in("template_id", tplIds)
      .order("position");
    items = ((itemsData ?? []) as unknown as TemplateItem[]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Templates onboarding</h1>
        <p className="text-sm text-ink-2">
          Modèles de checklists appliqués automatiquement aux nouveaux employés. Le template par défaut est utilisé à la création d'un employé.
        </p>
      </div>
      <Card>
        <TemplatesEditor templates={templates} items={items} />
      </Card>
    </div>
  );
}
