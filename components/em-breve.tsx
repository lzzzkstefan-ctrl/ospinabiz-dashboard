import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Em breve</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </CardContent>
      </Card>
    </div>
  );
}
