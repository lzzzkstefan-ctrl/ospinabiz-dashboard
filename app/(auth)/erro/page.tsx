import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <p className="text-sm text-muted-foreground">
      {params?.error ? `Erro: ${params.error}` : "Ocorreu um erro inesperado."}
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="glass">
          <CardHeader>
            <CardTitle className="text-[24px] text-white">Algo deu errado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
            <p className="text-sm text-muted-foreground">
              Se o link do e-mail expirou, peça um novo convite ao admin.
            </p>
            <Link href="/login" className="text-sm underline underline-offset-4">
              Voltar para o login
            </Link>
          </CardContent>
        </div>
      </div>
    </div>
  );
}
