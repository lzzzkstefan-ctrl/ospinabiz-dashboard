// Uma rodada de sincronização do Funil (chamada pelo pg_cron a cada 15 min).
// Estratégia em docs/modulos/funil.md ("Decisões"). Resumo:
//   1. etiquetas, atendentes e números da Data Crazy → tabelas de configuração
//   2. leads da janela (01/09/2026 ou 90 dias atrás, o mais recente): novo ou com
//      etiqueta diferente = histórico pendente
//   3. conversas (da última mensagem para trás, até o início da janela): vendedor, número e chegada
//      (dia do lead = 1ª conversa dele; contato novo sem etiqueta também conta, ver "Donos")
//   4. histórico dos pendentes (1 chamada por lead), até o prazo; o resto fica para a próxima
//   5. compra e downsell, cruzando com as vendas da Hubla (só banco, sem API)
//   6. mensagens enviadas (custo do WhatsApp): metadados, etapa no envio e grátis/cobrada; custo real da Meta
// Usa a chave secreta (roda só no servidor). Grava uma linha em funil_sincronizacoes.

import { createAdminClient } from "@/lib/supabase/admin";
import { DataCrazy, PrazoEsgotado, type DcConversa, type DcEventoHistorico, type DcLead, type DcMensagem } from "@/lib/integracoes/datacrazy";
import { custoDaWaba } from "@/lib/integracoes/meta";
import {
  INICIO_DO_CUSTO,
  chaveTelefone,
  decidirCompra,
  diaSP,
  downsellDosItens,
  entregaDaMensagem,
  inicioDaJanela,
  origemDaMensagem,
  tipoDaMensagem,
  mesmasEtiquetas,
  nomeDaEtiqueta,
  soDigitos,
} from "./regras";

type Db = ReturnType<typeof createAdminClient>;

/** Tempo de trabalho por rodada. A rota tem maxDuration = 300 s; sobra folga para fechar. */
const ORCAMENTO_MS = 230_000;
/** Uma rodada "rodando" mais nova que isso bloqueia outra (evita duas ao mesmo tempo). */
const RODADA_TRAVADA_MS = 6 * 60_000;
const LOTE = 500;

export type ResultadoSincronizacao =
  | { situacao: "ok"; chamadas: number; leads: number; historicos: number; pendentes: number }
  | { situacao: "ocupado" }
  | { situacao: "falhou"; erro: string };

export async function sincronizarFunil(): Promise<ResultadoSincronizacao> {
  const db = createAdminClient();
  const inicio = Date.now();

  const rodadaId = await abrirRodada(db, inicio);
  if (rodadaId === null) return { situacao: "ocupado" };

  const dc = DataCrazy.doAmbiente(inicio + ORCAMENTO_MS);
  const contagem = { leads: 0, historicos: 0, pendentes: 0 };

  try {
    const janela = inicioDaJanela(inicio).toISOString();

    const config = await sincronizarConfiguracao(db, dc);
    const internos = await lerNumerosInternos(db);
    const leads = await lerLeadsDaJanela(dc, janela);
    contagem.leads = leads.length;
    const lidas = await lerConversas(dc, janela);
    // todas as conversas com mensagem na janela (inclusive de lead antigo): base dos "esperando"
    const todas = lidas.filter((c) => (c.lastMessageDate ?? "") >= janela);
    const donos = montarDonos(leads, lidas, janela, await lerMarcadorDeChegada(db));
    await gravarLeads(db, leads, janela, internos, donos);
    await gravarSemEtiqueta(db, lidas, donos, config, internos);
    await sincronizarConversas(db, lidas, leads, donos, janela, config);
    await gravarConversas(db, todas, donos, config, internos);
    contagem.historicos = await lerHistoricos(db, dc, config);
    await lerPrimeirasRespostas(db, dc, todas, donos, config);
    await lerMensagensEnviadas(db, dc, todas);
    await atualizarCompras(db, janela);
    await recalcularCusto(db);
    await lerCustoDaMeta(db);

    contagem.pendentes = await contar(db.from("funil_leads").select("dc_id", { count: "exact", head: true }).eq("historico_pendente", true));

    await fecharRodada(db, rodadaId, { situacao: "ok", erro: null, chamadas: dc.chamadas, ...contagem });
    return { situacao: "ok", chamadas: dc.chamadas, ...contagem };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await fecharRodada(db, rodadaId, { situacao: "falhou", erro, chamadas: dc.chamadas, ...contagem });
    return { situacao: "falhou", erro };
  }
}

// ---------------------------------------------------------------------------
// Rodada (funil_sincronizacoes)
// ---------------------------------------------------------------------------

async function abrirRodada(db: Db, inicio: number): Promise<number | null> {
  const limite = new Date(inicio - RODADA_TRAVADA_MS).toISOString();

  // rodada "rodando" antiga = morreu no meio (ex.: tempo da Vercel): marca como falha
  await db
    .from("funil_sincronizacoes")
    .update({ situacao: "falhou", erro: "interrompida antes de terminar", terminada_em: new Date().toISOString() })
    .eq("situacao", "rodando")
    .lt("iniciada_em", limite);

  const emCurso = await contar(
    db.from("funil_sincronizacoes").select("id", { count: "exact", head: true }).eq("situacao", "rodando"),
  );
  if (emCurso > 0) return null;

  const { data, error } = await db.from("funil_sincronizacoes").insert({}).select("id").single();
  if (error) throw new Error(`erro ao abrir a rodada: ${error.message}`);
  return data.id;
}

async function fecharRodada(
  db: Db,
  id: number,
  r: { situacao: "ok" | "falhou"; erro: string | null; chamadas: number; leads: number; historicos: number; pendentes: number },
) {
  await db
    .from("funil_sincronizacoes")
    .update({
      situacao: r.situacao,
      erro: r.erro,
      terminada_em: new Date().toISOString(),
      chamadas: r.chamadas,
      leads_lidos: r.leads,
      historicos_lidos: r.historicos,
      pendentes: r.pendentes,
    })
    .eq("id", id);
}

// ---------------------------------------------------------------------------
// 1. Configuração: etiquetas (com todos os nomes já vistos), atendentes e números
// ---------------------------------------------------------------------------

type Config = {
  /** nome normalizado → id da etiqueta (inclui nomes antigos) */
  etiquetaPorNome: Map<string, string>;
  /** id do atendente na Data Crazy → pessoa da equipe (ou null). Sem os de suporte. */
  equipeDoAtendente: Map<string, number | null>;
  /** só atendentes que podem ser vendedor (sem os de suporte) */
  atendentePorNome: Map<string, string>;
  numeros: Set<string>;
  numeroPorNome: Map<string, string>;
};

async function sincronizarConfiguracao(db: Db, dc: DataCrazy): Promise<Config> {
  const agora = new Date().toISOString();

  const etiquetas = await dc.etiquetas();
  if (etiquetas.length) {
    // só estas colunas: etapa_id e pagou_fora_hubla são do admin e não mudam aqui
    await ok(
      db.from("funil_etiquetas").upsert(
        etiquetas.map((t) => ({ dc_id: t.id, nome: nomeDaEtiqueta(t.name), cor: t.color ?? null, existe: true, visto_em: agora, atualizado_em: agora })),
        { onConflict: "dc_id" },
      ),
    );
    await ok(
      db
        .from("funil_etiquetas")
        .update({ existe: false, atualizado_em: agora })
        .eq("existe", true)
        .not("dc_id", "in", `(${etiquetas.map((t) => `"${t.id}"`).join(",")})`),
    );
    await ok(
      db.from("funil_etiquetas_nomes").upsert(
        etiquetas.map((t) => ({ etiqueta_dc_id: t.id, nome: nomeDaEtiqueta(t.name), visto_em: agora })),
        { onConflict: "etiqueta_dc_id,nome", ignoreDuplicates: true },
      ),
    );
  }

  const atendentes = await dc.atendentes();
  if (atendentes.length) {
    await ok(
      db.from("funil_atendentes").upsert(
        atendentes.map((a) => ({ dc_id: a.id, nome: a.name.trim(), visto_em: agora })),
        { onConflict: "dc_id" },
      ),
    );
  }

  const instancias = await dc.instancias();
  if (instancias.length) {
    await ok(
      db.from("funil_numeros").upsert(
        instancias.map((i) => ({ dc_id: i.id, nome: i.name.trim(), waba_id: i.config?.wabaId ?? null, visto_em: agora })),
        { onConflict: "dc_id" },
      ),
    );
  }

  // Nomes: os atuais têm prioridade sobre os antigos (se um nome antigo foi reaproveitado).
  const nomes = await lerTudo<{ etiqueta_dc_id: string; nome: string }>((de, ate) =>
    db.from("funil_etiquetas_nomes").select("etiqueta_dc_id, nome").order("visto_em").range(de, ate),
  );
  const etiquetaPorNome = new Map<string, string>();
  for (const n of nomes) etiquetaPorNome.set(nomeDaEtiqueta(n.nome), n.etiqueta_dc_id);
  for (const t of etiquetas) etiquetaPorNome.set(nomeDaEtiqueta(t.name), t.id);

  // atendente de suporte (equipe da Data Crazy) nunca é vendedor: fica fora dos mapas
  const vinculos = (
    await lerTudo<{ dc_id: string; nome: string; equipe_id: number | null; suporte_dc: boolean }>((de, ate) =>
      db.from("funil_atendentes").select("dc_id, nome, equipe_id, suporte_dc").order("dc_id").range(de, ate),
    )
  ).filter((a) => !a.suporte_dc);
  const numerosDb = await lerTudo<{ dc_id: string; nome: string }>((de, ate) =>
    db.from("funil_numeros").select("dc_id, nome").order("dc_id").range(de, ate),
  );

  return {
    etiquetaPorNome,
    equipeDoAtendente: new Map(vinculos.map((a) => [a.dc_id, a.equipe_id])),
    atendentePorNome: new Map(vinculos.map((a) => [a.nome.trim().toLowerCase(), a.dc_id])),
    numeros: new Set(numerosDb.map((n) => n.dc_id)),
    numeroPorNome: new Map(numerosDb.map((n) => [n.nome.trim().toLowerCase(), n.dc_id])),
  };
}

// ---------------------------------------------------------------------------
// 2. Leads da janela
// ---------------------------------------------------------------------------

/**
 * Lê todos os leads criados desde `janela`. A lista vem do mais novo para o mais
 * antigo; em vez de `skip` (que para em 10.000), anda com o "criado até" para trás.
 */
async function lerLeadsDaJanela(dc: DataCrazy, janela: string): Promise<DcLead[]> {
  const vistos = new Map<string, DcLead>();
  let ate = new Date(Date.now() + 60_000).toISOString();

  for (;;) {
    const pagina = await dc.leads(janela, ate, LOTE);
    let novos = 0;
    for (const l of pagina) {
      if (!vistos.has(l.id)) {
        vistos.set(l.id, l);
        novos++;
      }
    }
    if (pagina.length < LOTE || novos === 0) break;
    ate = pagina[pagina.length - 1].createdAt;
  }
  return [...vistos.values()];
}

/**
 * Números internos (teste), pelos 8 últimos dígitos. Ficam fora de toda a dashboard do Funil:
 * a sincronização marca `interno` nos leads e conversas e as telas filtram.
 */
async function lerNumerosInternos(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from("funil_numeros_internos").select("chave");
  if (error) throw new Error(`erro ao ler números internos: ${error.message}`);
  return new Set(data.map((n) => String(n.chave)));
}

/** Algum dos telefones é de um número interno (compara os 8 últimos dígitos). */
function ehInterno(internos: Set<string>, ...telefones: (string | null | undefined)[]): boolean {
  if (!internos.size) return false;
  return telefones.some((t) => {
    const chave = chaveTelefone(t);
    return !!chave && internos.has(chave);
  });
}

async function gravarLeads(db: Db, leads: DcLead[], janela: string, internos: Set<string>, donos: Donos) {
  const atuais = await lerTudo<{ dc_id: string; etiquetas_atuais: string[]; interno: boolean; criado_em: string }>((de, ate) =>
    db.from("funil_leads").select("dc_id, etiquetas_atuais, interno, criado_em").gte("criado_em", janela).order("dc_id").range(de, ate),
  );
  const noBanco = new Map(atuais.map((l) => [l.dc_id, l.etiquetas_atuais]));
  const internoNoBanco = new Map(atuais.map((l) => [l.dc_id, l.interno]));
  const criadoNoBanco = new Map(atuais.map((l) => [l.dc_id, l.criado_em]));
  const chegada = (l: DcLead) => donos.chegada.get(l.id) ?? l.createdAt;

  // novo ou com etiqueta diferente → grava e marca o histórico como pendente
  const mudaram = leads.filter((l) => {
    const antes = noBanco.get(l.id);
    return !antes || !mesmasEtiquetas(antes, l.tags.map((t) => t.id));
  });

  for (const lote of fatiar(mudaram, LOTE)) {
    await ok(
      db.from("funil_leads").upsert(
        lote.map((l) => ({
          dc_id: l.id,
          criado_em: chegada(l),
          dia: diaSP(chegada(l)),
          etiquetas_atuais: l.tags.map((t) => t.id),
          dc_atualizado_em: l.updatedAt ?? null,
          historico_pendente: true,
          sincronizado_em: new Date().toISOString(),
        })),
        { onConflict: "dc_id" },
      ),
    );
    await ok(
      db.from("funil_leads_contato").upsert(
        lote.map((l) => ({ lead_dc_id: l.id, nome: l.name?.trim() || null, telefone: soDigitos(l.rawPhone) })),
        { onConflict: "lead_dc_id" },
      ),
    );
  }

  // chegada mudou (a 1ª conversa apareceu depois do lead gravado): só a data, sem reler o histórico
  const mudouSoChegada = leads.filter((l) => !mudaram.includes(l) && criadoNoBanco.has(l.id) && !mesmoInstante(criadoNoBanco.get(l.id)!, chegada(l)));
  for (const lote of fatiar(mudouSoChegada, LOTE)) {
    await ok(db.from("funil_leads").upsert(lote.map((l) => ({ dc_id: l.id, criado_em: chegada(l), dia: diaSP(chegada(l)) })), { onConflict: "dc_id" }));
  }

  // número interno: marca/desmarca (cadastrar um número tira da contagem o que já foi contado)
  const trocar = leads
    .map((l) => ({ id: l.id, interno: ehInterno(internos, l.rawPhone, ...(l.contacts ?? []).map((c) => c.contactId)) }))
    .filter((l) => (internoNoBanco.get(l.id) ?? false) !== l.interno);
  for (const valor of [true, false]) {
    for (const lote of fatiar(trocar.filter((l) => l.interno === valor).map((l) => l.id), LOTE)) {
      await ok(db.from("funil_leads").update({ interno: valor }).in("dc_id", lote));
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Conversas (da última mensagem para trás, até o início da janela)
// ---------------------------------------------------------------------------

async function lerConversas(dc: DataCrazy, janela: string): Promise<DcConversa[]> {
  const lidas: DcConversa[] = [];
  for (let skip = 0; skip < 10_000; skip += 100) {
    const pagina = await dc.conversas(skip, 100);
    lidas.push(...pagina);
    const ultima = pagina[pagina.length - 1]?.lastMessageDate;
    if (pagina.length < 100 || !ultima || ultima < janela) break;
  }
  return lidas;
}

/** Prefixo do lead "sem etiqueta": contato novo que escreveu e ainda não virou lead na Data Crazy. */
const SEM_ETIQUETA = "contato:";

/**
 * De quem é cada conversa no funil (decisão do Davi, 11/10/2026: lead conta no dia da 1ª mensagem,
 * com ou sem etiqueta). Na Data Crazy o lead só existe depois que a automação põe a 1ª etiqueta
 * (às vezes horas depois). Então:
 * - contato com lead → o lead;
 * - contato NOVO (criado na janela) que escreveu e ainda não tem lead → linha "sem etiqueta" com
 *   id `contato:<id interno do contato>` (nunca o telefone). Quando o lead aparece, ela sai.
 * chegada = o que vier primeiro: a 1ª conversa (nasce com a 1ª mensagem do lead), a etiqueta de
 * chegada (CL, ver lerMarcadorDeChegada) ou a criação do lead. Conversa antiga de contato que voltou
 * (mais de 7 dias antes do lead) não puxa.
 */
type Donos = {
  leadDoContato: Map<string, DcLead>;
  idDoLead: (c: DcConversa) => string | null;
  /** id do lead (ou `contato:…`) → hora da chegada */
  chegada: Map<string, string>;
};

/**
 * Etiqueta de chegada (CL, automação "Contador de lead" na Data Crazy; decisão do Davi, 11/10/2026):
 * marca a chegada, não é etapa. Lead → 1ª vez que recebeu a CL (só a partir de etiqueta_chegada_desde,
 * porque a etiqueta foi reaproveitada). Datas lidas do histórico já gravado; lead novo entra na rodada
 * seguinte, depois que o histórico dele for lido.
 */
async function lerMarcadorDeChegada(db: Db): Promise<Map<string, string>> {
  const marcas = new Map<string, string>();
  const { data: cfg, error } = await db.from("funil_config").select("etiqueta_chegada_dc_id, etiqueta_chegada_desde").maybeSingle();
  if (error) throw new Error(`erro ao ler a etiqueta de chegada: ${error.message}`);
  if (!cfg?.etiqueta_chegada_dc_id) return marcas;
  const eventos = await lerTudo<{ lead_dc_id: string; em: string }>((de, ate) => {
    let q = db.from("funil_eventos").select("lead_dc_id, em").eq("etiqueta_dc_id", cfg.etiqueta_chegada_dc_id).eq("acao", "colocou");
    if (cfg.etiqueta_chegada_desde) q = q.gte("em", cfg.etiqueta_chegada_desde);
    return q.order("id").range(de, ate);
  });
  for (const e of eventos) {
    const atual = marcas.get(e.lead_dc_id);
    if (!atual || Date.parse(e.em) < Date.parse(atual)) marcas.set(e.lead_dc_id, e.em);
  }
  return marcas;
}

function montarDonos(leads: DcLead[], lidas: DcConversa[], janela: string, marcador: Map<string, string>): Donos {
  const leadDoContato = new Map<string, DcLead>();
  for (const l of leads) for (const c of l.contacts ?? []) if (c.contactId) leadDoContato.set(c.contactId, l);
  const leadDe = (c: DcConversa) => (c.contact?.contactId ? leadDoContato.get(c.contact.contactId) : undefined);

  // contatos novos sem lead que já mandaram mensagem
  const escreveu = new Set<string>();
  for (const c of lidas) {
    if (leadDe(c) || !c.contact?.id || (c.contact.createdAt ?? "") < janela || c.createdAt < janela) continue;
    if (c.lastReceivedMessageDate) escreveu.add(c.contact.id);
  }
  const idDoLead = (c: DcConversa) => {
    const lead = leadDe(c);
    if (lead) return lead.id;
    return c.contact?.id && escreveu.has(c.contact.id) ? SEM_ETIQUETA + c.contact.id : null;
  };

  const chegada = new Map<string, string>();
  for (const l of leads) chegada.set(l.id, l.createdAt);
  const porId = new Map(leads.map((l) => [l.id, l]));
  for (const c of lidas) {
    const id = idDoLead(c);
    if (!id || c.createdAt < janela) continue;
    const lead = porId.get(id);
    if (lead && Date.parse(c.createdAt) < Date.parse(lead.createdAt) - 7 * 86_400_000) continue;
    const atual = chegada.get(id);
    if (!atual || Date.parse(c.createdAt) < Date.parse(atual)) chegada.set(id, c.createdAt);
  }
  // etiqueta de chegada antes da 1ª conversa vista (ou sem conversa ainda): vale ela
  for (const [id, em] of marcador) {
    const atual = chegada.get(id);
    if (atual && Date.parse(em) < Date.parse(atual)) chegada.set(id, em);
  }
  return { leadDoContato, idDoLead, chegada };
}

/**
 * Leads "sem etiqueta" (contato novo que escreveu, sem lead na Data Crazy ainda): grava/atualiza a
 * linha `contato:…` em funil_leads (sem histórico: não há lead para ler) e apaga a de quem já virou lead.
 */
async function gravarSemEtiqueta(db: Db, lidas: DcConversa[], donos: Donos, config: Config, internos: Set<string>) {
  type Linha = {
    dc_id: string;
    criado_em: string;
    dia: string;
    atendente_dc_id: string | null;
    vendedor_id: number | null;
    numero_dc_id: string | null;
    etiquetas_atuais: string[];
    ultima_mensagem_em: string | null;
    interno: boolean;
  };
  const linhas = new Map<string, Linha & { numeroDesde: string; nome: string | null; telefone: string | null }>();
  const viraramLead = new Set<string>();
  // vem da mais recente para a mais antiga: o primeiro atendente visto é o atual
  for (const c of lidas) {
    const id = donos.idDoLead(c);
    if (!id) continue;
    if (!id.startsWith(SEM_ETIQUETA)) {
      if (c.contact?.id) viraramLead.add(SEM_ETIQUETA + c.contact.id);
      continue;
    }
    const chegada = donos.chegada.get(id) ?? c.createdAt;
    const l = linhas.get(id) ?? {
      dc_id: id,
      criado_em: chegada,
      dia: diaSP(chegada),
      atendente_dc_id: null,
      vendedor_id: null,
      numero_dc_id: null,
      numeroDesde: "9999",
      etiquetas_atuais: [...(c.contact?.externalInfo?.tagIds ?? [])].sort(),
      ultima_mensagem_em: null,
      interno: false,
      nome: c.contact?.name?.trim() || null,
      telefone: soDigitos(c.contact?.phoneNumber ?? c.contact?.contactId ?? null),
    };
    const atendente = c.attendants?.find((x) => config.equipeDoAtendente.has(x.id))?.id ?? null;
    if (!l.atendente_dc_id && atendente) {
      l.atendente_dc_id = atendente;
      l.vendedor_id = config.equipeDoAtendente.get(atendente) ?? null;
    }
    if (c.instance && config.numeros.has(c.instance.id) && c.createdAt < l.numeroDesde) {
      l.numero_dc_id = c.instance.id;
      l.numeroDesde = c.createdAt;
    }
    if (c.lastMessageDate && (!l.ultima_mensagem_em || c.lastMessageDate > l.ultima_mensagem_em)) l.ultima_mensagem_em = c.lastMessageDate;
    if (ehInterno(internos, c.contact?.phoneNumber, c.contact?.contactId)) l.interno = true;
    linhas.set(id, l);
  }

  const atuais = await lerTudo<Linha>((de, ate) =>
    db
      .from("funil_leads")
      .select("dc_id, criado_em, dia, atendente_dc_id, vendedor_id, numero_dc_id, etiquetas_atuais, ultima_mensagem_em, interno")
      .like("dc_id", `${SEM_ETIQUETA}%`)
      .order("dc_id")
      .range(de, ate),
  );
  const noBanco = new Map(atuais.map((l) => [l.dc_id, l]));

  const mudaram = [...linhas.values()].filter((l) => {
    const a = noBanco.get(l.dc_id);
    return (
      !a ||
      !mesmoInstante(a.criado_em, l.criado_em) ||
      a.atendente_dc_id !== l.atendente_dc_id ||
      a.numero_dc_id !== l.numero_dc_id ||
      a.interno !== l.interno ||
      !mesmoInstante(a.ultima_mensagem_em, l.ultima_mensagem_em) ||
      !mesmasEtiquetas(a.etiquetas_atuais, l.etiquetas_atuais)
    );
  });
  for (const lote of fatiar(mudaram, LOTE)) {
    await ok(
      db.from("funil_leads").upsert(
        lote.map((l) => ({
          dc_id: l.dc_id,
          criado_em: l.criado_em,
          dia: l.dia,
          atendente_dc_id: l.atendente_dc_id,
          vendedor_id: l.vendedor_id,
          numero_dc_id: l.numero_dc_id,
          etiquetas_atuais: l.etiquetas_atuais,
          ultima_mensagem_em: l.ultima_mensagem_em,
          interno: l.interno,
          historico_pendente: false,
          sincronizado_em: new Date().toISOString(),
        })),
        { onConflict: "dc_id" },
      ),
    );
    const novos = lote.filter((l) => !noBanco.has(l.dc_id));
    if (novos.length) {
      await ok(
        db.from("funil_leads_contato").upsert(
          novos.map((l) => ({ lead_dc_id: l.dc_id, nome: l.nome, telefone: l.telefone })),
          { onConflict: "lead_dc_id" },
        ),
      );
    }
  }

  // virou lead na Data Crazy: a linha "sem etiqueta" sai (o lead entra no mesmo dia, pela chegada)
  const apagar = atuais.filter((a) => viraramLead.has(a.dc_id)).map((a) => a.dc_id);
  for (const lote of fatiar(apagar, LOTE)) await ok(db.from("funil_leads").delete().in("dc_id", lote));
}

// ---------------------------------------------------------------------------
// 3a. Conversas → leads: vendedor (atendente da conversa mais recente) e número (da primeira conversa)
// ---------------------------------------------------------------------------

async function sincronizarConversas(db: Db, lidas: DcConversa[], leads: DcLead[], donos: Donos, janela: string, config: Config): Promise<void> {
  type Achado = { atendente: string | null; numero: string | null; numeroDesde: string; ultima: string | null };
  const achados = new Map<string, Achado>();

  for (const c of lidas) {
    const lead = c.contact?.contactId ? donos.leadDoContato.get(c.contact.contactId) : undefined;
    if (!lead) continue;
    const a = achados.get(lead.id) ?? { atendente: null, numero: null, numeroDesde: "9999", ultima: null };
    // vem da mais recente para a mais antiga: o primeiro atendente visto é o atual
    const atendente = c.attendants?.find((x) => config.equipeDoAtendente.has(x.id))?.id ?? null;
    if (!a.atendente && atendente) a.atendente = atendente;
    if (c.instance && config.numeros.has(c.instance.id) && c.createdAt < a.numeroDesde) {
      a.numero = c.instance.id;
      a.numeroDesde = c.createdAt;
    }
    if (c.lastMessageDate && (!a.ultima || c.lastMessageDate > a.ultima)) a.ultima = c.lastMessageDate;
    achados.set(lead.id, a);
  }
  if (!achados.size) return;

  const atuais = await lerTudo<{ dc_id: string; atendente_dc_id: string | null; numero_dc_id: string | null; ultima_mensagem_em: string | null }>(
    (de, ate) =>
      db.from("funil_leads").select("dc_id, atendente_dc_id, numero_dc_id, ultima_mensagem_em").gte("criado_em", janela).order("dc_id").range(de, ate),
  );
  const noBanco = new Map(atuais.map((l) => [l.dc_id, l]));
  const porId = new Map(leads.map((l) => [l.id, l]));

  const mudancas = [...achados.entries()].flatMap(([id, a]) => {
    const antes = noBanco.get(id);
    const lead = porId.get(id)!;
    const anterior = antes?.atendente_dc_id && config.equipeDoAtendente.has(antes.atendente_dc_id) ? antes.atendente_dc_id : null;
    const atendente = a.atendente ?? anterior;
    // número = o da primeira conversa: depois de definido, não muda (a conversa antiga pode sair da janela)
    const numero = antes?.numero_dc_id ?? a.numero ?? null;
    const ultima = a.ultima ?? antes?.ultima_mensagem_em ?? null;
    if (antes && antes.atendente_dc_id === atendente && antes.numero_dc_id === numero && mesmoInstante(antes.ultima_mensagem_em, ultima)) return [];
    const chegada = donos.chegada.get(id) ?? lead.createdAt;
    return [{
      dc_id: id,
      criado_em: chegada,
      dia: diaSP(chegada),
      atendente_dc_id: atendente,
      vendedor_id: atendente ? (config.equipeDoAtendente.get(atendente) ?? null) : null,
      numero_dc_id: numero,
      ultima_mensagem_em: ultima,
    }];
  });

  for (const lote of fatiar(mudancas, LOTE)) {
    await ok(db.from("funil_leads").upsert(lote, { onConflict: "dc_id" }));
  }
}

// ---------------------------------------------------------------------------
// 3b. Conversas: quem está esperando resposta da empresa (decisão do Davi, 10/10/2026)
//   - esperando = a ÚLTIMA mensagem é do lead, sem nenhuma da empresa depois (atendente OU
//     automação: qualquer mensagem da empresa depois do lead conta como resposta);
//   - a última é da empresa → quem precisa responder é o lead ("Aguardando o lead" na tela,
//     calculado de ultima_enviada_em).
// lastSendedMessageDate inclui automação, então não precisa ler as mensagens.
// ---------------------------------------------------------------------------

async function gravarConversas(db: Db, todas: DcConversa[], donos: Donos, config: Config, internos: Set<string>): Promise<void> {
  type Atual = {
    dc_id: string;
    lead_dc_id: string | null;
    ultima_mensagem_em: string | null;
    esperando_desde: string | null;
    numero_dc_id: string | null;
    atendente_dc_id: string | null;
    etiquetas_atuais: string[];
    contato_rotulo: string | null;
    finalizada: boolean;
    statuses: string[];
    fila_desde: string | null;
    interno: boolean;
    criada_em: string | null;
    origem: string;
  };
  const atuais = await lerTudo<Atual>((de, ate) =>
    db
      .from("funil_conversas")
      .select("dc_id, lead_dc_id, ultima_mensagem_em, esperando_desde, numero_dc_id, atendente_dc_id, etiquetas_atuais, contato_rotulo, finalizada, statuses, fila_desde, interno, criada_em, origem")
      .order("dc_id")
      .range(de, ate),
  );
  const noBanco = new Map(atuais.map((c) => [c.dc_id, c]));
  const ehAtendente = (id: string | undefined) => !!id && config.equipeDoAtendente.has(id);

  const linhas = [];
  for (const c of todas) {
    const antes = noBanco.get(c.id);
    const mudou = !antes || !mesmoInstante(antes.ultima_mensagem_em, c.lastMessageDate);
    const recebida = c.lastReceivedMessageDate;
    const enviada = c.lastSendedMessageDate;
    const esperando = recebida && (!enviada || recebida > enviada) ? recebida : null;

    // lead da Data Crazy ou "sem etiqueta" (contato:…); vazio = contato antigo fora do funil
    const leadId = donos.idDoLead(c);
    const atendente = c.attendants?.find((x) => ehAtendente(x.id))?.id ?? null;
    const numero = c.instance && config.numeros.has(c.instance.id) ? c.instance.id : null;
    const etiquetas = c.contact?.externalInfo?.tagIds ?? [];
    // fechada = finalizada OU arquivada (o "Finalizar" do CRM arquiva; finished fica false)
    const finalizada = !!c.finished || !!c.archivedAt || (c.statuses ?? []).some((s) => s === "finished" || s === "archived");
    // filas como no CRM: os status são marcas que se somam (ex.: ["waiting", "opened"]); cada aba
    // mostra quem tem a marca. Conversa fechada fica sem status.
    const statuses = finalizada ? [] : [...new Set(c.statuses ?? [])].sort();
    const filaDesde = finalizada ? null : (c.currentThread?.createdAt ?? c.createdAt);
    const interno = ehInterno(internos, c.contact?.phoneNumber, c.contact?.contactId);
    const rotulo = rotuloDoContato(c.contact?.name, c.contact?.phoneNumber);
    // id do anúncio Click-to-WhatsApp = veio de anúncio; sem ele, chegou por link/redirecionador
    const origem = c.sourceReferral?.ctwaId ? "ctwa" : "link";
    if (
      antes &&
      !mudou &&
      antes.lead_dc_id === leadId &&
      mesmoInstante(antes.esperando_desde, esperando) &&
      antes.atendente_dc_id === atendente &&
      antes.numero_dc_id === numero &&
      antes.finalizada === finalizada &&
      mesmasEtiquetas(antes.statuses ?? [], statuses) &&
      mesmoInstante(antes.fila_desde, filaDesde) &&
      antes.interno === interno &&
      antes.contato_rotulo === rotulo &&
      antes.origem === origem &&
      mesmoInstante(antes.criada_em, c.createdAt) &&
      mesmasEtiquetas(antes.etiquetas_atuais, etiquetas)
    ) continue;

    linhas.push({
      dc_id: c.id,
      lead_dc_id: leadId,
      contato_rotulo: rotulo,
      numero_dc_id: numero,
      atendente_dc_id: atendente,
      vendedor_id: atendente ? (config.equipeDoAtendente.get(atendente) ?? null) : null,
      etiquetas_atuais: etiquetas,
      ultima_recebida_em: recebida,
      ultima_enviada_em: enviada,
      ultima_e_automacao: !!c.lastMessageIsAutomation,
      ultima_mensagem_em: c.lastMessageDate,
      esperando_desde: esperando,
      finalizada,
      statuses,
      fila_desde: filaDesde,
      interno,
      criada_em: c.createdAt,
      origem,
      sincronizado_em: new Date().toISOString(),
    });
  }
  for (const lote of fatiar(linhas, LOTE)) await ok(db.from("funil_conversas").upsert(lote, { onConflict: "dc_id" }));
}

/** "Maria -1234": primeiro nome + 4 últimos dígitos (nunca o nome completo nem o telefone). */
function rotuloDoContato(nome: string | null | undefined, telefone: string | null | undefined): string | null {
  // nome que é (ou contém) um telefone não entra: só os 4 dígitos do final
  const primeiro = (nome ?? "").trim().split(/\s+/).find((p) => p && !/\d{3,}/.test(p) && !p.startsWith("+")) ?? null;
  const final = (telefone ?? "").replace(/\D/g, "").slice(-4) || null;
  return primeiro || final ? [primeiro, final && `-${final}`].filter(Boolean).join(" ") : null;
}

// ---------------------------------------------------------------------------
// 3c. Tempo de primeira resposta, por lead novo (lido uma vez):
//   1ª mensagem do lead → 1ª mensagem depois dela de um atendente de verdade (na 1ª conversa).
//   Sem resposta ainda: tenta de novo nas próximas rodadas por até 7 dias.
// ---------------------------------------------------------------------------

const PRIMEIRA_RESPOSTA_POR_RODADA = 40;

async function lerPrimeirasRespostas(db: Db, dc: DataCrazy, todas: DcConversa[], donos: Donos, config: Config): Promise<number> {
  const pendentes = await lerTudo<{ dc_id: string; criado_em: string }>((de, ate) =>
    db.from("funil_leads").select("dc_id, criado_em").eq("primeira_resposta_lida", false).order("criado_em", { ascending: false }).range(de, ate),
  );
  if (!pendentes.length) return 0;
  // primeira conversa de cada lead (a mais antiga vista)
  const primeiraDoLead = new Map<string, DcConversa>();
  for (const c of todas) {
    const id = donos.idDoLead(c);
    if (!id) continue;
    const atual = primeiraDoLead.get(id);
    if (!atual || c.createdAt < atual.createdAt) primeiraDoLead.set(id, c);
  }
  const ehAtendente = (id: string | undefined) => !!id && config.equipeDoAtendente.has(id);

  let lidos = 0;
  for (const l of pendentes) {
    if (lidos >= PRIMEIRA_RESPOSTA_POR_RODADA) break;
    const conversa = primeiraDoLead.get(l.dc_id);
    if (!conversa || !conversa.lastSendedMessageDate) continue; // ainda sem conversa ou sem resposta nenhuma
    let msgs: DcMensagem[] = [];
    try {
      for (let skip = 0; skip < 500; skip += 100) {
        const pagina = await dc.mensagens(conversa.id, skip, 100);
        msgs.push(...pagina);
        if (pagina.length < 100) break;
      }
    } catch (e) {
      if (e instanceof PrazoEsgotado) break;
      throw e;
    }
    lidos++;
    msgs = msgs.filter((m) => !m.isInternal).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const doLead = msgs.find((m) => m.received);
    const resposta = doLead ? msgs.find((m) => !m.received && m.createdAt > doLead.createdAt && ehAtendente(m.attendant?.id)) : undefined;
    const velho = Date.now() - Date.parse(l.criado_em) > 7 * 86_400_000;
    await ok(
      db
        .from("funil_leads")
        .update({
          primeira_msg_lead_em: doLead?.createdAt ?? null,
          primeira_resposta_em: resposta?.createdAt ?? null,
          primeira_resposta_por: resposta?.attendant?.id ?? null,
          primeira_resposta_lida: !!resposta || velho,
        })
        .eq("dc_id", l.dc_id),
    );
  }
  return lidos;
}

// ---------------------------------------------------------------------------
// 4. Histórico dos leads pendentes: quando cada etiqueta foi colocada/tirada
// ---------------------------------------------------------------------------

async function lerHistoricos(db: Db, dc: DataCrazy, config: Config): Promise<number> {
  const pendentes = await lerTudo<{ dc_id: string; etiquetas_atuais: string[]; atendente_dc_id: string | null; numero_dc_id: string | null }>(
    (de, ate) =>
      db
        .from("funil_leads")
        .select("dc_id, etiquetas_atuais, atendente_dc_id, numero_dc_id")
        .eq("historico_pendente", true)
        .order("criado_em")
        .range(de, ate),
  );

  let lidos = 0;
  for (const lote of fatiar(pendentes, 50)) {
    // etiquetas que já têm data de "colocou" no banco (para não criar data de fallback à toa)
    const jaTem = await lerTudo<{ lead_dc_id: string; etiqueta_dc_id: string | null }>((de, ate) =>
      db
        .from("funil_eventos")
        .select("lead_dc_id, etiqueta_dc_id")
        .eq("acao", "colocou")
        .in("lead_dc_id", lote.map((l) => l.dc_id))
        .order("id")
        .range(de, ate),
    );
    const comData = new Set(jaTem.map((e) => `${e.lead_dc_id}|${e.etiqueta_dc_id}`));

    for (const lead of lote) {
      let eventos: DcEventoHistorico[];
      try {
        eventos = await historicoCompleto(dc, lead.dc_id);
      } catch (e) {
        if (e instanceof PrazoEsgotado) return lidos; // o resto fica para a próxima rodada
        throw e;
      }

      const agora = new Date().toISOString();
      const linhas = eventos.flatMap((ev) => {
        const acao = ev.historyCode === "lead-tag-added" ? "colocou" : ev.historyCode === "lead-tag-removed" ? "tirou" : null;
        const nome = typeof ev.parameters?.name === "string" ? nomeDaEtiqueta(ev.parameters.name) : "";
        if (!acao || !nome) return [];
        return [{
          lead_dc_id: lead.dc_id,
          etiqueta_dc_id: config.etiquetaPorNome.get(nome) ?? null,
          etiqueta_nome: nome,
          acao,
          em: ev.createdAt,
          origem: "historico",
          fluxo: ev.sessionName?.trim() || null,
          dc_evento_id: ev.id,
        }];
      });
      for (const l of linhas) if (l.acao === "colocou" && l.etiqueta_dc_id) comData.add(`${lead.dc_id}|${l.etiqueta_dc_id}`);

      // etiqueta atual sem evento de "colocou": vale a primeira vez que a sincronização viu
      const semData = lead.etiquetas_atuais
        .filter((id) => !comData.has(`${lead.dc_id}|${id}`))
        .map((id) => ({
          lead_dc_id: lead.dc_id,
          etiqueta_dc_id: id,
          etiqueta_nome: [...config.etiquetaPorNome.entries()].find(([, v]) => v === id)?.[0] ?? id,
          acao: "colocou",
          em: agora,
          origem: "sincronizacao",
          fluxo: null,
          dc_evento_id: null,
        }));
      for (const s of semData) comData.add(`${lead.dc_id}|${s.etiqueta_dc_id}`);

      if (linhas.length) await ok(db.from("funil_eventos").upsert(linhas, { onConflict: "dc_evento_id", ignoreDuplicates: true }));
      if (semData.length) await ok(db.from("funil_eventos").insert(semData));

      // vendedor e número pelo histórico, só quando a conversa não trouxe
      const extra: { atendente_dc_id?: string; vendedor_id?: number | null; numero_dc_id?: string } = {};
      const troca = eventos
        .filter((ev) => ev.historyCode === "conversation-attendant-changed")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!lead.atendente_dc_id) {
        const id = troca
          .map((ev) => ev.parameters?.attendantName)
          .map((n) => (typeof n === "string" ? config.atendentePorNome.get(n.trim().toLowerCase()) : undefined))
          .find((x) => x !== undefined);
        if (id) Object.assign(extra, { atendente_dc_id: id, vendedor_id: config.equipeDoAtendente.get(id) ?? null });
      }
      if (!lead.numero_dc_id) {
        const nome = [...troca].reverse().map((ev) => ev.parameters?.instanceName).find((n): n is string => typeof n === "string");
        const id = nome ? config.numeroPorNome.get(nome.trim().toLowerCase()) : undefined;
        if (id) extra.numero_dc_id = id;
      }

      await ok(
        db.from("funil_leads").update({ historico_pendente: false, historico_lido_em: agora, ...extra }).eq("dc_id", lead.dc_id),
      );
      lidos++;
    }
  }
  return lidos;
}

async function historicoCompleto(dc: DataCrazy, leadId: string): Promise<DcEventoHistorico[]> {
  const todos: DcEventoHistorico[] = [];
  for (let skip = 0; skip < 2_000; skip += 200) {
    const { eventos, total } = await dc.historicoDoLead(leadId, skip, 200);
    todos.push(...eventos);
    if (eventos.length < 200 || todos.length >= total) break;
  }
  return todos;
}

// ---------------------------------------------------------------------------
// 6. Mensagens enviadas (custo do WhatsApp API oficial): só metadados, nunca o texto
// ---------------------------------------------------------------------------

/** Conversas lidas por rodada (1 chamada por 100 mensagens; a rota tem 60 chamadas/min). */
const MENSAGENS_POR_RODADA = 150;

/**
 * Lê as mensagens enviadas das conversas que mandaram algo desde a última leitura (a mais recente
 * primeiro). A API devolve da mais nova para a mais antiga: para quando chega no que já foi lido
 * (com 1 h de folga, para pegar a mudança de "enviada" para "entregue").
 */
async function lerMensagensEnviadas(db: Db, dc: DataCrazy, todas: DcConversa[]): Promise<number> {
  const lidas = new Map(
    (
      await lerTudo<{ dc_id: string; mensagens_lidas_ate: string }>((de, ate) =>
        db.from("funil_conversas").select("dc_id, mensagens_lidas_ate").not("mensagens_lidas_ate", "is", null).order("dc_id").range(de, ate),
      )
    ).map((c) => [c.dc_id, c.mensagens_lidas_ate]),
  );
  const pendentes = todas
    .filter((c) => {
      const enviada = c.lastSendedMessageDate;
      if (!enviada || enviada < INICIO_DO_CUSTO) return false;
      const ate = lidas.get(c.id);
      return !ate || Date.parse(enviada) > Date.parse(ate);
    })
    .sort((a, b) => (b.lastSendedMessageDate ?? "").localeCompare(a.lastSendedMessageDate ?? ""));

  let lidos = 0;
  for (const c of pendentes) {
    if (lidos >= MENSAGENS_POR_RODADA) break;
    const ate = lidas.get(c.id);
    const corte = Math.max(Date.parse(INICIO_DO_CUSTO), ate ? Date.parse(ate) - 3_600_000 : 0);
    const enviadas: DcMensagem[] = [];
    try {
      for (let skip = 0; skip < 2_000; skip += 100) {
        const pagina = await dc.mensagens(c.id, skip, 100);
        enviadas.push(...pagina.filter((m) => !m.received && !m.isInternal && m.createdAt >= INICIO_DO_CUSTO));
        const maisAntiga = pagina.reduce((min, m) => Math.min(min, Date.parse(m.createdAt)), Infinity);
        if (pagina.length < 100 || maisAntiga < corte) break;
      }
    } catch (e) {
      if (e instanceof PrazoEsgotado) break;
      throw e;
    }
    lidos++;

    // lead, etapa e cobrança vêm do recálculo no banco (funil_custo_recalcular)
    const agora = new Date().toISOString();
    const linhas = enviadas.map((m) => {
      const origem = origemDaMensagem(m);
      return {
        dc_id: m.id,
        conversa_dc_id: c.id,
        numero_dc_id: c.instance?.id ?? null,
        enviada_em: m.createdAt,
        tipo: tipoDaMensagem(m),
        origem,
        atendente_dc_id: m.attendant?.id ?? null,
        fluxo: origem === "automacao" ? (m.senderName?.trim().slice(0, 120) ?? null) : null,
        entrega: entregaDaMensagem(m.status),
        lida_em: agora,
      };
    });
    for (const lote of fatiar(linhas, LOTE)) await ok(db.from("funil_mensagens_enviadas").upsert(lote, { onConflict: "dc_id" }));
    await ok(db.from("funil_conversas").update({ mensagens_lidas_ate: c.lastSendedMessageDate }).eq("dc_id", c.id));
  }
  return lidos;
}

/** Etapa no momento do envio, compra e grátis/cobrada (no banco; ver a migration funil_custo_mensagens). */
async function recalcularCusto(db: Db) {
  // 3 dias para trás: no começo do mês ainda recalcula o mês anterior (histórico que chegou atrasado)
  const desde = new Date(Date.now() - 3 * 86_400_000).toISOString();
  await ok(db.rpc("funil_custo_recalcular", { p_desde: desde }));
}

/** Custo real que a Meta informa (pricing analytics), no máximo a cada 3 h. Sem META_CUSTO_TOKEN, não faz nada. */
async function lerCustoDaMeta(db: Db) {
  const token = process.env.META_CUSTO_TOKEN;
  if (!token) return;
  const { data: ultima } = await db
    .from("funil_meta_custo_dia")
    .select("atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima && Date.now() - Date.parse(ultima.atualizado_em) < 3 * 3_600_000) return;

  const numeros = await lerTudo<{ waba_id: string }>((de, ate) =>
    db.from("funil_numeros").select("waba_id").not("waba_id", "is", null).order("dc_id").range(de, ate),
  );
  const fim = Math.floor(Date.now() / 1000);
  const inicio = Math.max(Math.floor(Date.parse(INICIO_DO_CUSTO) / 1000), fim - 35 * 86_400);
  const agora = new Date().toISOString();
  for (const waba of new Set(numeros.map((n) => n.waba_id))) {
    try {
      const r = await custoDaWaba(token, waba, inicio, fim);
      const linhas = r.pontos.map((p) => ({
        dia: new Date(p.inicio * 1000).toISOString().slice(0, 10),
        waba_id: waba,
        tipo: p.tipo,
        categoria: p.categoria,
        mensagens: p.mensagens,
        custo: p.custo,
        moeda: r.moeda,
        atualizado_em: agora,
      }));
      if (linhas.length) await ok(db.from("funil_meta_custo_dia").upsert(linhas, { onConflict: "dia,waba_id,tipo,categoria" }));
    } catch (e) {
      // o custo real é complemento: a falha não derruba a sincronização
      console.error(`funil: custo da Meta (WABA final ${waba.slice(-4)}):`, e instanceof Error ? e.message : e);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Compra e downsell (só banco): telefone do lead × telefone do comprador na Hubla
// ---------------------------------------------------------------------------

async function atualizarCompras(db: Db, janela: string) {
  const [leads, contatos, eventos, etiquetas, etapas, produtos] = await Promise.all([
    lerTudo<{ dc_id: string; dia: string; compra: string | null; venda_id: number | null; downsell: string | null }>((de, ate) =>
      db.from("funil_leads").select("dc_id, dia, compra, venda_id, downsell").gte("criado_em", janela).order("dc_id").range(de, ate),
    ),
    lerTudo<{ lead_dc_id: string; telefone: string | null }>((de, ate) =>
      db.from("funil_leads_contato").select("lead_dc_id, telefone").not("telefone", "is", null).order("lead_dc_id").range(de, ate),
    ),
    lerTudo<{ lead_dc_id: string; etiqueta_dc_id: string }>((de, ate) =>
      db
        .from("funil_eventos")
        .select("lead_dc_id, etiqueta_dc_id")
        .eq("acao", "colocou")
        .not("etiqueta_dc_id", "is", null)
        .gte("em", janela)
        .order("id")
        .range(de, ate),
    ),
    lerTudo<{ dc_id: string; etapa_id: number | null; pagou_fora_hubla: boolean }>((de, ate) =>
      db.from("funil_etiquetas").select("dc_id, etapa_id, pagou_fora_hubla").order("dc_id").range(de, ate),
    ),
    lerTudo<{ id: number; comprou: boolean }>((de, ate) => db.from("funil_etapas").select("id, comprou").order("id").range(de, ate)),
    lerTudo<{ texto: string; tipo: "gsc" | "viral" }>((de, ate) =>
      db.from("funil_produtos_downsell").select("texto, tipo").eq("ativo", true).order("id").range(de, ate),
    ),
  ]);
  if (!leads.length) return;

  const vendas = await lerTudo<{ id: number; data: string; itens: string[]; bumps: string[]; linha: string; vendas_clientes: { telefone: string | null } | null }>(
    (de, ate) =>
      db
        .from("vendas")
        .select("id, data, itens, bumps, linha, vendas_clientes(telefone)")
        .eq("status", "pago")
        .gte("data", janela.slice(0, 10))
        .order("data")
        .range(de, ate),
  );
  // telefone → vendas daquele telefone, da mais antiga para a mais nova
  const vendasDoTelefone = new Map<string, typeof vendas>();
  for (const v of vendas) {
    const chave = chaveTelefone(v.vendas_clientes?.telefone);
    if (!chave) continue;
    vendasDoTelefone.set(chave, [...(vendasDoTelefone.get(chave) ?? []), v]);
  }

  const telefoneDoLead = new Map(contatos.map((c) => [c.lead_dc_id, chaveTelefone(c.telefone)]));
  const etapasDeCompra = new Set(etapas.filter((e) => e.comprou).map((e) => e.id));
  const etiquetaPorId = new Map(etiquetas.map((t) => [t.dc_id, t]));
  const etiquetasDoLead = new Map<string, Set<string>>();
  for (const e of eventos) etiquetasDoLead.set(e.lead_dc_id, (etiquetasDoLead.get(e.lead_dc_id) ?? new Set()).add(e.etiqueta_dc_id));

  const mudancas = leads.flatMap((l) => {
    const chave = telefoneDoLead.get(l.dc_id);
    // a primeira venda do mesmo telefone a partir do dia em que o lead entrou
    const venda = chave ? (vendasDoTelefone.get(chave) ?? []).find((v) => v.data >= l.dia) : undefined;
    const tags = [...(etiquetasDoLead.get(l.dc_id) ?? [])].map((id) => etiquetaPorId.get(id)).filter((t) => t !== undefined);

    const compra = decidirCompra({
      temVenda: !!venda,
      etiquetaForaHubla: tags.some((t) => t.pagou_fora_hubla),
      etiquetaDeCompra: tags.some((t) => t.etapa_id !== null && etapasDeCompra.has(t.etapa_id)),
    });
    // venda do Protocolo Viral (reconhecida pelo ID da Hubla em Vendas) = downsell 'viral'
    const downsell = venda ? (venda.linha === "viral" ? "viral" : downsellDosItens([...venda.itens, ...venda.bumps], produtos)) : null;
    const vendaId = venda?.id ?? null;

    if (l.compra === compra && l.venda_id === vendaId && l.downsell === downsell) return [];
    return [{ dc_id: l.dc_id, compra, venda_id: vendaId, downsell }];
  });

  for (const m of mudancas) {
    await ok(db.from("funil_leads").update({ compra: m.compra, venda_id: m.venda_id, downsell: m.downsell }).eq("dc_id", m.dc_id));
  }
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Lê todas as linhas, de 1.000 em 1.000 (o Supabase devolve no máximo 1.000 por consulta). */
async function lerTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as T[];
    todas.push(...linhas);
    if (linhas.length < 1000) return todas;
  }
}

async function ok(consulta: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await consulta;
  if (error) throw new Error(error.message);
}

async function contar(consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function fatiar<T>(lista: T[], tamanho: number): T[][] {
  const fatias: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) fatias.push(lista.slice(i, i + tamanho));
  return fatias;
}

function mesmoInstante(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Date.parse(a) === Date.parse(b);
}
