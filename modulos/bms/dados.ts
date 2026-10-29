// Leitura e gravação das BMs, números monitorados e equipe (tabelas monitor_bms,
// monitor_numeros e equipe). Usa o cliente do usuário logado: o RLS do banco
// garante que só admin grava; aqui só traduzimos o resultado.

import { numerosDaWaba } from "@/lib/integracoes/meta";
import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia, mensagemDoErro, type Bm, type CamposNumero, type Numero, type Pessoa, type Qualidade } from "./regras";
import { compararTeste, INICIO_DO_CUSTO, limiteDoTier, qualidadeDaMeta, somarDias, type Comparacao, type CustoDia, type FonteMeta, type LeadComparacao } from "./saude";

export type Resultado = { erro?: string };

export async function listarBms(): Promise<Bm[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monitor_bms")
    .select(
      "id, nome, acesso_admin, ativo, banida_em, ban_motivo, numeros:monitor_numeros(id, bm_id, final, telefone, apelido, limite, situacao, banido_em, ativo, principal, ddd, em_operacao_desde, qualidade, observacao, responsavel:equipe(id, nome))",
    )
    .order("nome");

  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);

  return (data as unknown as Bm[]).map((bm) => ({
    ...bm,
    numeros: [...bm.numeros].sort((a, b) => a.final.localeCompare(b.final)),
  }));
}

export async function listarEquipe(): Promise<Pessoa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipe").select("id, nome").eq("ativo", true).order("nome");
  if (error) throw new Error(`Erro ao carregar a equipe: ${error.message}`);
  return data;
}

export async function inserirBm(dados: { nome: string; acesso_admin: boolean }): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("monitor_bms").insert(dados);
  return error ? { erro: mensagemDoErro(error) } : {};
}

export async function atualizarBm(
  id: number,
  dados: Partial<{ nome: string; acesso_admin: boolean; ativo: boolean }>,
): Promise<Resultado> {
  const supabase = await createClient();
  // .select() devolve as linhas alteradas: se o RLS bloquear, vem vazio (sem erro).
  const { data, error } = await supabase.from("monitor_bms").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Sem permissão ou BM não encontrada." };
  return {};
}

export async function inserirNumero(campos: CamposNumero & { ddd?: string | null }): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("monitor_numeros").insert(campos);
  return error ? { erro: mensagemDoErro(error) } : {};
}

/** Campos da saúde e da situação de um número (card do número principal e "Gerenciar números"). */
export type CamposSaude = Partial<{
  situacao: CamposNumero["situacao"];
  banido_em: string | null;
  principal: boolean;
  telefone: string | null;
  limite: number | null;
  qualidade: Qualidade | null;
  observacao: string | null;
  em_operacao_desde: string | null;
}>;

export async function atualizarNumero(id: number, dados: Partial<CamposNumero & { ativo: boolean }> | CamposSaude): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("monitor_numeros").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Sem permissão ou número não encontrado." };
  return {};
}

/** Bane a BM (e todos os números dela, com a mesma data). A função do banco confere se é admin. */
export async function banirBm(id: number, data: string, motivo: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bm_banir", { p_bm_id: id, p_data: data, p_motivo: motivo });
  return error ? { erro: error.message } : {};
}

/** Desfaz o ban: a BM e os números que ela baniu voltam para a situação de antes. */
export async function desfazerBanBm(id: number): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bm_desfazer_ban", { p_bm_id: id });
  return error ? { erro: error.message } : {};
}

export type TotaisNumero = { leads: number; vendas: number };

/**
 * Leads e vendas que cada número (do monitor) gerou, para a seção "Levou ban". Mesma conta do Funil:
 * cada lead no número da primeira conversa; venda = lead que comprou (Hubla ou Pix/CNPJ). O RLS mostra
 * ao vendedor só os leads dele.
 */
export async function totaisDosNumeros(ids: number[]): Promise<Map<number, TotaisNumero>> {
  const totais = new Map<number, TotaisNumero>(ids.map((id) => [id, { leads: 0, vendas: 0 }]));
  if (!ids.length) return totais;
  const supabase = await createClient();
  const { data: ligados, error } = await supabase.from("funil_numeros").select("dc_id, monitor_numero_id").in("monitor_numero_id", ids);
  if (error) throw new Error(`Erro ao carregar os números da Data Crazy: ${error.message}`);
  const doMonitor = new Map((ligados ?? []).map((n) => [String(n.dc_id), Number(n.monitor_numero_id)]));
  if (!doMonitor.size) return totais;
  for (let de = 0; ; de += 1000) {
    const { data, error: e } = await supabase
      .from("funil_leads")
      .select("numero_dc_id, compra")
      .in("numero_dc_id", [...doMonitor.keys()])
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (e) throw new Error(`Erro ao contar os leads: ${e.message}`);
    for (const l of data) {
      const t = totais.get(doMonitor.get(String(l.numero_dc_id))!);
      if (!t) continue;
      t.leads++;
      if (l.compra === "hubla" || l.compra === "fora_hubla") t.vendas++;
    }
    if (data.length < 1000) break;
  }
  return totais;
}

export type TrafegoNumero = { hoje: number; semana: number };

/**
 * Leads que cada número ativo recebeu hoje e nos últimos 7 dias (hoje incluso, dia de Brasília), para ver
 * qual número concentra o tráfego. Lead conta no número da primeira conversa (mesma conta do Funil).
 */
export async function trafegoDosNumeros(ids: number[]): Promise<Map<number, TrafegoNumero>> {
  const trafego = new Map<number, TrafegoNumero>(ids.map((id) => [id, { hoje: 0, semana: 0 }]));
  if (!ids.length) return trafego;
  const supabase = await createClient();
  const { data: ligados, error } = await supabase.from("funil_numeros").select("dc_id, monitor_numero_id").in("monitor_numero_id", ids);
  if (error) throw new Error(`Erro ao carregar os números da Data Crazy: ${error.message}`);
  const doMonitor = new Map((ligados ?? []).map((n) => [String(n.dc_id), Number(n.monitor_numero_id)]));
  if (!doMonitor.size) return trafego;
  const hoje = hojeBrasilia();
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  const desde = d.toISOString().slice(0, 10);
  for (let de = 0; ; de += 1000) {
    const { data, error: e } = await supabase
      .from("funil_leads")
      .select("numero_dc_id, dia")
      .in("numero_dc_id", [...doMonitor.keys()])
      .gte("dia", desde)
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (e) throw new Error(`Erro ao contar os leads por número: ${e.message}`);
    for (const l of data) {
      const t = trafego.get(doMonitor.get(String(l.numero_dc_id))!);
      if (!t) continue;
      t.semana++;
      if (String(l.dia) === hoje) t.hoje++;
    }
    if (data.length < 1000) break;
  }
  return trafego;
}

/** Nome de uma BM pelo id (para montar o apelido padrão). */
export async function nomesDasBms(): Promise<Map<number, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("monitor_bms").select("id, nome");
  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);
  return new Map(data.map((bm) => [bm.id as number, bm.nome as string]));
}

// ---------------------------------------------------------------------------
// Saúde dos números principais
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lê tudo de uma consulta, de 1000 em 1000. */
async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, oQue: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(`Erro ao ler ${oQue}: ${error.message}`);
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

/** Instâncias da Data Crazy ligadas a cada número do cadastro (um número pode ter várias). null = todas. */
async function instanciasDosNumeros(
  supabase: Supabase,
  ids: number[] | null,
): Promise<{ dcId: string; numeroId: number; wabaId: string | null; nome: string; vistoEm: string }[]> {
  let q = supabase.from("funil_numeros").select("dc_id, monitor_numero_id, waba_id, nome, visto_em").not("monitor_numero_id", "is", null);
  if (ids) q = q.in("monitor_numero_id", ids.length ? ids : [-1]);
  const { data, error } = await q;
  if (error) throw new Error(`Erro ao carregar os números da Data Crazy: ${error.message}`);
  return (data ?? []).map((n) => ({
    dcId: String(n.dc_id),
    numeroId: Number(n.monitor_numero_id),
    wabaId: n.waba_id ? String(n.waba_id) : null,
    nome: String(n.nome ?? ""),
    vistoEm: String(n.visto_em ?? ""),
  }));
}

/** Dia de Brasília (yyyy-mm-dd) de um instante. */
const diaBrasilia = (instante: string) => hojeBrasilia(new Date(instante));
/** 00:00 de Brasília do dia, em UTC (Brasília é UTC-3, sem horário de verão). */
const inicioDoDia = (dia: string) => `${dia}T03:00:00Z`;

export type Periodo = { leads: number; vendas: number; mensagens: number | null; custo: number | null };
export type SaudeNumero = {
  /** nome da instância na Data Crazy (com o emoji), a mais recente; null = não ligada */
  nome: string | null;
  /** atendentes que pegaram leads deste número nos últimos 7 dias */
  atendentes: string[];
  hoje: Periodo;
  semana: Periodo;
  /** leads diferentes que receberam mensagem hoje (o que a Meta conta no limite); null = sem acesso ao custo */
  contatosHoje: number | null;
  limite: number | null;
  qualidade: Qualidade | null;
  meta: FonteMeta;
  ultimoTeste: { em: string; resultado: string | null } | null;
};

/**
 * Saúde de cada número principal: atendentes, leads, mensagens, custo e vendas de hoje e 7 dias,
 * limite e qualidade (da Meta com META_CUSTO_TOKEN; senão o que foi preenchido à mão) e o último
 * teste do monitor. Mensagens e custo só para admin (as tabelas de custo só abrem para admin).
 * Mesma conta do Funil: lead no número da 1ª conversa; custo = mensagens cobradas × preço.
 */
export async function saudeDosNumeros(numeros: Numero[], admin: boolean): Promise<Map<number, SaudeNumero>> {
  const supabase = await createClient();
  const ids = numeros.map((n) => n.id);
  const hoje = hojeBrasilia();
  const desde = somarDias(hoje, -6);
  const vazio = (): Periodo => ({ leads: 0, vendas: 0, mensagens: admin ? 0 : null, custo: admin ? 0 : null });
  const saude = new Map<number, SaudeNumero>(
    numeros.map((n) => [
      n.id,
      { nome: null, atendentes: [], hoje: vazio(), semana: vazio(), contatosHoje: admin ? 0 : null, limite: n.limite, qualidade: n.qualidade, meta: { fonte: "manual", motivo: "" }, ultimoTeste: null },
    ]),
  );
  if (!ids.length) return saude;

  const instancias = await instanciasDosNumeros(supabase, ids);
  const doNumero = new Map(instancias.map((i) => [i.dcId, i.numeroId]));
  const dcIds = [...doNumero.keys()];
  for (const i of [...instancias].sort((a, b) => a.vistoEm.localeCompare(b.vistoEm))) saude.get(i.numeroId)!.nome = i.nome || null;
  const daInstancia = (dc: string | null) => (dc ? saude.get(doNumero.get(String(dc)) ?? -1) : undefined);

  const [leads, vendas, testes, meta] = await Promise.all([
    dcIds.length
      ? lerTudo<{ numero_dc_id: string; dia: string; atendente_dc_id: string | null }>(
          (de, ate) => supabase.from("funil_leads").select("numero_dc_id, dia, atendente_dc_id").in("numero_dc_id", dcIds).gte("dia", desde).eq("interno", false).order("dc_id").range(de, ate),
          "os leads dos números",
        )
      : [],
    dcIds.length
      ? lerTudo<{ numero_dc_id: string; comprou_em: string }>(
          (de, ate) =>
            supabase
              .from("funil_leads")
              .select("numero_dc_id, comprou_em")
              .in("numero_dc_id", dcIds)
              .in("compra", ["hubla", "fora_hubla"])
              .gte("comprou_em", inicioDoDia(desde))
              .eq("interno", false)
              .order("dc_id")
              .range(de, ate),
          "as vendas dos números",
        )
      : [],
    supabase.from("monitor_resultados").select("numero_id, resultado, enviado_em, teste:monitor_testes(iniciado_em)").in("numero_id", ids).order("id", { ascending: false }).limit(50),
    lerDaMeta(numeros, instancias),
  ]);

  for (const l of leads) {
    const s = daInstancia(l.numero_dc_id);
    if (!s) continue;
    s.semana.leads++;
    if (String(l.dia) === hoje) s.hoje.leads++;
  }
  for (const v of vendas) {
    const s = daInstancia(v.numero_dc_id);
    if (!s) continue;
    s.semana.vendas++;
    if (diaBrasilia(v.comprou_em) === hoje) s.hoje.vendas++;
  }

  // atendentes (sem o suporte da Data Crazy)
  const quemPorNumero = new Map<number, Set<string>>();
  for (const l of leads) {
    const id = doNumero.get(String(l.numero_dc_id));
    if (id !== undefined && l.atendente_dc_id) quemPorNumero.set(id, (quemPorNumero.get(id) ?? new Set()).add(l.atendente_dc_id));
  }
  const todos = [...new Set([...quemPorNumero.values()].flatMap((s) => [...s]))];
  if (todos.length) {
    const { data } = await supabase.from("funil_atendentes").select("dc_id, nome, suporte_dc").in("dc_id", todos);
    const nomes = new Map((data ?? []).filter((a) => !a.suporte_dc).map((a) => [String(a.dc_id), String(a.nome)]));
    for (const [id, quem] of quemPorNumero)
      saude.get(id)!.atendentes = [...quem]
        .map((q) => nomes.get(q))
        .filter((n): n is string => !!n)
        .sort();
  }

  // último teste do monitor
  type LinhaTeste = { numero_id: number; resultado: string | null; enviado_em: string | null; teste: { iniciado_em: string } | null };
  for (const t of (testes.data ?? []) as unknown as LinhaTeste[]) {
    const s = saude.get(Number(t.numero_id));
    if (s && !s.ultimoTeste) s.ultimoTeste = { em: t.teste?.iniciado_em ?? t.enviado_em ?? "", resultado: t.resultado };
  }

  // mensagens e custo (só admin)
  if (admin && dcIds.length) {
    const [{ data: cfg }, linhas] = await Promise.all([
      supabase.from("funil_custo_config").select("preco_mensagem").maybeSingle(),
      lerTudo<{ dia: string; numero_dc_id: string; lead_dc_id: string | null; cobranca: string; mensagens: number }>(
        (de, ate) =>
          supabase
            .from("funil_custo_resumo")
            .select("dia, numero_dc_id, lead_dc_id, cobranca, mensagens")
            .in("numero_dc_id", dcIds)
            .gte("dia", desde)
            .eq("interno", false)
            .order("dia")
            .order("numero_dc_id")
            .order("lead_dc_id")
            .order("cobranca")
            .order("etapa_custo")
            .order("origem")
            .order("tipo")
            .order("antes_da_compra")
            .range(de, ate),
        "as mensagens dos números",
      ),
    ]);
    const preco = Number(cfg?.preco_mensagem ?? 0.035);
    const contatos = new Map<number, Set<string>>();
    for (const l of linhas) {
      const id = doNumero.get(String(l.numero_dc_id));
      const s = id === undefined ? undefined : saude.get(id);
      if (!s || id === undefined) continue;
      const custo = (l.cobranca === "cobrada" ? l.mensagens : 0) * preco;
      s.semana.mensagens = (s.semana.mensagens ?? 0) + l.mensagens;
      s.semana.custo = (s.semana.custo ?? 0) + custo;
      if (String(l.dia) === hoje) {
        s.hoje.mensagens = (s.hoje.mensagens ?? 0) + l.mensagens;
        s.hoje.custo = (s.hoje.custo ?? 0) + custo;
        if (l.lead_dc_id) contatos.set(id, (contatos.get(id) ?? new Set()).add(l.lead_dc_id));
      }
    }
    for (const [id, quem] of contatos) saude.get(id)!.contatosHoje = quem.size;
  }

  for (const [id, m] of meta) {
    const s = saude.get(id)!;
    s.meta = m.fonte;
    if (m.fonte.fonte === "meta") {
      s.limite = m.limite;
      s.qualidade = m.qualidade;
    }
  }
  return saude;
}

type DaMeta = { fonte: FonteMeta; limite: number | null; qualidade: Qualidade | null };

/**
 * Limite e qualidade de cada número direto da Meta (com META_CUSTO_TOKEN). Casa pelo telefone completo
 * ou, sem ele, pelo final. Sem token ou se a Meta recusar: fica o que foi preenchido à mão.
 */
async function lerDaMeta(numeros: Numero[], instancias: { numeroId: number; wabaId: string | null }[]): Promise<Map<number, DaMeta>> {
  const r = new Map<number, DaMeta>();
  const manual = (motivo: string): DaMeta => ({ fonte: { fonte: "manual", motivo }, limite: null, qualidade: null });
  const token = process.env.META_CUSTO_TOKEN;
  if (!token) {
    for (const n of numeros) r.set(n.id, manual("sem META_CUSTO_TOKEN"));
    return r;
  }
  const wabas = [...new Set(instancias.map((i) => i.wabaId).filter((w): w is string => !!w))];
  const daMeta = await Promise.all(
    wabas.map((w) =>
      numerosDaWaba(token, w).then(
        (l) => ({ w, l, erro: null as string | null }),
        (e: unknown) => ({ w, l: [], erro: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  );
  for (const n of numeros) {
    const minhas = new Set(instancias.filter((i) => i.numeroId === n.id).map((i) => i.wabaId));
    const fontes = daMeta.filter((d) => minhas.has(d.w));
    const achado = fontes.flatMap((d) => d.l).find((x) => (n.telefone ? x.telefone === n.telefone : x.telefone.endsWith(n.final)));
    if (achado) r.set(n.id, { fonte: { fonte: "meta" }, limite: limiteDoTier(achado.tier), qualidade: qualidadeDaMeta(achado.qualidade) });
    else r.set(n.id, manual(fontes.find((d) => d.erro)?.erro ?? (fontes.length ? "número não achado na conta da Meta" : "conta da Meta (WABA) desconhecida")));
  }
  return r;
}

/**
 * Dados da comparação "Antes (vários números) x Agora (números principais)". Só admin (o vendedor só
 * vê os próprios leads, então a média sairia errada). null se nenhum principal tiver data de início.
 */
export async function comparacaoDoTeste(bms: Bm[], principais: Numero[]): Promise<Comparacao | null> {
  const inicio = principais
    .map((n) => n.em_operacao_desde)
    .filter((d): d is string => !!d)
    .sort()[0];
  if (!inicio) return null;
  const supabase = await createClient();
  const [instancias, leads, custo, { data: cfg }] = await Promise.all([
    instanciasDosNumeros(supabase, null),
    lerTudo<{ numero_dc_id: string | null; dia: string; compra: string | null; comprou_em: string | null }>(
      (de, ate) => supabase.from("funil_leads").select("numero_dc_id, dia, compra, comprou_em").eq("interno", false).order("dc_id").range(de, ate),
      "os leads",
    ),
    lerTudo<{ dia: string; numero_dc_id: string | null; mensagens: number }>(
      (de, ate) =>
        supabase
          .from("funil_custo_resumo")
          .select("dia, numero_dc_id, mensagens")
          .eq("cobranca", "cobrada")
          .eq("interno", false)
          .gte("dia", INICIO_DO_CUSTO)
          .order("dia")
          .order("numero_dc_id")
          .order("lead_dc_id")
          .order("etapa_custo")
          .order("origem")
          .order("tipo")
          .order("antes_da_compra")
          .range(de, ate),
      "o custo das mensagens",
    ),
    supabase.from("funil_custo_config").select("preco_mensagem").maybeSingle(),
  ]);
  const dcDo = (id: number) => instancias.filter((i) => i.numeroId === id).map((i) => i.dcId);
  const numeros = bms.flatMap((bm) => bm.numeros.map((n) => ({ n, bm })));
  return compararTeste({
    inicio,
    hoje: hojeBrasilia(),
    preco: Number(cfg?.preco_mensagem ?? 0.035),
    leads: leads.map(
      (l): LeadComparacao => ({
        dia: String(l.dia),
        numero: l.numero_dc_id,
        vendeuEm: l.comprou_em && (l.compra === "hubla" || l.compra === "fora_hubla") ? diaBrasilia(l.comprou_em) : null,
      }),
    ),
    custo: custo.map((c): CustoDia => ({ dia: String(c.dia), numero: c.numero_dc_id, cobradas: c.mensagens })),
    banidosAntes: numeros
      .map(({ n, bm }) => ({ dcIds: dcDo(n.id), banidoEm: n.banido_em ?? (n.situacao === "banido" ? bm.banida_em : null) }))
      .filter((b): b is { dcIds: string[]; banidoEm: string } => !!b.banidoEm),
    principais: principais.map((n) => ({ dcIds: dcDo(n.id), banidoEm: n.situacao === "banido" ? n.banido_em : null })),
  });
}
