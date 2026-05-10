// Minimal layout for print pages — no AppShell, just role gating and a
// container styled for A4. Opens in `_blank` and the browser is expected
// to trigger Cmd/Ctrl+P.

import { requireRole } from "@/lib/auth";

export default async function Profile360PrintLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["admin", "rh", "manager"]);
  return (
    <main className="min-h-screen bg-canvas text-ink p-6 print:p-0">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  );
}
