"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (
    e: React.SubmitEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // A URL precisa estar liberada em Auth > URL Configuration no Supabase.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/definir-senha`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch {
      setError("Não foi possível enviar o e-mail. Tente de novo em alguns minutos.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <div className="glass">
          <CardHeader>
            <CardTitle className="text-[24px] text-white">Confira seu e-mail</CardTitle>
            <CardDescription>Instruções enviadas</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Se esse e-mail tiver acesso ao dashboard, você vai receber um link
              para criar uma nova senha.
            </p>
          </CardContent>
        </div>
      ) : (
        <div className="glass">
          <CardHeader>
            <CardTitle className="text-[24px] text-white">Recuperar senha</CardTitle>
            <CardDescription>
              Digite seu e-mail e enviaremos um link para criar uma nova senha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && <p className="text-[13px] text-accent-3">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Enviando..." : "Enviar link"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                <Link href="/login" className="underline underline-offset-4">
                  Voltar para o login
                </Link>
              </div>
            </form>
          </CardContent>
        </div>
      )}
    </div>
  );
}
