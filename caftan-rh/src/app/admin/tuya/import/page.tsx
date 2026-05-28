import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImportForm } from "./import-form";

// Page d import CSV de pointages manuels — voir actions.ts pour la justif.
// Permet a admin/rh de rattraper les jours ou Tuya a purge les events
// (avant ~18/05/2026 dans le cas Karim).

export default async function AdminTuyaImportPage() {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: sitesRaw }, { data: empCountRow }] = await Promise.all([
    supabase.from("sites").select("id, code, name").order("code"),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const sites = (sitesRaw ?? []) as { id: string; code: string; name: string }[];
  void empCountRow;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-gold-dark" />
            Importer pointages manuels
          </h1>
          <p className="text-sm text-ink-2 max-w-3xl">
            Pour les jours où Tuya a purgé les events (ex avant 18/05/2026), tu peux
            importer manuellement via CSV. Chaque ligne crée 1 entry IN
            (+ 1 entry OUT si <code>out_time</code> est fourni) avec
            <code> source=manual_admin</code>. Le rattachement au shift se fait
            ensuite automatiquement par la page Prestations (matching par proximité).
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/logs">Logs</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/users">Empreintes</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tuya/devices">Terminaux</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour admin
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Format CSV attendu</h2>
          <p className="text-[12px] text-ink-3 mt-1">
            Une ligne par pointage. La première ligne d&apos;en-tête est optionnelle.
            Séparateur : <code>,</code> ou <code>;</code>. Les heures sont interprétées
            en timezone <strong>Europe/Brussels</strong>.
          </p>
          <pre className="mt-2 text-[11px] bg-ink-0/5 border border-line rounded p-2 overflow-x-auto">
{`employee_full_name,date,in_time,out_time,site_code
Keltoum El Mrabet,2026-05-01,07:45,17:30,A
Selma Maïssa,2026-05-01,08:00,17:00,E`}
          </pre>
          <p className="text-[11px] text-ink-3 mt-2">
            Codes site disponibles :{" "}
            <code>{sites.map((s) => s.code).join(", ") || "—"}</code>.
            Si <code>out_time</code> est vide, seule l&apos;entrée IN est créée.
          </p>
        </div>
      </Card>

      <ImportForm />
    </div>
  );
}
