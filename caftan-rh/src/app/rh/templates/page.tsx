import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TemplatesEditor } from "./editor";

export default async function TemplatesPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_templates")
    .select("slug, label, subject, body_html, needs_dates, needs_times, category, is_active")
    .order("label");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Templates emails</h1>
        <p className="text-sm text-ink-2">
          {(data ?? []).length} templates disponibles. Variables : <code>{"{{firstname}}"}</code>, <code>{"{{fullname}}"}</code>, <code>{"{{org_name}}"}</code>, <code>{"{{org_email}}"}</code>, <code>{"{{org_phone}}"}</code>, <code>{"{{org_whatsapp}}"}</code>, <code>{"{{org_address}}"}</code>, <code>{"{{custom}}"}</code>, <code>{"{{dates}}"}</code>, <code>{"{{times}}"}</code>.
        </p>
      </div>
      <Card>
        <TemplatesEditor templates={(data ?? []) as never} />
      </Card>
    </div>
  );
}
