// Aba Usuários: leitura e mudanças no login (Supabase Auth) e nas ligações (equipe, atendente da
// Data Crazy, código UTM da Hubla). Usa a chave secreta: QUEM CHAMA confere antes se a pessoa logada
// é chefe/gerente (app/(painel)/admin/usuarios/acoes.ts). As regras de quem pode o quê estão em
// regras.ts (podeMudar) e são conferidas aqui de novo, com o estado atual do banco.

import { createAdminClient } from "@/lib/supabase/admin";
import { emailOk, metadataDo, papelDo, podeMudar, statusDo, utmOk, type PapelUsuario, type Status } from "./regras";

type Db = ReturnType<typeof createAdminClient>;

export type Usuario = {
  id: string;
  email: string;
  nome: string | null;
  equipeId: number | null;
  papel: PapelUsuario | null;
  status: Status;
  ultimoAcesso: string | null;
  convidadoEm: string | null;
  atendente: { dcId: string; nome: string } | null;
  utm: string | null;
  /** pessoa de teste (equipe.teste): fora de Vendas, Funil por vendedor, horários fixos e avisos */
  teste: boolean;
};
export type Atendente = { dcId: string; nome: string; equipeId: number | null; suporte: boolean };
export type Registro = { quando: string; alvo: string; acao: string; antes: unknown; depois: unknown; por: string | null };

async function todosOsLogins(db: Db) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Erro ao listar logins: ${error.message}`);
  return data.users;
}

export async function carregarUsuarios(): Promise<{ usuarios: Usuario[]; atendentes: Atendente[]; registro: Registro[] }> {
  const db = createAdminClient();
  const [logins, equipe, vendedores, atendentes, registro] = await Promise.all([
    todosOsLogins(db),
    db.from("equipe").select("id, nome, usuario_id, ativo, teste"),
    db.from("vendedores").select("equipe_id, utm_term, ativo"),
    db.from("funil_atendentes").select("dc_id, nome, equipe_id, suporte_dc").order("nome"),
    db.from("usuarios_registro").select("alvo_nome, acao, antes, depois, feito_por, feito_em").order("feito_em", { ascending: false }).limit(30),
  ]);
  const emailDe = new Map(logins.map((u) => [u.id, u.email ?? ""]));
  const usuarios = logins
    .map((u): Usuario => {
      const p = (equipe.data ?? []).find((e) => e.usuario_id === u.id);
      const at = p ? (atendentes.data ?? []).find((a) => a.equipe_id === p.id) : null;
      const vd = p ? (vendedores.data ?? []).find((v) => v.equipe_id === p.id) : null;
      return {
        id: u.id,
        email: u.email ?? "",
        nome: p?.nome ?? null,
        equipeId: p?.id ?? null,
        papel: papelDo(u.app_metadata),
        status: statusDo(u as { banned_until?: string | null; last_sign_in_at?: string | null }),
        ultimoAcesso: u.last_sign_in_at ?? null,
        convidadoEm: u.invited_at ?? null,
        atendente: at ? { dcId: String(at.dc_id), nome: String(at.nome) } : null,
        utm: vd?.ativo ? String(vd.utm_term) : null,
        teste: !!p?.teste,
      };
    })
    .sort((a, b) => (a.status === "desativado" ? 1 : 0) - (b.status === "desativado" ? 1 : 0) || (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));
  return {
    usuarios,
    atendentes: (atendentes.data ?? []).map((a) => ({ dcId: String(a.dc_id), nome: String(a.nome), equipeId: a.equipe_id ? Number(a.equipe_id) : null, suporte: !!a.suporte_dc })),
    registro: (registro.data ?? []).map((r) => ({ quando: String(r.feito_em), alvo: String(r.alvo_nome), acao: String(r.acao), antes: r.antes, depois: r.depois, por: r.feito_por ? (emailDe.get(String(r.feito_por)) ?? null) : null })),
  };
}

async function registrar(db: Db, por: string, alvo: { id: string | null; nome: string }, acao: string, antes: unknown, depois: unknown) {
  await db.from("usuarios_registro").insert({ alvo_usuario: alvo.id, alvo_nome: alvo.nome, acao, antes: antes ?? null, depois: depois ?? null, feito_por: por });
}

/** Contexto para conferir as regras: papel de quem pede, do alvo e quantos chefes ativos existem. */
async function contexto(db: Db, quemId: string, alvoId: string | null) {
  const logins = await todosOsLogins(db);
  const quem = logins.find((u) => u.id === quemId);
  const alvo = alvoId ? logins.find((u) => u.id === alvoId) : undefined;
  const chefesAtivos = logins.filter((u) => papelDo(u.app_metadata) === "chefe" && statusDo(u as { banned_until?: string | null; last_sign_in_at?: string | null }) !== "desativado").length;
  return { logins, quem, alvo, quemPapel: papelDo(quem?.app_metadata), alvoPapel: alvo ? papelDo(alvo.app_metadata) : null, chefesAtivos };
}

const linkDeConvite = (site: string, hash: string) => `${site.replace(/\/$/, "")}/confirmar?token_hash=${hash}&type=invite&next=/definir-senha`;

export type Resultado = { erro?: string; ok?: string; link?: string };

/** Convida (ou, se o convite ainda está pendente, gera link novo). Liga/cria a pessoa na equipe. */
export async function convidar(quemId: string, dados: { email: string; nome: string; papel: PapelUsuario }, site: string): Promise<Resultado> {
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim();
  if (!emailOk(email)) return { erro: "E-mail inválido." };
  if (nome.length < 2) return { erro: "Escreva o nome." };
  const db = createAdminClient();
  const c = await contexto(db, quemId, null);
  const existente = c.logins.find((u) => u.email?.toLowerCase() === email);
  if (existente && existente.last_sign_in_at) return { erro: "Esse e-mail já tem conta ativa. Para mudar o papel, use Editar." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId: existente?.id ?? null, alvoPapel: existente ? papelDo(existente.app_metadata) : null, novoPapel: dados.papel, acao: "convidar", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };

  // pessoa da equipe: mesmo nome sem login → liga; nome de outra pessoa com login → erro
  const { data: pessoa } = await db.from("equipe").select("id, usuario_id").eq("nome", nome).maybeSingle();
  if (pessoa?.usuario_id && pessoa.usuario_id !== existente?.id) return { erro: `"${nome}" já está ligado a outro login. Use outro nome.` };

  const r = await db.auth.admin.generateLink({ type: "invite", email });
  if (r.error) return { erro: `Não deu para gerar o convite: ${r.error.message}` };
  const id = r.data.user.id;
  const { error: ep } = await db.auth.admin.updateUserById(id, { app_metadata: { ...r.data.user.app_metadata, ...metadataDo(dados.papel) } });
  if (ep) return { erro: `Convite criado, mas não deu para pôr o papel: ${ep.message}` };
  if (pessoa) await db.from("equipe").update({ usuario_id: id, ativo: true }).eq("id", pessoa.id);
  else {
    const { data: ligada } = await db.from("equipe").select("id").eq("usuario_id", id).maybeSingle();
    if (!ligada) await db.from("equipe").insert({ nome, usuario_id: id });
  }
  await registrar(db, quemId, { id, nome }, existente ? "novo_link" : "convite", existente ? { email } : null, { email, papel: dados.papel });
  return { ok: existente ? "Link novo gerado (o anterior deixa de valer)." : "Convite criado.", link: linkDeConvite(site, r.data.properties.hashed_token) };
}

/** Link novo para quem ainda não entrou (o anterior deixa de valer). */
export async function novoLink(quemId: string, alvoId: string, site: string): Promise<Resultado> {
  const db = createAdminClient();
  const c = await contexto(db, quemId, alvoId);
  if (!c.alvo?.email) return { erro: "Usuário não encontrado." };
  if (c.alvo.last_sign_in_at) return { erro: "Essa pessoa já entrou; não precisa de convite." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId, alvoPapel: c.alvoPapel, acao: "novo_link", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };
  const r = await db.auth.admin.generateLink({ type: "invite", email: c.alvo.email });
  if (r.error) return { erro: `Não deu para gerar: ${r.error.message}` };
  const { data: p } = await db.from("equipe").select("nome").eq("usuario_id", alvoId).maybeSingle();
  await registrar(db, quemId, { id: alvoId, nome: p?.nome ?? c.alvo.email }, "novo_link", null, null);
  return { ok: "Link novo gerado (o anterior deixa de valer).", link: linkDeConvite(site, r.data.properties.hashed_token) };
}

export async function mudarPapel(quemId: string, alvoId: string, novo: PapelUsuario): Promise<Resultado> {
  const db = createAdminClient();
  const c = await contexto(db, quemId, alvoId);
  if (!c.alvo) return { erro: "Usuário não encontrado." };
  if (c.alvoPapel === novo) return { ok: "Sem mudança." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId, alvoPapel: c.alvoPapel, novoPapel: novo, acao: "papel", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };
  const { error } = await db.auth.admin.updateUserById(alvoId, { app_metadata: { ...c.alvo.app_metadata, ...metadataDo(novo) } });
  if (error) return { erro: `Não deu para trocar: ${error.message}` };
  const { data: p } = await db.from("equipe").select("nome").eq("usuario_id", alvoId).maybeSingle();
  await registrar(db, quemId, { id: alvoId, nome: p?.nome ?? c.alvo.email ?? "?" }, "papel", { papel: c.alvoPapel }, { papel: novo });
  return { ok: "Papel trocado. Vale quando o login da pessoa renovar (até 1 h) ou ela sair e entrar." };
}

/** Atendente da Data Crazy (um por pessoa; vazio = desliga) e código UTM da Hubla (vazio = desliga). */
export async function mudarLigacoes(quemId: string, alvoId: string, dados: { atendente: string | null; utm: string | null }): Promise<Resultado> {
  const db = createAdminClient();
  const c = await contexto(db, quemId, alvoId);
  if (!c.alvo) return { erro: "Usuário não encontrado." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId, alvoPapel: c.alvoPapel, acao: "ligacoes", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };
  const { data: p } = await db.from("equipe").select("id, nome").eq("usuario_id", alvoId).maybeSingle();
  if (!p) return { erro: "Esse login não está ligado a ninguém da equipe." };
  const utm = dados.utm?.trim().toLowerCase() || null;
  if (utm && !utmOk(utm)) return { erro: "Código UTM: só letras minúsculas, números, - e _ (até 40)." };

  // atendente da Data Crazy
  const { data: atuais } = await db.from("funil_atendentes").select("dc_id, nome, equipe_id").eq("equipe_id", p.id);
  const antesAt = atuais?.[0]?.nome ?? null;
  if ((atuais?.[0]?.dc_id ?? null) !== dados.atendente) {
    if (dados.atendente) {
      const { data: alvoAt } = await db.from("funil_atendentes").select("nome, equipe_id").eq("dc_id", dados.atendente).maybeSingle();
      if (!alvoAt) return { erro: "Atendente da Data Crazy não encontrado." };
      if (alvoAt.equipe_id && Number(alvoAt.equipe_id) !== Number(p.id)) return { erro: `O atendente "${alvoAt.nome}" já está ligado a outra pessoa. Desligue lá primeiro.` };
    }
    if (atuais?.length) await db.from("funil_atendentes").update({ equipe_id: null }).eq("equipe_id", p.id);
    if (dados.atendente) await db.from("funil_atendentes").update({ equipe_id: p.id }).eq("dc_id", dados.atendente);
    const { data: novoAt } = dados.atendente ? await db.from("funil_atendentes").select("nome").eq("dc_id", dados.atendente).maybeSingle() : { data: null };
    await registrar(db, quemId, { id: alvoId, nome: p.nome }, "atendente", { atendente: antesAt }, { atendente: novoAt?.nome ?? null });
  }

  // código UTM da Hubla
  const { data: vd } = await db.from("vendedores").select("utm_term, ativo").eq("equipe_id", p.id).maybeSingle();
  const antesUtm = vd?.ativo ? vd.utm_term : null;
  if (antesUtm !== utm) {
    if (utm) {
      const { data: dono } = await db.from("vendedores").select("equipe_id").eq("utm_term", utm).maybeSingle();
      if (dono && Number(dono.equipe_id) !== Number(p.id)) return { erro: `O código "${utm}" já é de outra pessoa.` };
      const { error } = vd ? await db.from("vendedores").update({ utm_term: utm, ativo: true }).eq("equipe_id", p.id) : await db.from("vendedores").insert({ equipe_id: p.id, utm_term: utm, email: c.alvo.email });
      if (error) return { erro: `Não deu para salvar o código: ${error.message}` };
    } else if (vd) {
      // sem código: deixa de receber vendas novas pela UTM; o histórico continua
      await db.from("vendedores").update({ ativo: false }).eq("equipe_id", p.id);
    }
    await registrar(db, quemId, { id: alvoId, nome: p.nome }, "utm", { utm: antesUtm }, { utm });
  }
  return { ok: "Salvo." };
}

/** Desativa: não entra mais (bloqueio no login) e sai das listas; vendas, check-ins e leads ficam. */
export async function desativar(quemId: string, alvoId: string): Promise<Resultado> {
  const db = createAdminClient();
  const c = await contexto(db, quemId, alvoId);
  if (!c.alvo) return { erro: "Usuário não encontrado." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId, alvoPapel: c.alvoPapel, acao: "desativar", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };
  const { error } = await db.auth.admin.updateUserById(alvoId, { ban_duration: "876000h" });
  if (error) return { erro: `Não deu para desativar: ${error.message}` };
  const { data: p } = await db.from("equipe").select("id, nome").eq("usuario_id", alvoId).maybeSingle();
  if (p) {
    await db.from("equipe").update({ ativo: false }).eq("id", p.id);
    await db.from("vendedores").update({ ativo: false }).eq("equipe_id", p.id);
  }
  await registrar(db, quemId, { id: alvoId, nome: p?.nome ?? c.alvo.email ?? "?" }, "desativar", null, null);
  return { ok: "Desativado. Não entra mais (se estiver com a página aberta, perde o acesso em até 1 h). O histórico continua." };
}

export async function reativar(quemId: string, alvoId: string): Promise<Resultado> {
  const db = createAdminClient();
  const c = await contexto(db, quemId, alvoId);
  if (!c.alvo) return { erro: "Usuário não encontrado." };
  const proibido = podeMudar({ quem: c.quemPapel, quemId, alvoId, alvoPapel: c.alvoPapel, acao: "reativar", chefesAtivos: c.chefesAtivos });
  if (proibido) return { erro: proibido };
  const { error } = await db.auth.admin.updateUserById(alvoId, { ban_duration: "none" });
  if (error) return { erro: `Não deu para reativar: ${error.message}` };
  const { data: p } = await db.from("equipe").select("id, nome").eq("usuario_id", alvoId).maybeSingle();
  if (p) {
    await db.from("equipe").update({ ativo: true }).eq("id", p.id);
    // volta a receber vendas pela UTM se tinha código
    await db.from("vendedores").update({ ativo: true }).eq("equipe_id", p.id);
  }
  await registrar(db, quemId, { id: alvoId, nome: p?.nome ?? c.alvo.email ?? "?" }, "reativar", null, null);
  return { ok: "Reativado." };
}
