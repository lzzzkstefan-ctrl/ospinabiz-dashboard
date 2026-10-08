// Leitura do monitor: números em operação, último teste e resultados.
// Usa o cliente do usuário logado (o RLS libera leitura para quem está logado).

import { createClient } from "@/lib/supabase/server";
import type { NumeroMonitorado, ResultadoNumero, Teste } from "./tipos";

export type DadosMonitor = {
  numeros: NumeroMonitorado[];
  testeAberto: Teste | null;
  ultimoFechado: Teste | null;
  resultados: ResultadoNumero[];
};

export async function carregarMonitor(): Promise<DadosMonitor> {
  const supabase = await createClient();

  const [numeros, aberto, fechado] = await Promise.all([
    // em operação = situação "operacao", número ativo e BM ativa
    supabase
      .from("monitor_numeros")
      .select("id, final, telefone, bm:monitor_bms!inner(id, nome, ativo)")
      .eq("situacao", "operacao")
      .eq("ativo", true)
      .eq("bm.ativo", true),
    supabase
      .from("monitor_testes")
      .select("id, iniciado_em, situacao")
      .neq("situacao", "fechado")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("monitor_testes")
      .select("id, iniciado_em, situacao")
      .eq("situacao", "fechado")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (numeros.error) throw new Error(`Erro ao carregar os números: ${numeros.error.message}`);
  if (aberto.error) throw new Error(`Erro ao carregar os testes: ${aberto.error.message}`);
  if (fechado.error) throw new Error(`Erro ao carregar os testes: ${fechado.error.message}`);

  const testeAberto = aberto.data as Teste | null;
  const ultimoFechado = fechado.data as Teste | null;
  const idsTestes = [testeAberto?.id, ultimoFechado?.id].filter((id): id is number => id !== undefined);

  let resultados: ResultadoNumero[] = [];
  if (idsTestes.length > 0) {
    const { data, error } = await supabase
      .from("monitor_resultados")
      .select("numero_id, teste_id, status_meta, resultado")
      .in("teste_id", idsTestes);
    if (error) throw new Error(`Erro ao carregar os resultados: ${error.message}`);
    resultados = data as ResultadoNumero[];
  }

  type NumeroBruto = { id: number; final: string; telefone: string | null; bm: { id: number; nome: string } };
  return {
    numeros: (numeros.data as unknown as NumeroBruto[]).map(({ id, final, telefone, bm }) => ({
      id,
      final,
      telefone,
      bm: { id: bm.id, nome: bm.nome },
    })),
    testeAberto,
    ultimoFechado,
    resultados,
  };
}
