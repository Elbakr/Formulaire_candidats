import { Card } from "@/components/ui/card";
import { Sliders } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-ink-2">Configuration générale de l'organisation.</p>
      </div>
      <Card>
        <div className="p-10 text-center">
          <Sliders className="h-10 w-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">Paramétrage à venir : nom de l'entreprise, logo, signature email, fuseau horaire…</p>
        </div>
      </Card>
    </div>
  );
}
