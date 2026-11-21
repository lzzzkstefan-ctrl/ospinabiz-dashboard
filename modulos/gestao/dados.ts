// Leitura da central de gestão (fase 2): Hoje, Projetos e Decisões. Lê com o login de quem abriu
// (o RLS só libera para a gestão). Contexto em docs/modulos/gestao.md.

import { createClient } from "@/lib/supabase/server";
import { ehTamanho, ehTipoRegistro, XP_AUTOMATICO, xpDoTamanho, type Evento } from "./progresso";
import { segundaDa, somarDias, somarVendas, type Coluna, type Investimento, type LinkBloco, type Numeros, type Remuneracao, type StatusBloco, type StatusDecisao, type StatusFrente, type TipoBloco, type TipoOferta } from "./regras";

export type Pessoa = { id: number; nome: string };
export type Frente = { id: number; slug: string; nome: string; status: StatusFrente };

function erro(onde: string, e: { message: string } | null): void {
  if (e) throw new Error(`Erro ao carregar ${onde}: ${e.message}`);
}

/** Pessoas ativas da equipe (sem o usuário de teste), para dono e responsável. */
export async function listarPessoas(): Promise<Pessoa[]> {
  const db = await createClient();
  const { data, error } = await db.from("equipe").select("id, nome, ativo, teste").order("nome");
  erro("a equipe", error);
  return (data ?? []).filter((p) => p.ativo && !p.teste).map((p) => ({ id: Number(p.id), nome: String(p.nome) }));
}

export async function listarFrentes(): Promise<Frente[]> {
  const db = await createClient();
  const { data, error } = await db.from("frentes").select("id, slug, nome, status").order("ordem");
  erro("as frentes", error);
  return (data ?? []).map((f) => ({ ...f, id: Number(f.id) }) as Frente);
}

// ---------------------------------------------------------------------------
// Hoje
// ---------------------------------------------------------------------------
export type Prioridade = { id: number; titulo: string; descricao: string | null; dono_id: number | null; prazo: string | null; concluida_em: string | null; ordem: number };

export async function prioridadesDaSemana(semana: string): Promise<Prioridade[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("prioridades")
    .select("id, titulo, descricao, dono_id, prazo, concluida_em, ordem")
    .eq("semana", semana)
    .order("ordem")
    .order("id");
  erro("as prioridades", error);
  return (data ?? []).map((p) => ({ ...p, id: Number(p.id), dono_id: p.dono_id == null ? null : Number(p.dono_id) }));
}

export type NumerosSemana = Investimento & { origem: "manual" | "prime"; atualizado_em: string | null };

export async function numerosDaSemana(semana: string): Promise<NumerosSemana> {
  const db = await createClient();
  const { data, error } = await db.from("numeros_semana").select("investimento, cpl, leads, origem, atualizado_em").eq("semana", semana).maybeSingle();
  erro("os números da semana", error);
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { investimento: n(data?.investimento), cpl: n(data?.cpl), leads: n(data?.leads), origem: (data?.origem as "manual" | "prime") ?? "manual", atualizado_em: data?.atualizado_em ?? null };
}

/**
 * Vendas e faturamento líquido de hoje e da semana, da tabela de vendas atual. Conta só venda paga,
 * fora de teste e já confirmada. Líquido = o que a Hubla repassa da fatura (receita_liquida); sem ele
 * (venda manual), o líquido do Viral ou o do ticket.
 */
export async function vendasDaSemana(hoje: string): Promise<Numeros> {
  const segunda = segundaDa(hoje);
  const db = await createClient();
  const { data, error } = await db
    .from("vendas")
    .select("data, status, teste, aguardando_confirmacao, receita_liquida, viral_liquido, snap_liquido")
    .gte("data", segunda)
    .lte("data", hoje)
    .eq("status", "pago");
  erro("as vendas", error);
  const n = (v: unknown) => (v == null ? null : Number(v));
  const vendas = (data ?? [])
    .filter((v) => !v.teste && !v.aguardando_confirmacao)
    .map((v) => ({ data: String(v.data), liquido: n(v.receita_liquida) ?? n(v.viral_liquido) ?? n(v.snap_liquido) ?? 0 }));
  return somarVendas(vendas, hoje, segunda);
}

export type DecisaoResumo = { id: number; data: string; decisao: string; quem_id: number | null };

export async function decisoesPendentes(): Promise<DecisaoResumo[]> {
  const db = await createClient();
  const { data, error } = await db.from("decisoes").select("id, data, decisao, quem_id").eq("status", "pendente").order("data").order("id");
  erro("as decisões", error);
  return (data ?? []).map((d) => ({ ...d, id: Number(d.id), quem_id: d.quem_id == null ? null : Number(d.quem_id) }));
}

export type Prazo = { tipo: "iniciativa" | "item"; id: number; iniciativaId: number; titulo: string; deQue: string | null; prazo: string; quem_id: number | null };

/** O que vence de hoje até daqui a 7 dias (e o que já passou e não foi feito), de Projetos. */
export async function prazosDaSemana(hoje: string): Promise<Prazo[]> {
  const ate = somarDias(hoje, 7);
  const db = await createClient();
  const [ini, itens] = await Promise.all([
    db.from("iniciativas").select("id, titulo, prazo, dono_id, coluna").not("prazo", "is", null).lte("prazo", ate).in("coluna", ["ideia", "planejando", "andamento"]),
    db.from("iniciativa_itens").select("id, texto, prazo, responsavel_id, iniciativa:iniciativa_id(id, titulo)").not("prazo", "is", null).lte("prazo", ate).is("feito_em", null),
  ]);
  erro("os prazos", ini.error ?? itens.error);
  const lista: Prazo[] = [
    ...(ini.data ?? []).map((i) => ({ tipo: "iniciativa" as const, id: Number(i.id), iniciativaId: Number(i.id), titulo: i.titulo, deQue: null, prazo: i.prazo!, quem_id: i.dono_id == null ? null : Number(i.dono_id) })),
    ...(itens.data ?? []).map((i) => {
      const ini = i.iniciativa as unknown as { id: number; titulo: string } | null;
      return { tipo: "item" as const, id: Number(i.id), iniciativaId: Number(ini?.id), titulo: i.texto, deQue: ini?.titulo ?? null, prazo: i.prazo!, quem_id: i.responsavel_id == null ? null : Number(i.responsavel_id) };
    }),
  ];
  return lista.sort((a, b) => a.prazo.localeCompare(b.prazo));
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------
export type Item = { id: number; texto: string; responsavel_id: number | null; prazo: string | null; feito_em: string | null; ordem: number };
export type Link = { id: number; titulo: string; url: string };
export type Comentario = { id: number; texto: string; criado_em: string; autor: string; meu: boolean };
export type Iniciativa = {
  id: number;
  titulo: string;
  frente_id: number | null;
  objetivo: string | null;
  dono_id: number | null;
  prazo: string | null;
  coluna: Coluna;
  ordem: number;
  itens: Item[];
  links: Link[];
  comentarios: Comentario[];
};

export async function carregarIniciativas(usuarioId: string): Promise<Iniciativa[]> {
  const db = await createClient();
  const [ini, itens, links, coms, equipe] = await Promise.all([
    db.from("iniciativas").select("id, titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem").order("ordem"),
    db.from("iniciativa_itens").select("id, iniciativa_id, texto, responsavel_id, prazo, feito_em, ordem").order("ordem").order("id"),
    db.from("iniciativa_links").select("id, iniciativa_id, titulo, url").order("id"),
    db.from("iniciativa_comentarios").select("id, iniciativa_id, texto, criado_em, autor_id").order("criado_em"),
    db.from("equipe").select("nome, usuario_id"),
  ]);
  erro("os projetos", ini.error ?? itens.error ?? links.error ?? coms.error ?? equipe.error);
  const nomeDo = new Map((equipe.data ?? []).filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), String(p.nome)]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return (ini.data ?? []).map((i) => {
    const id = Number(i.id);
    return {
      ...i,
      id,
      frente_id: num(i.frente_id),
      dono_id: num(i.dono_id),
      coluna: i.coluna as Coluna,
      ordem: Number(i.ordem),
      itens: (itens.data ?? []).filter((x) => Number(x.iniciativa_id) === id).map((x) => ({ id: Number(x.id), texto: x.texto, responsavel_id: num(x.responsavel_id), prazo: x.prazo, feito_em: x.feito_em, ordem: Number(x.ordem) })),
      links: (links.data ?? []).filter((x) => Number(x.iniciativa_id) === id).map((x) => ({ id: Number(x.id), titulo: x.titulo, url: x.url })),
      comentarios: (coms.data ?? [])
        .filter((x) => Number(x.iniciativa_id) === id)
        .map((x) => ({ id: Number(x.id), texto: x.texto, criado_em: x.criado_em, autor: (x.autor_id && nomeDo.get(String(x.autor_id))) || "alguém", meu: x.autor_id === usuarioId })),
    };
  });
}

// ---------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------
export type Decisao = {
  id: number;
  data: string;
  decisao: string;
  porque: string | null;
  quem_id: number | null;
  frente_id: number | null;
  iniciativa_id: number | null;
  status: StatusDecisao;
};
export type ItemPauta = {
  id: number;
  assunto: string;
  detalhe: string | null;
  criado_em: string;
  autor: string;
  resolvido_em: string | null;
  virou: "decisao" | "tarefa" | "descartado" | null;
};

export async function carregarDecisoes(): Promise<{ decisoes: Decisao[]; pauta: ItemPauta[] }> {
  const db = await createClient();
  const [dec, pauta, equipe] = await Promise.all([
    db.from("decisoes").select("id, data, decisao, porque, quem_id, frente_id, iniciativa_id, status").order("data", { ascending: false }).order("id", { ascending: false }),
    // abertos + os resolvidos dos últimos 14 dias (para ver o que a reunião fez)
    db
      .from("pauta_itens")
      .select("id, assunto, detalhe, criado_em, criado_por, resolvido_em, virou")
      .or(`resolvido_em.is.null,resolvido_em.gte.${new Date(Date.now() - 14 * 86_400_000).toISOString()}`)
      .order("criado_em"),
    db.from("equipe").select("nome, usuario_id"),
  ]);
  erro("as decisões", dec.error ?? pauta.error ?? equipe.error);
  const nomeDo = new Map((equipe.data ?? []).filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), String(p.nome)]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    decisoes: (dec.data ?? []).map((d) => ({ ...d, id: Number(d.id), quem_id: num(d.quem_id), frente_id: num(d.frente_id), iniciativa_id: num(d.iniciativa_id), status: d.status as StatusDecisao })),
    pauta: (pauta.data ?? []).map((p) => ({
      id: Number(p.id),
      assunto: p.assunto,
      detalhe: p.detalhe,
      criado_em: p.criado_em,
      autor: (p.criado_por && nomeDo.get(String(p.criado_por))) || "alguém",
      resolvido_em: p.resolvido_em,
      virou: p.virou as ItemPauta["virou"],
    })),
  };
}

/** Só o título de cada iniciativa (para ligar decisão e mandar item da pauta para um projeto). */
export async function listarIniciativasCurtas(): Promise<{ id: number; titulo: string; frente_id: number | null }[]> {
  const db = await createClient();
  const { data, error } = await db.from("iniciativas").select("id, titulo, frente_id").order("titulo");
  erro("as iniciativas", error);
  return (data ?? []).map((i) => ({ id: Number(i.id), titulo: i.titulo, frente_id: i.frente_id == null ? null : Number(i.frente_id) }));
}

// ---------------------------------------------------------------------------
// Frentes (fase 3)
// ---------------------------------------------------------------------------
const num = (v: unknown) => (v == null ? null : Number(v));

export type Oferta = { id: number; ordem: number; tipo: TipoOferta; nome: string; preco: number | null; preco_ate: number | null; condicao: string | null; conversao: number | null };
export type Influencer = {
  id: number;
  nome: string;
  arroba: string | null;
  nicho: string | null;
  seguidores: number | null;
  contato: string | null;
  custo: number | null;
  remuneracao: Remuneracao | null;
  link: string | null;
  cupom: string | null;
  vendas: number | null;
  vendas_origem: "manual" | "prime";
  notas: string | null;
};
export type FrenteCompleta = Frente & {
  objetivo: string | null;
  meta_mensal: number | null;
  publico: string | null;
  canal: string | null;
  estrategia: string | null;
  notas: string | null;
  linha_vendas: "gcs" | "viral" | null;
  ofertas: Oferta[];
  influencers: Influencer[];
  mapa: { id: number; slug: string; nome: string } | null;
};

export async function carregarFrentes(): Promise<FrenteCompleta[]> {
  const db = await createClient();
  const [fr, of, inf, ma] = await Promise.all([
    db.from("frentes").select("id, slug, nome, status, objetivo, meta_mensal, publico, canal, estrategia, notas, linha_vendas").order("ordem"),
    db.from("ofertas").select("id, frente_id, ordem, tipo, nome, preco, preco_ate, condicao, conversao").order("ordem").order("id"),
    db.from("frente_influencers").select("*").order("ordem").order("id"),
    db.from("mapas").select("id, slug, nome, frente_id").not("frente_id", "is", null),
  ]);
  erro("as frentes", fr.error ?? of.error ?? inf.error ?? ma.error);
  return (fr.data ?? []).map((f) => {
    const id = Number(f.id);
    const m = (ma.data ?? []).find((x) => Number(x.frente_id) === id);
    return {
      ...f,
      id,
      status: f.status as StatusFrente,
      meta_mensal: num(f.meta_mensal),
      linha_vendas: f.linha_vendas as FrenteCompleta["linha_vendas"],
      ofertas: (of.data ?? [])
        .filter((o) => Number(o.frente_id) === id)
        .map((o) => ({ id: Number(o.id), ordem: o.ordem, tipo: o.tipo as TipoOferta, nome: o.nome, preco: num(o.preco), preco_ate: num(o.preco_ate), condicao: o.condicao, conversao: num(o.conversao) })),
      influencers: (inf.data ?? [])
        .filter((x) => Number(x.frente_id) === id)
        .map((x) => ({ ...x, id: Number(x.id), seguidores: num(x.seguidores), custo: num(x.custo), vendas: num(x.vendas) }) as Influencer),
      mapa: m ? { id: Number(m.id), slug: m.slug, nome: m.nome } : null,
    };
  });
}

/** Vendas pagas (sem teste, confirmadas) e líquido do mês por linha (gcs/viral), para meta x real. */
export async function vendasDoMesPorLinha(hoje: string): Promise<Record<"gcs" | "viral", { vendas: number; liquido: number }>> {
  const inicio = `${hoje.slice(0, 7)}-01`;
  const db = await createClient();
  const { data, error } = await db
    .from("vendas")
    .select("linha, teste, aguardando_confirmacao, receita_liquida, viral_liquido, snap_liquido")
    .gte("data", inicio)
    .lte("data", hoje)
    .eq("status", "pago");
  erro("as vendas do mês", error);
  const r = { gcs: { vendas: 0, liquido: 0 }, viral: { vendas: 0, liquido: 0 } };
  for (const v of data ?? []) {
    if (v.teste || v.aguardando_confirmacao) continue;
    const linha = v.linha === "viral" ? "viral" : "gcs";
    r[linha].vendas++;
    r[linha].liquido += num(v.receita_liquida) ?? num(v.viral_liquido) ?? num(v.snap_liquido) ?? 0;
  }
  return r;
}

/** Iniciativas de uma frente que ainda não estão no ar (os próximos passos). */
export async function proximosPassos(frenteId: number): Promise<{ id: number; titulo: string; coluna: Coluna; prazo: string | null; feitos: number; total: number }[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("iniciativas")
    .select("id, titulo, coluna, prazo, ordem, itens:iniciativa_itens(feito_em)")
    .eq("frente_id", frenteId)
    .in("coluna", ["ideia", "planejando", "andamento"])
    .order("ordem");
  erro("os próximos passos", error);
  const peso: Record<string, number> = { andamento: 0, planejando: 1, ideia: 2 };
  return (data ?? [])
    .map((i) => {
      const itens = (i.itens ?? []) as { feito_em: string | null }[];
      return { id: Number(i.id), titulo: i.titulo, coluna: i.coluna as Coluna, prazo: i.prazo, feitos: itens.filter((x) => x.feito_em).length, total: itens.length };
    })
    .sort((a, b) => peso[a.coluna] - peso[b.coluna]);
}

// ---------------------------------------------------------------------------
// Funis desenhados (fase 3)
// ---------------------------------------------------------------------------
export type Mapa = { id: number; slug: string; nome: string; frente_id: number | null; figma_url: string | null; viewport: { x: number; y: number; zoom: number } | null };
export type Bloco = {
  id: number;
  nome: string;
  tipo: TipoBloco;
  status: StatusBloco;
  preco: number | null;
  preco_ate: number | null;
  numero: number | null;
  numero_origem: "manual" | "prime";
  nota: string | null;
  links: LinkBloco[];
  abre_mapa_id: number | null;
  pos_x: number;
  pos_y: number;
};
export type Ligacao = { id: number; de: number; para: number; rotulo: string | null };

export async function listarMapas(): Promise<Mapa[]> {
  const db = await createClient();
  const { data, error } = await db.from("mapas").select("id, slug, nome, frente_id, figma_url, viewport").order("ordem");
  erro("os funis", error);
  return (data ?? []).map((m) => ({ ...m, id: Number(m.id), frente_id: num(m.frente_id) }) as Mapa);
}

export async function carregarMapa(mapaId: number): Promise<{ blocos: Bloco[]; ligacoes: Ligacao[] }> {
  const db = await createClient();
  const [b, l] = await Promise.all([
    db.from("mapa_blocos").select("id, nome, tipo, status, preco, preco_ate, numero, numero_origem, nota, links, abre_mapa_id, pos_x, pos_y").eq("mapa_id", mapaId).order("id"),
    db.from("mapa_ligacoes").select("id, de_bloco_id, para_bloco_id, rotulo").eq("mapa_id", mapaId).order("id"),
  ]);
  erro("o funil", b.error ?? l.error);
  return {
    blocos: (b.data ?? []).map(
      (x) =>
        ({
          ...x,
          id: Number(x.id),
          preco: num(x.preco),
          preco_ate: num(x.preco_ate),
          numero: num(x.numero),
          abre_mapa_id: num(x.abre_mapa_id),
          pos_x: Number(x.pos_x),
          pos_y: Number(x.pos_y),
          links: Array.isArray(x.links) ? (x.links as LinkBloco[]) : [],
        }) as Bloco,
    ),
    ligacoes: (l.data ?? []).map((x) => ({ id: Number(x.id), de: Number(x.de_bloco_id), para: Number(x.para_bloco_id), rotulo: x.rotulo })),
  };
}


// ---------------------------------------------------------------------------
// Progresso (21/11/2026): o que foi feito, dia a dia, com XP. Junta os registros digitados com o que
// já aconteceu nas outras abas (itens de projeto feitos, prioridades concluídas, decisões tomadas)
// e as vendas do dia como resultado.
// ---------------------------------------------------------------------------
export type DadosProgresso = {
  eventos: Evento[];
  vendasPorDia: Record<string, { vendas: number; liquido: number }>;
  desde: string;
};

/** Dia em Brasília de um timestamp. */
function diaSP(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}

export async function carregarProgresso(hoje: string, usuarioId: string): Promise<DadosProgresso> {
  const desde = somarDias(hoje, -7 * 18);
  const inicioTs = `${desde}T00:00:00-03:00`;
  const db = await createClient();
  const [eq, regs, itens, prios, decs, vendas] = await Promise.all([
    db.from("equipe").select("id, nome, usuario_id"),
    db.from("registros").select("id, data, titulo, resultado, tipo, tamanho, link, autor_id").gte("data", desde).order("criado_em", { ascending: false }),
    db.from("iniciativa_itens").select("id, texto, feito_em, responsavel_id, iniciativas (titulo)").gte("feito_em", inicioTs),
    db.from("prioridades").select("id, titulo, concluida_em, dono_id").gte("concluida_em", inicioTs),
    db.from("decisoes").select("id, data, decisao, quem_id, criado_por").eq("status", "decidido").gte("data", desde),
    db.from("vendas").select("data, status, teste, aguardando_confirmacao, receita_liquida, viral_liquido, snap_liquido").gte("data", desde).lte("data", hoje).eq("status", "pago"),
  ]);
  erro("a equipe", eq.error);
  // sem a tabela ainda (migration não rodou), o resto do Progresso funciona com o que já existe
  if (regs.error) console.error("[progresso] registros:", regs.error.code, regs.error.message);
  erro("os itens de projeto", itens.error);
  erro("as prioridades", prios.error);
  erro("as decisões", decs.error);
  erro("as vendas", vendas.error);

  const pessoas = (eq.data ?? []).map((p) => ({ id: Number(p.id), nome: String(p.nome), usuario: p.usuario_id as string | null }));
  const nomePorUsuario = (u: string | null) => pessoas.find((p) => u && p.usuario === u)?.nome ?? null;
  const nomePorId = (id: unknown) => (id == null ? null : (pessoas.find((p) => p.id === Number(id))?.nome ?? null));
  const meuId = pessoas.find((p) => p.usuario === usuarioId)?.id ?? null;
  const ehMeu = (id: unknown) => meuId != null && id != null && Number(id) === meuId;

  const eventos: Evento[] = [];
  for (const r of regs.data ?? []) {
    const tamanho = ehTamanho(r.tamanho) ? r.tamanho : "m";
    eventos.push({
      chave: `r${r.id}`,
      dia: String(r.data),
      titulo: String(r.titulo),
      resultado: r.resultado ?? null,
      origem: "registro",
      tipo: ehTipoRegistro(r.tipo) ? r.tipo : "entrega",
      tamanho,
      xp: xpDoTamanho(tamanho),
      link: r.link ?? null,
      quem: nomePorUsuario(r.autor_id),
      meu: r.autor_id === usuarioId,
      registroId: Number(r.id),
    });
  }
  for (const i of itens.data ?? []) {
    if (!i.feito_em) continue;
    const ini = Array.isArray(i.iniciativas) ? i.iniciativas[0] : i.iniciativas;
    eventos.push({
      chave: `i${i.id}`,
      dia: diaSP(i.feito_em),
      titulo: String(i.texto),
      resultado: ini?.titulo ? `Avançou o projeto "${ini.titulo}"` : null,
      origem: "projeto",
      tipo: null,
      tamanho: null,
      xp: XP_AUTOMATICO.projeto,
      link: null,
      quem: nomePorId(i.responsavel_id),
      meu: ehMeu(i.responsavel_id),
      registroId: null,
    });
  }
  for (const p of prios.data ?? []) {
    if (!p.concluida_em) continue;
    eventos.push({
      chave: `p${p.id}`,
      dia: diaSP(p.concluida_em),
      titulo: String(p.titulo),
      resultado: "Prioridade da semana concluída",
      origem: "prioridade",
      tipo: null,
      tamanho: null,
      xp: XP_AUTOMATICO.prioridade,
      link: null,
      quem: nomePorId(p.dono_id),
      meu: ehMeu(p.dono_id),
      registroId: null,
    });
  }
  for (const d of decs.data ?? []) {
    eventos.push({
      chave: `d${d.id}`,
      dia: String(d.data),
      titulo: String(d.decisao),
      resultado: "Decisão tomada",
      origem: "decisao",
      tipo: null,
      tamanho: null,
      xp: XP_AUTOMATICO.decisao,
      link: `/decisoes?d=${d.id}`,
      quem: nomePorId(d.quem_id) ?? nomePorUsuario(d.criado_por),
      meu: d.quem_id != null ? ehMeu(d.quem_id) : d.criado_por === usuarioId,
      registroId: null,
    });
  }

  const n = (v: unknown) => (v == null ? null : Number(v));
  const vendasPorDia: DadosProgresso["vendasPorDia"] = {};
  for (const v of vendas.data ?? []) {
    if (v.teste || v.aguardando_confirmacao) continue;
    const dia = String(v.data);
    const atual = (vendasPorDia[dia] ??= { vendas: 0, liquido: 0 });
    atual.vendas++;
    atual.liquido += n(v.receita_liquida) ?? n(v.viral_liquido) ?? n(v.snap_liquido) ?? 0;
  }

  return { eventos, vendasPorDia, desde };
}
