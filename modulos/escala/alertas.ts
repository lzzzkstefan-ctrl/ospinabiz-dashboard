// Avisos (notificações push) do Check-in. Roda no servidor com a chave secreta.
// - avisarPausa: na hora, pela própria ação (pausa começou / acabou);
// - verificarAlertas: pelo pg_cron a cada 2 min e também logo depois de pausa/saída
//   (pausa longa, operação descoberta, sem check-in).
// Cada aviso tem uma chave única (notificacoes_enviadas): o mesmo acontecimento nunca avisa duas vezes.
// Quem recebe: notificacoes_preferencias; sem linha, admin recebe todos e os outros nenhum.
// Contexto em docs/modulos/escala.md ("Notificações").

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush, type Aviso } from "@/lib/integracoes/webpush";
import { decidirDescoberta, diaDaSemana, emBrasilia, horaCurta, hhmm, minutos, NOME_MOTIVO, padraoVale, type MotivoPausa, type Padrao } from "./regras";

export const TIPOS_AVISO = [
  { id: "operacao_descoberta", nome: "Operação descoberta (ninguém online no horário de atendimento, em dia com horário fixo)" },
  { id: "sem_checkin", nome: "Alguém não entrou até 15 min depois do horário fixo" },
  { id: "pausa_longa", nome: "Pausa passou do limite" },
  { id: "pausa_inicio", nome: "Alguém entrou em pausa" },
  { id: "pausa_fim", nome: "Alguém voltou da pausa" },
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number]["id"];

/** Tolerância para o aviso "não entrou" (minutos depois do início do horário fixo). */
export const TOLERANCIA_SEM_CHECKIN_MIN = 15;

type Db = ReturnType<typeof createAdminClient>;

/** Preferência de alguém para um tipo (sem linha: admin recebe tudo, os outros nada). */
export function querReceber(pref: Partial<Record<TipoAviso, boolean>> | null, papel: string | null, tipo: TipoAviso): boolean {
  if (pref && typeof pref[tipo] === "boolean") return pref[tipo]!;
  return papel === "admin";
}

/**
 * Registra o aviso (chave única) e manda para quem quer receber. Se a chave já existe, não manda
 * de novo. `exceto` = quem causou (ex.: quem pausou não recebe o aviso da própria pausa).
 */
async function avisar(db: Db, tipo: TipoAviso | "teste", chave: string, aviso: Aviso, opcoes: { exceto?: string; so?: string } = {}): Promise<number> {
  const { data: registro } = await db
    .from("notificacoes_enviadas")
    .upsert({ tipo, chave, titulo: aviso.titulo, corpo: aviso.corpo }, { onConflict: "tipo,chave", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (!registro) return 0; // já avisado antes

  const [{ data: inscricoes }, { data: prefs }, { data: usuarios }] = await Promise.all([
    db.from("push_inscricoes").select("id, usuario_id, endpoint, p256dh, auth"),
    db.from("notificacoes_preferencias").select("*"),
    db.auth.admin.listUsers({ perPage: 200 }),
  ]);
  const papelDe = new Map((usuarios?.users ?? []).map((u) => [u.id, (u.app_metadata as { papel?: string })?.papel ?? null]));
  const prefDe = new Map((prefs ?? []).map((p) => [String(p.usuario_id), p as Partial<Record<TipoAviso, boolean>>]));
  const alvo = (inscricoes ?? []).filter((i) => {
    const u = String(i.usuario_id);
    if (opcoes.so) return u === opcoes.so;
    if (opcoes.exceto && u === opcoes.exceto) return false;
    return tipo === "teste" ? false : querReceber(prefDe.get(u) ?? null, papelDe.get(u) ?? null, tipo);
  });

  let enviados = 0;
  for (const i of alvo) {
    const r = await enviarPush({ endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth }, { url: "/escala", ...aviso });
    if (r === "ok") enviados++;
    if (r === "expirada") await db.from("push_inscricoes").delete().eq("id", i.id);
  }
  if (alvo.length) {
    await db.from("notificacoes_enviadas").update({ enviados }).eq("id", registro.id);
    await db.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).in("id", alvo.map((i) => i.id));
  }
  return enviados;
}

const horaDe = (iso: string) => {
  const m = emBrasilia(iso).minuto;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const motivoTexto = (m: MotivoPausa, d: string | null) => (d ? `${NOME_MOTIVO[m]}: ${d}` : NOME_MOTIVO[m]);

/** Pausa começou ou acabou (chamado logo depois da ação, em segundo plano). */
export async function avisarPausa(pausaId: number, quando: "inicio" | "fim", quemFez: string): Promise<void> {
  const db = createAdminClient();
  const { data: p } = await db.from("escala_pausas").select("id, equipe_id, motivo, detalhe, inicio, fim").eq("id", pausaId).maybeSingle();
  if (!p) return;
  const { data: pessoa } = await db.from("equipe").select("nome, teste, teste_visivel").eq("id", p.equipe_id).maybeSingle();
  // pessoa de teste só gera aviso de pausa/volta se estiver "visível" (para testar notificações)
  if (pessoa?.teste && !pessoa.teste_visivel) return;
  const nome = pessoa?.nome ?? "Alguém";
  const motivo = motivoTexto(p.motivo as MotivoPausa, p.detalhe);
  if (quando === "inicio") {
    await avisar(db, "pausa_inicio", `pausa:${p.id}`, { titulo: `${nome} em pausa`, corpo: `${nome} em pausa (${motivo}) desde ${horaDe(String(p.inicio))}`, tag: `pausa-${p.id}` }, { exceto: quemFez });
  } else if (p.fim) {
    const min = Math.max(0, Math.round((Date.parse(String(p.fim)) - Date.parse(String(p.inicio))) / 60_000));
    await avisar(db, "pausa_fim", `pausa:${p.id}`, { titulo: `${nome} voltou da pausa`, corpo: `${nome} voltou da pausa (${motivo}, ${min} min) às ${horaDe(String(p.fim))}`, tag: `pausa-${p.id}` }, { exceto: quemFez });
  }
}

/** Aviso de teste só para o próprio aparelho (botão "Testar"). */
export async function avisoDeTeste(usuarioId: string): Promise<number> {
  const db = createAdminClient();
  return avisar(db, "teste", `teste:${usuarioId}:${Date.now()}`, { titulo: "Ospinabiz: teste", corpo: "As notificações estão funcionando neste aparelho." }, { so: usuarioId });
}

/**
 * Pausa longa, operação descoberta e sem check-in. Idempotente: pode rodar quantas vezes quiser
 * (a chave única segura a repetição).
 */
export async function verificarAlertas(agoraIso = new Date().toISOString()): Promise<{ pausaLonga: number; descoberta: ReturnType<typeof decidirDescoberta>; semCheckin: number }> {
  const db = createAdminClient();
  const agora = emBrasilia(agoraIso);
  const hoje = agora.dia;
  const [cfgFunil, cfgEscala, abertos, pausas, equipe, padroes, entradasHoje, estado] = await Promise.all([
    db.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
    db.from("escala_config").select("pausa_longa_min").maybeSingle(),
    db.from("escala_checkins").select("id, equipe_id, inicio").is("fim", null),
    db.from("escala_pausas").select("id, checkin_id, equipe_id, motivo, detalhe, inicio").is("fim", null),
    db.from("equipe").select("id, nome, ativo, teste"),
    db.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate"),
    // entradas que começaram hoje (Brasília) ou ainda estão abertas
    db.from("escala_checkins").select("equipe_id, inicio").gte("inicio", new Date(Date.parse(`${hoje}T03:00:00Z`)).toISOString()),
    db.from("escala_alerta_estado").select("descoberta_desde").maybeSingle(),
  ]);
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  // pessoa de teste (equipe.teste): o check-in e as pausas dela não contam para nenhum aviso
  const testes = new Set((equipe.data ?? []).filter((p) => p.teste).map((p) => Number(p.id)));
  const real = <T extends { equipe_id: unknown }>(l: T[] | null) => (l ?? []).filter((x) => !testes.has(Number(x.equipe_id)));
  abertos.data = real(abertos.data);
  pausas.data = real(pausas.data);
  padroes.data = real(padroes.data);
  entradasHoje.data = real(entradasHoje.data);
  const limite = Number(cfgEscala.data?.pausa_longa_min ?? 30);
  const ini = minutos(String(cfgFunil.data?.atendimento_inicio ?? "09:00"));
  const fim = minutos(String(cfgFunil.data?.atendimento_fim ?? "22:00"));
  const agoraMs = Date.parse(agoraIso);

  // 1. pausa longa
  let pausaLonga = 0;
  for (const p of pausas.data ?? []) {
    const min = Math.floor((agoraMs - Date.parse(String(p.inicio))) / 60_000);
    if (min <= limite) continue;
    const nome = nomeDe.get(Number(p.equipe_id)) ?? "Alguém";
    pausaLonga += await avisar(db, "pausa_longa", `pausa:${p.id}`, {
      titulo: `Pausa longa: ${nome}`,
      corpo: `${nome} está em pausa há ${min} min (${motivoTexto(p.motivo as MotivoPausa, p.detalhe)}), desde ${horaDe(String(p.inicio))}. Limite: ${limite} min.`,
      tag: `pausa-${p.id}`,
    });
  }

  // 2. operação descoberta: no horário de atendimento, ninguém online (em pausa não conta).
  //    Só em dia com algum horário fixo (decisão do Davi, 10/10/2026): sábado sem escala fixa não
  //    avisa; quando o dia ganhar horário fixo, passa a valer sozinho.
  const emPausa = new Set((pausas.data ?? []).map((p) => Number(p.checkin_id)));
  const online = (abertos.data ?? []).filter((c) => !emPausa.has(Number(c.id)));
  const descobertaDesde = estado.data?.descoberta_desde ? String(estado.data.descoberta_desde) : null;
  const diaComFixo = ((padroes.data ?? []) as Padrao[]).some((p) => padraoVale(p, hoje));
  const decisao = decidirDescoberta({ agoraMin: agora.minuto, inicio: hhmm(ini), fim: hhmm(fim), diaComFixo, online: online.length, jaDescobertaDesde: descobertaDesde });
  const descoberta = decisao;
  if (decisao === "descobriu") {
    await db.from("escala_alerta_estado").update({ descoberta_desde: agoraIso }).eq("id", true);
    // quem deveria estar: horário fixo de agora + quem está em pausa
    const doDia = ((padroes.data ?? []) as Padrao[]).filter((p) => padraoVale(p, hoje) && minutos(p.inicio) <= agora.minuto && agora.minuto < minutos(p.fim));
    const situacao = [...new Set([...doDia.map((p) => p.equipe_id), ...(pausas.data ?? []).map((p) => Number(p.equipe_id))])].map((id) => {
      const pa = (pausas.data ?? []).find((p) => Number(p.equipe_id) === id);
      return `${nomeDe.get(id) ?? "?"} ${pa ? `em pausa (${motivoTexto(pa.motivo as MotivoPausa, pa.detalhe)})` : "offline"}`;
    });
    await avisar(db, "operacao_descoberta", `descoberta:${agoraIso}`, {
      titulo: "⚠️ OPERAÇÃO DESCOBERTA",
      corpo: `Ninguém online desde ${horaDe(agoraIso)}.${situacao.length ? ` ${situacao.join(" · ")}.` : " Ninguém no horário fixo agora."}`,
      tag: "operacao-descoberta",
      importante: true,
    });
  } else if (decisao === "cobriu" || decisao === "limpar") {
    await db.from("escala_alerta_estado").update({ descoberta_desde: null }).eq("id", true);
    if (decisao === "cobriu" && descobertaDesde) {
      const quem = online.map((c) => nomeDe.get(Number(c.equipe_id)) ?? "?").join(", ");
      const min = Math.round((agoraMs - Date.parse(descobertaDesde)) / 60_000);
      await avisar(db, "operacao_descoberta", `coberta:${descobertaDesde}`, {
        titulo: "Operação coberta de novo",
        corpo: `${quem} online às ${horaDe(agoraIso)}. Ficou ${min} min sem ninguém.`,
        tag: "operacao-descoberta",
      });
    }
  }

  // 3. sem check-in: horário fixo começou há mais de 15 min e a pessoa não entrou hoje
  let semCheckin = 0;
  const entrouHoje = new Set([...(entradasHoje.data ?? []), ...(abertos.data ?? [])].map((c) => Number(c.equipe_id)));
  const ativos = new Set((equipe.data ?? []).filter((p) => p.ativo).map((p) => Number(p.id)));
  const primeiroFixo = new Map<number, Padrao>();
  for (const p of ((padroes.data ?? []) as Padrao[]).filter((p) => padraoVale(p, hoje) && diaDaSemana(hoje) === p.dia_semana)) {
    const atual = primeiroFixo.get(p.equipe_id);
    if (!atual || p.inicio < atual.inicio) primeiroFixo.set(p.equipe_id, p);
  }
  for (const [id, p] of primeiroFixo) {
    if (!ativos.has(id) || entrouHoje.has(id)) continue;
    const limiteMin = minutos(p.inicio) + TOLERANCIA_SEM_CHECKIN_MIN;
    if (agora.minuto < limiteMin || agora.minuto >= minutos(p.fim)) continue;
    const nome = nomeDe.get(id) ?? "Alguém";
    semCheckin += await avisar(db, "sem_checkin", `${id}:${hoje}`, {
      titulo: `${nome} ainda não entrou`,
      corpo: `Horário fixo ${horaCurta(p.inicio)}–${horaCurta(p.fim)}; já passou das ${hhmm(limiteMin).replace(":", "h")} e não teve check-in.`,
      tag: `sem-checkin-${id}`,
    });
  }

  return { pausaLonga, descoberta, semCheckin };
}
