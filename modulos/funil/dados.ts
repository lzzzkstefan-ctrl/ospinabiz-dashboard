// Leitura da tela Funil e Leads, com o usuário logado: o RLS mostra ao vendedor só os
// leads dele (e o registro de contato, com nome e telefone, nunca é lido aqui).

import { createClient } from "@/lib/supabase/server";
import {
  calcularFunil,
  rotuloDoNumero,
  type CadastroNumero,
  chegadaDosLeads,
  etapaAtual,
  hojeSP,
  mediana,
  tempoEmAtendimento,
  type Chegada,
  type Etapa,
  type EtiquetaEtapa,
  type LeadChegada,
  type LeadFunil,
  type Resultado,
} from "./calculo";

/** atendenteId = atendente da Data Crazy (o vendedor do lead desde 16/10/2026); numeroId = conexão */
export type FiltrosFunil = { desde: string; ate: string; atendenteId: string | null; numeroId: string | null };
export type FiltroAtendimento = { atendenteId: string | null; numeroId: string | null };

/** Chegada do lead: o que vier primeiro entre a 1ª mensagem lida e criado_em (que já é a chegada pela
 * 1ª conversa ou pela etiqueta CL, ver sincronizar.ts). */
function chegadaDe(l: { criado_em: unknown; primeira_msg_lead_em: unknown }): string {
  const criado = String(l.criado_em);
  const msg = l.primeira_msg_lead_em ? String(l.primeira_msg_lead_em) : null;
  return msg && Date.parse(msg) < Date.parse(criado) ? msg : criado;
}

export async function carregarFunil(f: FiltrosFunil, horario?: { inicio: string; fim: string }): Promise<Resultado> {
  const supabase = await createClient();

  const leads: LeadFunil[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase
      .from("funil_leads")
      .select("dc_id, dia, criado_em, primeira_msg_lead_em, vendedor_id, numero_dc_id, compra, funil_eventos(etiqueta_dc_id, em, origem, acao)")
      .gte("dia", f.desde)
      .lte("dia", f.ate)
      .eq("funil_eventos.acao", "colocou")
      // número interno (teste) fica fora de toda a dashboard
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (f.atendenteId) q = q.eq("atendente_dc_id", f.atendenteId);
    if (f.numeroId) q = q.eq("numero_dc_id", f.numeroId);
    const { data, error } = await q;
    if (error) throw new Error(`Erro ao carregar leads: ${error.message}`);
    for (const l of data) {
      leads.push({
        dc_id: l.dc_id,
        dia: String(l.dia),
        chegada: chegadaDe(l),
        vendedor_id: l.vendedor_id,
        numero_dc_id: l.numero_dc_id,
        compra: l.compra as LeadFunil["compra"],
        eventos: (l.funil_eventos ?? []).map((e) => ({
          etiqueta_dc_id: e.etiqueta_dc_id,
          em: String(e.em),
          origem: e.origem as "historico" | "sincronizacao",
        })),
      });
    }
    if (data.length < 1000) break;
  }

  const [etapas, etiquetas] = await Promise.all([
    supabase.from("funil_etapas").select("id, nome, tipo, ordem, perda_na_etapa_id, comprou").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
  ]);
  if (etapas.error) throw new Error(`Erro ao carregar etapas: ${etapas.error.message}`);
  if (etiquetas.error) throw new Error(`Erro ao carregar etiquetas: ${etiquetas.error.message}`);

  return calcularFunil(leads, etapas.data as Etapa[], etiquetas.data as EtiquetaEtapa[], f.desde, f.ate, horario);
}

export type OpcoesFunil = { vendedores: { id: string; nome: string }[]; numeros: { id: string; nome: string }[] };

/**
 * Vendedores = atendentes da Data Crazy (sem os de suporte), com o nome da pessoa da equipe quando
 * ligado; números = só os ativos (em operação, de BM ativa e não banida). Banido fica só no filtro
 * "Número banido". Número ainda sem cadastro na aba BMs entra (não dá para saber a situação).
 */
export async function opcoesDoFunil(): Promise<OpcoesFunil> {
  const [atendentes, ativos, rotulos] = await Promise.all([nomesDosAtendentes(), situacaoDosNumeros(), nomesDosNumeros()]);
  return {
    vendedores: [...atendentes.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    numeros: [...rotulos.entries()]
      .filter(([id]) => ativos.get(id) !== false)
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

/**
 * Nome de cada atendente da Data Crazy que pode ser vendedor (sem os de suporte): o nome da pessoa da
 * equipe quando ligado, senão o nome na Data Crazy. O vendedor vê só o próprio (RLS).
 */
export async function nomesDosAtendentes(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funil_atendentes").select("dc_id, nome, equipe(nome)").eq("suporte_dc", false);
  if (error) throw new Error(`Erro ao carregar atendentes: ${error.message}`);
  type Linha = { dc_id: string; nome: string; equipe: { nome: string } | null };
  return new Map(((data ?? []) as unknown as Linha[]).map((a) => [String(a.dc_id), (a.equipe?.nome ?? a.nome).trim()]));
}

/** id do número (Data Crazy) -> está ativo? (ausente = sem cadastro na aba BMs) */
export async function situacaoDosNumeros(): Promise<Map<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_numeros").select("dc_id, monitor_numeros(situacao, ativo, monitor_bms(ativo, banida_em))");
  type Linha = { dc_id: string; monitor_numeros: { situacao: string; ativo: boolean; monitor_bms: { ativo: boolean; banida_em: string | null } | null } | null };
  const m = new Map<string, boolean>();
  for (const n of (data ?? []) as unknown as Linha[]) {
    const mn = n.monitor_numeros;
    if (mn) m.set(String(n.dc_id), mn.situacao === "operacao" && mn.ativo && !!mn.monitor_bms?.ativo && !mn.monitor_bms?.banida_em);
  }
  return m;
}

/** Quem é o vendedor de uma linha: o atendente; dado antigo sem atendente usa a pessoa gravada. */
function vendedorDe(atendenteId: unknown, vendedorId: unknown, atendentes: Map<string, string>, equipe: Map<number, string>): string | null {
  if (atendenteId) return atendentes.get(String(atendenteId)) ?? null;
  return vendedorId ? (equipe.get(Number(vendedorId)) ?? null) : null;
}

export type StatusSincronizacao = {
  ultima: { iniciada_em: string; terminada_em: string | null; situacao: "rodando" | "ok" | "falhou"; erro: string | null } | null;
  ultimaOk: string | null;
};

export async function statusDaSincronizacao(): Promise<StatusSincronizacao> {
  const supabase = await createClient();
  const [ultima, ok] = await Promise.all([
    supabase.from("funil_sincronizacoes").select("iniciada_em, terminada_em, situacao, erro").order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("funil_sincronizacoes").select("terminada_em").eq("situacao", "ok").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    ultima: ultima.data ? (ultima.data as StatusSincronizacao["ultima"]) : null,
    ultimaOk: ok.data?.terminada_em ?? null,
  };
}

/**
 * Rótulo de cada número (instância) da Data Crazy, sem o sufixo de vendedor do modelo antigo
 * ("🍿0348-VY" -> "🍿 0348"): emoji do nome + final (o da aba BMs quando ligado). Se o apelido na aba
 * BMs foi trocado (não é o padrão "final + BM"), vale o apelido.
 */
export async function nomesDosNumeros(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funil_numeros").select("dc_id, nome, monitor_numeros(final, apelido, monitor_bms(nome))");
  if (error) throw new Error(`Erro ao carregar números: ${error.message}`);
  type Linha = { dc_id: string; nome: string; monitor_numeros: CadastroNumero | null };
  return new Map(((data ?? []) as unknown as Linha[]).map((n) => [String(n.dc_id), rotuloDoNumero(n.nome, n.monitor_numeros)]));
}

// ---------------------------------------------------------------------------
// Atendimento (migration funil_atendimento). Tudo com o login de quem vê: o vendedor só recebe
// as conversas e os leads dele (RLS).
// ---------------------------------------------------------------------------
export type ConfigFunil = { horasEspera: number; inicio: string; fim: string; minutosResposta: number };

export async function configDoFunil(): Promise<ConfigFunil> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_config").select("horas_espera, atendimento_inicio, atendimento_fim, minutos_primeira_resposta").maybeSingle();
  return {
    horasEspera: Number(data?.horas_espera ?? 2),
    inicio: String(data?.atendimento_inicio ?? "09:00").slice(0, 5),
    fim: String(data?.atendimento_fim ?? "22:00").slice(0, 5),
    minutosResposta: Number(data?.minutos_primeira_resposta ?? 30),
  };
}

export type Esperando = {
  /** conversa que espera há mais tempo (a do maior tempo de espera) */
  conversaId: string;
  rotulo: string | null;
  vendedor: string | null;
  /** todos os números em que o lead está esperando (uma linha por lead) */
  numeros: string[];
  etapa: string | null;
  desde: string;
  /** tempo de espera contando só o horário de atendimento (o maior entre os números) */
  esperaMs: number;
};

/**
 * Listas de atendimento (só conversas EM ABERTO: finalizada ou arquivada na Data Crazy não entra):
 * - leads / alunos: a última mensagem é do lead e nenhuma da empresa veio depois (atendente ou automação);
 * - aguardandoLead: a última mensagem é da empresa e o lead não responde (candidatos a follow-up e
 *   ao webinar de downsell). Só leads (alunos ficam fora).
 * Todas passando de X horas, contando só o horário de atendimento. Aluno = etiqueta de etapa de compra.
 */
export type ListasEsperando = {
  leads: Esperando[];
  alunos: Esperando[];
  aguardandoLead: Esperando[];
  filas: Filas;
  /** conversas abertas em número banido: ficam fora de todas as listas e contadores (16/10/2026) */
  abertasEmBanidos: number;
};

/** Números da Data Crazy marcados como banidos na aba BMs (BM banida também bane os números dela). */
export async function numerosBanidos(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funil_numeros").select("dc_id, monitor_numeros!inner(situacao)").eq("monitor_numeros.situacao", "banido");
  if (error) throw new Error(`Erro ao carregar números banidos: ${error.message}`);
  return new Set((data ?? []).map((n) => String(n.dc_id)));
}

/**
 * Filas da Data Crazy (pedido do Davi, 10/10/2026). Os status da API são marcas que se somam
 * (ex.: ["waiting", "opened"]); a tela mostra duas listas:
 * - atendimento: Não iniciados (unstarted, ninguém assumiu) + Em atendimento (opened), uma linha por
 *   LEAD: o mesmo lead em dois números vira uma linha com os números juntos (se alguma conversa for
 *   Não iniciado, vale Não iniciado; o tempo é o maior); Não iniciados primeiro, cada grupo pelo maior
 *   tempo na fila;
 * - aguardando (waiting): o lead espera a empresa. Pode repetir uma conversa da outra lista, como no CRM.
 * Robô (automation) não tem lista: não é usado em outra parte.
 * esperaMs = tempo REAL: no Aguardando, desde a última mensagem do lead; na outra, desde o início
 * do atendimento atual.
 */
export type ItemFila = Esperando & { situacao: "nao_iniciado" | "em_atendimento" };
export type Filas = { total: number; atendimento: ItemFila[]; aguardando: Esperando[] };

/**
 * Uma linha por lead: o mesmo lead em mais de um número vira uma linha só, com os números juntos e o
 * maior tempo de espera (o resto vem da conversa que espera há mais tempo).
 */
export async function leadsEsperando(cfg: ConfigFunil, filtro: FiltroAtendimento = { atendenteId: null, numeroId: null }): Promise<ListasEsperando> {
  const supabase = await createClient();
  let q = supabase
    .from("funil_conversas")
    .select("dc_id, lead_dc_id, contato_rotulo, atendente_dc_id, vendedor_id, numero_dc_id, etiquetas_atuais, ultima_recebida_em, ultima_enviada_em, statuses, fila_desde")
    // finalizada = finalizada ou arquivada na Data Crazy (se o lead escrever de novo, ela reabre)
    .eq("finalizada", false)
    // número interno (teste) fica fora de toda a dashboard
    .eq("interno", false)
    .limit(5000);
  if (filtro.atendenteId) q = q.eq("atendente_dc_id", filtro.atendenteId);
  if (filtro.numeroId) q = q.eq("numero_dc_id", filtro.numeroId);
  const [conversas, etapas, etiquetas, equipe, numeros, atendentes, banidos] = await Promise.all([
    q,
    supabase.from("funil_etapas").select("id, nome, tipo, ordem, perda_na_etapa_id, comprou").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
    supabase.from("equipe").select("id, nome"),
    nomesDosNumeros(),
    nomesDosAtendentes(),
    numerosBanidos(),
  ]);
  if (conversas.error) throw new Error(`Erro ao carregar conversas: ${conversas.error.message}`);
  let abertasEmBanidos = 0;
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const listaEtapas = (etapas.data ?? []) as Etapa[];
  const listaEtiquetas = (etiquetas.data ?? []) as EtiquetaEtapa[];
  const etapaDeCompra = new Set(listaEtapas.filter((e) => e.comprou).map((e) => e.id));
  const etiquetasDeAluno = new Set(listaEtiquetas.filter((t) => t.etapa_id !== null && etapaDeCompra.has(t.etapa_id)).map((t) => t.dc_id));
  const agora = Date.now();
  const limite = cfg.horasEspera * 3_600_000;

  type Linha = Esperando & { aluno: boolean };
  const esperando = new Map<string, Linha>();
  const aguardando = new Map<string, Linha>();
  const filas: Filas = { total: 0, atendimento: [], aguardando: [] };
  const filaAtendimento = new Map<string, ItemFila>();
  const filaAguardando = new Map<string, Esperando>();
  /** junta duas linhas do mesmo lead: os números somam, o resto vem da que espera há mais tempo */
  const juntar = <T extends Esperando>(atual: T | undefined, nova: T): T => {
    if (!atual) return nova;
    const maior = nova.esperaMs > atual.esperaMs ? nova : atual;
    return { ...maior, vendedor: maior.vendedor ?? atual.vendedor ?? nova.vendedor, numeros: [...new Set([...atual.numeros, ...nova.numeros])].sort() };
  };
  for (const c of conversas.data) {
    // número banido: fora das filas, das listas e dos totais (só conta quantas conversas abertas ficaram lá)
    if (c.numero_dc_id && banidos.has(String(c.numero_dc_id))) {
      if ((c.statuses ?? []).length) abertasEmBanidos++;
      continue;
    }
    // mesmo lead = mesmo lead da Data Crazy; sem lead ligado, o rótulo (primeiro nome + 4 dígitos)
    const chave = c.lead_dc_id ? `l:${c.lead_dc_id}` : c.contato_rotulo ? `r:${c.contato_rotulo}` : `c:${c.dc_id}`;
    // filas: toda conversa aberta, sem limite de horas
    const statuses: string[] = c.statuses ?? [];
    if (statuses.length) filas.total++;
    const situacao = statuses.includes("unstarted") ? "nao_iniciado" : statuses.includes("opened") ? "em_atendimento" : null;
    const naFilaAguardando = statuses.includes("waiting");
    if ((situacao || naFilaAguardando) && c.fila_desde) {
      const tags: string[] = c.etiquetas_atuais ?? [];
      const numero = c.numero_dc_id ? (numeros.get(String(c.numero_dc_id)) ?? null) : null;
      const base = {
        conversaId: String(c.dc_id),
        rotulo: c.contato_rotulo,
        vendedor: vendedorDe(c.atendente_dc_id, c.vendedor_id, atendentes, nomeDe),
        numeros: numero ? [numero] : [],
        etapa: etapaAtual(tags, listaEtiquetas, listaEtapas),
      };
      const tempo = (desde: string) => ({ desde, esperaMs: Math.max(0, agora - Date.parse(desde)) });
      if (situacao) {
        const atual = filaAtendimento.get(chave);
        const junto = juntar<ItemFila>(atual, { ...base, ...tempo(String(c.fila_desde)), situacao });
        // alguma conversa do lead sem ninguém assumir: a linha é Não iniciado
        if (atual?.situacao === "nao_iniciado" || situacao === "nao_iniciado") junto.situacao = "nao_iniciado";
        filaAtendimento.set(chave, junto);
      }
      if (naFilaAguardando) {
        filaAguardando.set(chave, juntar(filaAguardando.get(chave), { ...base, ...tempo(c.ultima_recebida_em ? String(c.ultima_recebida_em) : String(c.fila_desde)) }));
      }
    }

    const recebida = c.ultima_recebida_em ? String(c.ultima_recebida_em) : null;
    const enviada = c.ultima_enviada_em ? String(c.ultima_enviada_em) : null;
    // quem mandou a última: o lead (sem nada da empresa depois) ou a empresa
    const doLead = !!recebida && (!enviada || Date.parse(recebida) > Date.parse(enviada));
    const desde = doLead ? recebida : enviada;
    if (!desde) continue;
    const esperaMs = tempoEmAtendimento(desde, agora, cfg.inicio, cfg.fim);
    if (esperaMs <= limite) continue;
    const tags: string[] = c.etiquetas_atuais ?? [];
    const aluno = tags.some((t) => etiquetasDeAluno.has(t));
    if (!doLead && aluno) continue;
    const numero = c.numero_dc_id ? (numeros.get(String(c.numero_dc_id)) ?? null) : null;
    const linha: Linha = {
      conversaId: String(c.dc_id),
      rotulo: c.contato_rotulo,
      vendedor: vendedorDe(c.atendente_dc_id, c.vendedor_id, atendentes, nomeDe),
      numeros: numero ? [numero] : [],
      etapa: etapaAtual(tags, listaEtiquetas, listaEtapas),
      desde,
      esperaMs,
      aluno,
    };
    const grupo = doLead ? esperando : aguardando;
    const atual = grupo.get(chave);
    if (!atual) {
      grupo.set(chave, linha);
      continue;
    }
    const maior = linha.esperaMs > atual.esperaMs ? linha : atual;
    grupo.set(chave, {
      ...maior,
      vendedor: maior.vendedor ?? atual.vendedor ?? linha.vendedor,
      numeros: [...new Set([...atual.numeros, ...linha.numeros])].sort(),
      aluno: atual.aluno || linha.aluno,
    });
  }
  // lead esperando a empresa em um número não entra em "Aguardando o lead" (a vez é da empresa)
  for (const chave of esperando.keys()) aguardando.delete(chave);
  const ordenar = (m: Map<string, Linha>) => [...m.values()].sort((a, b) => b.esperaMs - a.esperaMs);
  const todos = ordenar(esperando);
  filas.atendimento = [...filaAtendimento.values()];
  filas.aguardando = [...filaAguardando.values()];
  // Não iniciados primeiro; dentro de cada grupo, quem está há mais tempo na fila
  filas.atendimento.sort((a, b) => (a.situacao === b.situacao ? b.esperaMs - a.esperaMs : a.situacao === "nao_iniciado" ? -1 : 1));
  filas.aguardando.sort((a, b) => b.esperaMs - a.esperaMs);
  return { leads: todos.filter((e) => !e.aluno), alunos: todos.filter((e) => e.aluno), aguardandoLead: ordenar(aguardando), filas, abertasEmBanidos };
}

/**
 * Leads sem atendimento na chegada, dos leads que entraram no período (o RLS mostra ao vendedor só
 * os dele). Número interno fica fora.
 */
export async function chegadaNoPeriodo(f: FiltrosFunil, cfg: ConfigFunil): Promise<Chegada> {
  const supabase = await createClient();
  const leads: LeadChegada[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase
      .from("funil_leads")
      .select("criado_em, primeira_msg_lead_em, primeira_resposta_em, compra")
      .gte("dia", f.desde)
      .lte("dia", f.ate)
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (f.atendenteId) q = q.eq("atendente_dc_id", f.atendenteId);
    if (f.numeroId) q = q.eq("numero_dc_id", f.numeroId);
    const { data, error } = await q;
    if (error) throw new Error(`Erro ao carregar a chegada dos leads: ${error.message}`);
    for (const l of data) {
      leads.push({
        chegada: chegadaDe(l),
        resposta: l.primeira_resposta_em ? String(l.primeira_resposta_em) : null,
        comprou: l.compra === "hubla" || l.compra === "fora_hubla",
      });
    }
    if (data.length < 1000) break;
  }
  return chegadaDosLeads(leads, cfg.inicio, cfg.fim, cfg.minutosResposta, Date.now());
}

export type NaoComecou = { leadId: string; rotulo: string | null; vendedor: string | null; numero: string | null; chegada: string; esperaMs: number };

/**
 * Chegaram e ainda não começaram (pedido do Davi, 11/10/2026): leads dos últimos 7 dias que chegaram
 * (1ª mensagem ou etiqueta CL) e ainda não têm nenhuma etiqueta de etapa. Fora do funil (suporte,
 * menor…) e quem já comprou não entram. Espera em tempo real, desde a chegada.
 */
export async function naoComecaram(filtro: FiltroAtendimento = { atendenteId: null, numeroId: null }): Promise<NaoComecou[]> {
  const supabase = await createClient();
  let q = supabase
    .from("funil_leads")
    .select("dc_id, criado_em, primeira_msg_lead_em, numero_dc_id, atendente_dc_id, vendedor_id, compra, funil_eventos(etiqueta_dc_id, acao)")
    .gte("criado_em", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .eq("interno", false)
    .eq("funil_eventos.acao", "colocou")
    .limit(3000);
  if (filtro.atendenteId) q = q.eq("atendente_dc_id", filtro.atendenteId);
  if (filtro.numeroId) q = q.eq("numero_dc_id", filtro.numeroId);
  const [leads, etapas, etiquetas, equipe, numeros, atendentes, banidos] = await Promise.all([
    q,
    supabase.from("funil_etapas").select("id, tipo").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
    supabase.from("equipe").select("id, nome"),
    nomesDosNumeros(),
    nomesDosAtendentes(),
    numerosBanidos(),
  ]);
  if (leads.error) throw new Error(`Erro ao carregar quem não começou: ${leads.error.message}`);
  const tipoDaEtapa = new Map((etapas.data ?? []).map((e) => [Number(e.id), String(e.tipo)]));
  const tipoDaEtiqueta = new Map(
    (etiquetas.data ?? []).filter((t) => t.etapa_id !== null).map((t) => [String(t.dc_id), tipoDaEtapa.get(Number(t.etapa_id)) ?? null]),
  );
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const agora = Date.now();
  const pendentes = leads.data.filter((l) => {
    if (l.compra === "hubla" || l.compra === "fora_hubla") return false;
    // número banido fica fora (aparece no filtro "Número banido")
    if (l.numero_dc_id && banidos.has(String(l.numero_dc_id))) return false;
    const tipos = (l.funil_eventos ?? []).map((e) => (e.etiqueta_dc_id ? tipoDaEtiqueta.get(String(e.etiqueta_dc_id)) : null));
    return !tipos.some((t) => t === "etapa" || t === "fora");
  });

  // rótulo "Maria -1234" vem das conversas (o lead não guarda nome)
  const rotuloDe = new Map<string, string>();
  const ids = pendentes.map((l) => String(l.dc_id));
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from("funil_conversas").select("lead_dc_id, contato_rotulo").in("lead_dc_id", ids.slice(i, i + 150));
    for (const c of data ?? []) if (c.contato_rotulo && !rotuloDe.has(String(c.lead_dc_id))) rotuloDe.set(String(c.lead_dc_id), String(c.contato_rotulo));
  }
  return pendentes
    .map((l) => {
      const chegada = chegadaDe(l);
      return {
        leadId: String(l.dc_id),
        rotulo: rotuloDe.get(String(l.dc_id)) ?? null,
        vendedor: vendedorDe(l.atendente_dc_id, l.vendedor_id, atendentes, nomeDe),
        numero: l.numero_dc_id ? (numeros.get(String(l.numero_dc_id)) ?? null) : null,
        chegada,
        esperaMs: Math.max(0, agora - Date.parse(chegada)),
      };
    })
    .sort((a, b) => b.esperaMs - a.esperaMs);
}

export type LeadBanido = {
  chave: string;
  rotulo: string | null;
  vendedor: string | null;
  etapa: string | null;
  /** números banidos em que o lead tem conversa */
  banidos: string[];
  /** outros números (não banidos) em que o lead já tem conversa: dá para retomar por eles */
  outros: string[];
  /** última mensagem trocada (lead ou empresa) em qualquer conversa do lead */
  ultimaEm: string | null;
};

/**
 * Leads em número banido (pedido do Davi, 16/10/2026): leads com conversa num número cuja situação
 * na aba BMs é "banido", com etapa e vendedor, para decidir quem retomar por outro número. Todas as
 * conversas contam (abertas e finalizadas), sem limite de período. Uma linha por lead (mesma chave das
 * filas: lead da Data Crazy, ou o rótulo). Etapa e vendedor vêm da conversa mais recente (sem eles, de outra conversa ou do lead).
 */
export async function leadsEmNumeroBanido(filtro: { atendenteId: string | null } = { atendenteId: null }): Promise<LeadBanido[]> {
  const supabase = await createClient();
  const banidos = await numerosBanidos();
  if (banidos.size === 0) return [];

  const sel = "dc_id, lead_dc_id, contato_rotulo, atendente_dc_id, vendedor_id, numero_dc_id, etiquetas_atuais, ultima_recebida_em, ultima_enviada_em";
  let q = supabase.from("funil_conversas").select(sel).in("numero_dc_id", [...banidos]).eq("interno", false).limit(5000);
  if (filtro.atendenteId) q = q.eq("atendente_dc_id", filtro.atendenteId);
  const [conversas, etapas, etiquetas, equipe, numeros, atendentes] = await Promise.all([
    q,
    supabase.from("funil_etapas").select("id, nome, tipo, ordem, perda_na_etapa_id, comprou").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
    supabase.from("equipe").select("id, nome"),
    nomesDosNumeros(),
    nomesDosAtendentes(),
  ]);
  if (conversas.error) throw new Error(`Erro ao carregar conversas em número banido: ${conversas.error.message}`);
  type Conversa = (typeof conversas.data)[number];
  // as outras conversas dos mesmos leads (em números que não estão banidos)
  const leadIds = [...new Set(conversas.data.map((c) => c.lead_dc_id).filter(Boolean).map(String))];
  const outras: Conversa[] = [];
  // conversa antiga ou finalizada pode não ter vendedor nem etiqueta: aí valem os do lead
  const doLead = new Map<string, { atendente_dc_id: string | null; vendedor_id: number | null; etiquetas: string[] }>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const fatia = leadIds.slice(i, i + 150);
    const [cs, ls] = await Promise.all([
      supabase.from("funil_conversas").select(sel).in("lead_dc_id", fatia).eq("interno", false),
      supabase.from("funil_leads").select("dc_id, atendente_dc_id, vendedor_id, etiquetas_atuais").in("dc_id", fatia),
    ]);
    for (const c of cs.data ?? []) if (!banidos.has(String(c.numero_dc_id))) outras.push(c);
    for (const l of ls.data ?? [])
      doLead.set(String(l.dc_id), {
        atendente_dc_id: l.atendente_dc_id ? String(l.atendente_dc_id) : null,
        vendedor_id: l.vendedor_id ? Number(l.vendedor_id) : null,
        etiquetas: l.etiquetas_atuais ?? [],
      });
  }

  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const listaEtapas = (etapas.data ?? []) as Etapa[];
  const listaEtiquetas = (etiquetas.data ?? []) as EtiquetaEtapa[];
  const ultima = (c: Conversa) =>
    [c.ultima_recebida_em, c.ultima_enviada_em].filter(Boolean).map(String).sort().at(-1) ?? null;
  const chaveDe = (c: Conversa) => (c.lead_dc_id ? `l:${c.lead_dc_id}` : c.contato_rotulo ? `r:${c.contato_rotulo}` : `c:${c.dc_id}`);

  const grupos = new Map<string, Conversa[]>();
  for (const c of [...conversas.data, ...outras]) grupos.set(chaveDe(c), [...(grupos.get(chaveDe(c)) ?? []), c]);
  const nomeNumero = (c: Conversa) => (c.numero_dc_id ? (numeros.get(String(c.numero_dc_id)) ?? "número sem nome") : null);

  const linhas: LeadBanido[] = [];
  for (const [chave, cs] of grupos) {
    const noBanido = cs.filter((c) => banidos.has(String(c.numero_dc_id)));
    if (noBanido.length === 0) continue;
    // a conversa mais recente manda na etapa e no vendedor; sem eles, outra conversa e por fim o lead
    const ordem = [...cs].sort((a, b) => (ultima(b) ?? "").localeCompare(ultima(a) ?? ""));
    const lead = doLead.get(String(ordem.find((c) => c.lead_dc_id)?.lead_dc_id ?? ""));
    const comDono = ordem.find((c) => c.atendente_dc_id || c.vendedor_id);
    const vendedor = comDono
      ? vendedorDe(comDono.atendente_dc_id, comDono.vendedor_id, atendentes, nomeDe)
      : lead
        ? vendedorDe(lead.atendente_dc_id, lead.vendedor_id, atendentes, nomeDe)
        : null;
    const etapa = ordem.map((c) => etapaAtual(c.etiquetas_atuais ?? [], listaEtiquetas, listaEtapas)).find(Boolean) ?? etapaAtual(lead?.etiquetas ?? [], listaEtiquetas, listaEtapas);
    linhas.push({
      chave,
      rotulo: cs.find((c) => c.contato_rotulo)?.contato_rotulo ?? null,
      vendedor,
      etapa,
      banidos: [...new Set(noBanido.map(nomeNumero).filter((n): n is string => !!n))].sort(),
      outros: [...new Set(cs.filter((c) => !banidos.has(String(c.numero_dc_id))).map(nomeNumero).filter((n): n is string => !!n))].sort(),
      ultimaEm: cs.map(ultima).filter((x): x is string => !!x).sort().at(-1) ?? null,
    });
  }
  // quem ainda não tem outro número primeiro (são os órfãos); dentro, a conversa mais recente primeiro
  return linhas.sort((a, b) => (a.outros.length === 0) !== (b.outros.length === 0) ? (a.outros.length === 0 ? -1 : 1) : (b.ultimaEm ?? "").localeCompare(a.ultimaEm ?? ""));
}

export type CardAtendente = {
  id: string;
  nome: string;
  /** leads que chegaram hoje com este atendente como dono */
  leadsHoje: number;
  /** leads com conversa aberta em atendimento com ele agora */
  emAtendimento: number;
  /** leads com conversa aberta dele em que a última mensagem é do lead (a vez é dele) */
  aguardando: number;
  /** vendas pagas de hoje da pessoa da equipe ligada ao atendente (null = atendente sem pessoa) */
  vendasHoje: number | null;
  /** média até a 1ª resposta dele nos leads de hoje (horário de atendimento) */
  primeiraRespostaMs: number | null;
  respondidos: number;
};
export type VisaoAtendentes = {
  cards: CardAtendente[];
  /** leads com conversa aberta sem atendente, e há quanto tempo espera o mais antigo (tempo real) */
  semAtendente: { leads: number; maisAntigoMs: number | null };
  /** leads de hoje por dono (id null = sem atendente), para a barra de distribuição */
  distribuicao: { id: string | null; nome: string; leads: number }[];
  totalHoje: number;
};

/**
 * Visão por atendente (pedido do Davi, 16/10/2026): o dono do lead é o atendente da conversa na Data
 * Crazy (o número virou detalhe). Hoje = dia de Brasília. O vendedor vê só o próprio (RLS).
 */
export async function visaoPorAtendente(cfg: ConfigFunil): Promise<VisaoAtendentes> {
  const supabase = await createClient();
  const hoje = hojeSP();
  const [atendentes, ligacoes, leads, conversas, vendas, banidos] = await Promise.all([
    nomesDosAtendentes(),
    supabase.from("funil_atendentes").select("dc_id, equipe_id").eq("suporte_dc", false),
    supabase
      .from("funil_leads")
      .select("dc_id, atendente_dc_id, primeira_msg_lead_em, primeira_resposta_em, primeira_resposta_por")
      .eq("dia", hoje)
      .eq("interno", false)
      .limit(5000),
    supabase
      .from("funil_conversas")
      .select("dc_id, lead_dc_id, contato_rotulo, atendente_dc_id, numero_dc_id, statuses, ultima_recebida_em, ultima_enviada_em, fila_desde")
      .eq("finalizada", false)
      .eq("interno", false)
      .limit(5000),
    supabase.from("vendas").select("vendedor_id").eq("data", hoje).eq("status", "pago").eq("aguardando_confirmacao", false).limit(5000),
    numerosBanidos(),
  ]);
  if (leads.error) throw new Error(`Erro ao carregar os leads de hoje: ${leads.error.message}`);
  if (conversas.error) throw new Error(`Erro ao carregar as conversas: ${conversas.error.message}`);

  const pessoaDe = new Map((ligacoes.data ?? []).map((a) => [String(a.dc_id), a.equipe_id ? Number(a.equipe_id) : null]));
  const vendasDe = new Map<number, number>();
  for (const v of vendas.data ?? []) if (v.vendedor_id) vendasDe.set(Number(v.vendedor_id), (vendasDe.get(Number(v.vendedor_id)) ?? 0) + 1);

  const card = new Map<string, CardAtendente>();
  for (const [id, nome] of atendentes) {
    const pessoa = pessoaDe.get(id) ?? null;
    card.set(id, { id, nome, leadsHoje: 0, emAtendimento: 0, aguardando: 0, vendasHoje: pessoa ? (vendasDe.get(pessoa) ?? 0) : null, primeiraRespostaMs: null, respondidos: 0 });
  }

  // leads de hoje por dono e tempo até a 1ª resposta de quem respondeu
  let semDonoHoje = 0;
  const tempos = new Map<string, number[]>();
  for (const l of leads.data) {
    const c = l.atendente_dc_id ? card.get(String(l.atendente_dc_id)) : undefined;
    if (c) c.leadsHoje++;
    else semDonoHoje++;
    if (l.primeira_resposta_por && l.primeira_msg_lead_em && l.primeira_resposta_em) {
      const ms = tempoEmAtendimento(String(l.primeira_msg_lead_em), Date.parse(String(l.primeira_resposta_em)), cfg.inicio, cfg.fim);
      tempos.set(String(l.primeira_resposta_por), [...(tempos.get(String(l.primeira_resposta_por)) ?? []), ms]);
    }
  }
  for (const [id, ms] of tempos) {
    const c = card.get(id);
    if (c) Object.assign(c, { primeiraRespostaMs: ms.reduce((a, b) => a + b, 0) / ms.length, respondidos: ms.length });
  }

  // agora: uma contagem por lead (o mesmo lead em dois números conta uma vez)
  const agora = Date.now();
  const vistos = new Map<string, { atendimento: Set<string>; aguardando: Set<string> }>();
  const semDono = new Map<string, number>();
  for (const c of conversas.data) {
    const chave = c.lead_dc_id ? `l:${c.lead_dc_id}` : c.contato_rotulo ? `r:${c.contato_rotulo}` : `c:${c.dc_id}`;
    const statuses: string[] = c.statuses ?? [];
    if (!statuses.length || (c.numero_dc_id && banidos.has(String(c.numero_dc_id)))) continue;
    const id = c.atendente_dc_id ? String(c.atendente_dc_id) : null;
    if (!id || !card.has(id)) {
      const desde = c.fila_desde ?? c.ultima_recebida_em;
      if (desde) semDono.set(chave, Math.max(semDono.get(chave) ?? 0, agora - Date.parse(String(desde))));
      continue;
    }
    const v = vistos.get(id) ?? { atendimento: new Set<string>(), aguardando: new Set<string>() };
    if (statuses.includes("opened")) v.atendimento.add(chave);
    const recebida = c.ultima_recebida_em ? Date.parse(String(c.ultima_recebida_em)) : null;
    const enviada = c.ultima_enviada_em ? Date.parse(String(c.ultima_enviada_em)) : null;
    if (recebida !== null && (enviada === null || recebida > enviada)) v.aguardando.add(chave);
    vistos.set(id, v);
  }
  for (const [id, v] of vistos) Object.assign(card.get(id)!, { emAtendimento: v.atendimento.size, aguardando: v.aguardando.size });

  const cards = [...card.values()]
    // atendente sem nada hoje e sem pessoa da equipe fica de fora (ex.: conta antiga)
    .filter((c) => c.vendasHoje !== null || c.leadsHoje || c.emAtendimento || c.aguardando)
    .sort((a, b) => b.leadsHoje - a.leadsHoje || a.nome.localeCompare(b.nome));
  const distribuicao = [
    ...cards.map((c) => ({ id: c.id as string | null, nome: c.nome, leads: c.leadsHoje })),
    ...(semDonoHoje ? [{ id: null, nome: "Sem atendente", leads: semDonoHoje }] : []),
  ];
  return {
    cards,
    semAtendente: { leads: semDono.size, maisAntigoMs: semDono.size ? Math.max(...semDono.values()) : null },
    distribuicao,
    totalHoje: leads.data.length,
  };
}

export type PrimeiraResposta = { vendedor: string; leads: number; mediaMs: number; medianaMs: number };

/** Tempo de primeira resposta (horário de atendimento) por quem respondeu, dos leads que entraram no período. */
export async function primeiraResposta(f: FiltrosFunil, cfg: ConfigFunil): Promise<PrimeiraResposta[]> {
  const supabase = await createClient();
  let q = supabase
    .from("funil_leads")
    .select("primeira_msg_lead_em, primeira_resposta_em, primeira_resposta_por")
    .gte("dia", f.desde)
    .lte("dia", f.ate)
    .not("primeira_resposta_em", "is", null)
    .not("primeira_msg_lead_em", "is", null)
    .eq("interno", false)
    .limit(5000);
  if (f.atendenteId) q = q.eq("atendente_dc_id", f.atendenteId);
  if (f.numeroId) q = q.eq("numero_dc_id", f.numeroId);
  const [leads, atendentes, equipe] = await Promise.all([q, supabase.from("funil_atendentes").select("dc_id, nome, equipe_id"), supabase.from("equipe").select("id, nome")]);
  if (leads.error) throw new Error(`Erro ao carregar primeira resposta: ${leads.error.message}`);
  const nomeEquipe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const quem = new Map((atendentes.data ?? []).map((a) => [String(a.dc_id), a.equipe_id ? (nomeEquipe.get(Number(a.equipe_id)) ?? String(a.nome)) : String(a.nome)]));
  const grupos = new Map<string, number[]>();
  for (const l of leads.data) {
    const nome = quem.get(String(l.primeira_resposta_por)) ?? "outro atendente";
    const ms = tempoEmAtendimento(String(l.primeira_msg_lead_em), Date.parse(String(l.primeira_resposta_em)), cfg.inicio, cfg.fim);
    grupos.set(nome, [...(grupos.get(nome) ?? []), ms]);
  }
  return [...grupos.entries()]
    .map(([vendedor, ms]) => ({ vendedor, leads: ms.length, mediaMs: ms.reduce((s, x) => s + x, 0) / ms.length, medianaMs: mediana(ms)! }))
    .sort((a, b) => b.leads - a.leads);
}

/** BM (do Monitor) de cada número da Data Crazy. */
export async function bmDosNumeros(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_numeros").select("dc_id, monitor_numeros(monitor_bms(nome))");
  type Linha = { dc_id: string; monitor_numeros: { monitor_bms: { nome: string } | null } | null };
  return new Map(((data ?? []) as unknown as Linha[]).map((n) => [n.dc_id, n.monitor_numeros?.monitor_bms?.nome ?? "sem BM"]));
}

export type Mudanca = { id: number; dia: string; etapa: string | null; descricao: string };

/** Mudanças registradas no funil (marcas nos gráficos). */
export async function mudancasDoFunil(desde?: string, ate?: string): Promise<Mudanca[]> {
  const supabase = await createClient();
  let q = supabase.from("funil_mudancas").select("id, dia, descricao, funil_etapas(nome)").order("dia", { ascending: false });
  if (desde) q = q.gte("dia", desde);
  if (ate) q = q.lte("dia", ate);
  const { data, error } = await q;
  if (error) throw new Error(`Erro ao carregar mudanças: ${error.message}`);
  type Linha = { id: number; dia: string; descricao: string; funil_etapas: { nome: string } | null };
  return ((data ?? []) as unknown as Linha[]).map((m) => ({ id: Number(m.id), dia: String(m.dia), etapa: m.funil_etapas?.nome ?? null, descricao: m.descricao }));
}
