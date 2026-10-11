// Leitura das melhorias com o login de quem vê: o RLS só mostra a chefe e gerente.

import { createClient } from "@/lib/supabase/server";
import { ehPrioridade, ehStatus, ordenar, type Melhoria } from "./regras";

export async function listarMelhorias(): Promise<Melhoria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("melhorias")
    .select("id, titulo, descricao, status, prioridade, aba, sugerido_nome, feito_em, novidade, criado_em")
    .limit(2000);
  if (error) throw new Error(`Erro ao carregar melhorias: ${error.message}`);
  return ordenar(
    data.map((m) => ({
      id: Number(m.id),
      titulo: String(m.titulo),
      descricao: m.descricao,
      status: ehStatus(m.status) ? m.status : "ideia",
      prioridade: ehPrioridade(m.prioridade) ? m.prioridade : "media",
      aba: m.aba,
      sugeridoNome: m.sugerido_nome,
      feitoEm: m.feito_em ? String(m.feito_em) : null,
      novidade: m.novidade,
      criadoEm: String(m.criado_em),
    })),
  );
}
