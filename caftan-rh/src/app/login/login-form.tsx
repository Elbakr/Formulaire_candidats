"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { loginAction } from "./actions";
import { toast } from "sonner";

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="p-6">
        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await loginAction(fd);
              if (res?.error) {
                setError(res.error);
                toast.error(res.error);
              }
            });
          }}
          className="space-y-3"
        >
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error ? <p className="text-xs text-danger font-semibold">{error}</p> : null}
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
            {pending ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
