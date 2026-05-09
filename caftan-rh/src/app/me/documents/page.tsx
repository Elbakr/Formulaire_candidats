import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function MyDocumentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mes documents</h1>
        <p className="text-sm text-ink-2">CV et pièces jointes envoyés à l'équipe RH.</p>
      </div>
      <Card>
        <div className="p-10 text-center">
          <FileText className="h-10 w-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">Aucun document à afficher.</p>
        </div>
      </Card>
    </div>
  );
}
