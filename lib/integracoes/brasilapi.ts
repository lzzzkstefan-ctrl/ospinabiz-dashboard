// BrasilAPI: feriados nacionais de um ano (https://brasilapi.com.br/api/feriados/v1/{ano}).
// Pública, sem chave. Sem regra de negócio aqui: só buscar.

export type FeriadoBrasilAPI = { date: string; name: string; type: string };

export async function buscarFeriadosNacionais(ano: number): Promise<FeriadoBrasilAPI[]> {
  const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`BrasilAPI feriados ${ano}: HTTP ${r.status}`);
  const lista = (await r.json()) as FeriadoBrasilAPI[];
  return lista.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.name);
}
