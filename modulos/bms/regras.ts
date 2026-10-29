// Regras do cadastro de BMs e números monitorados (sem banco, sem tela).

export type Situacao = "operacao" | "reserva" | "desconectado" | "banido";
export type Qualidade = "verde" | "amarela" | "vermelha";
export type Pessoa = { id: number; nome: string };
export type Numero = {
  id: number;
  bm_id: number;
  final: string;
  telefone: string | null;
  apelido: string;
  limite: number | null;
  situacao: Situacao;
  /** data do ban (yyyy-mm-dd), só quando situação = banido */
  banido_em: string | null;
  ativo: boolean;
  responsavel: Pessoa | null;
  /** número principal da operação (card grande no topo) */
  principal: boolean;
  /** só o DDD, para o card sem o telefone completo */
  ddd: string | null;
  /** começo do contador "dias sem ban" (yyyy-mm-dd) */
  em_operacao_desde: string | null;
  /** qualidade na Meta preenchida à mão (com o token da Meta a tela lê de lá) */
  qualidade: Qualidade | null;
  observacao: string | null;
};
export type Bm = {
  id: number;
  nome: string;
  acesso_admin: boolean;
  ativo: boolean;
  /** data do ban da BM (yyyy-mm-dd); null = não banida */
  banida_em: string | null;
  ban_motivo: string | null;
  numeros: Numero[];
};

/** "2026-10-16" -> "16/10/2026" */
export const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Hoje em Brasília (yyyy-mm-dd), padrão da data do ban. */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Limites de mensagens que a tela oferece (a Meta usa esses degraus). */
export const LIMITES = [250, 1000, 2000, 10000, 100000] as const;

/** 2000 -> "2K", 250 -> "250", vazio -> "sem limite informado". */
export function formatarLimite(limite: number | null): string {
  if (limite === null) return "limite ?";
  return limite >= 1000 ? `${limite / 1000}K` : String(limite);
}

/**
 * Deixa o telefone no formato do banco: só dígitos, com código do país.
 * Aceita "(11) 99999-1234", "+55 11 99999-1234", "5511999991234"...
 * Com 10 ou 11 dígitos (DDD + número), assume Brasil e coloca o 55 na frente,
 * a não ser que comece com "+" (aí o código do país já veio junto).
 * Devolve null se não der um telefone válido (10 a 15 dígitos, igual à regra do banco).
 */
export function normalizarTelefone(texto: string): string | null {
  let digitos = texto.replace(/\D/g, "");
  const temCodigoPais = texto.trim().startsWith("+");
  if (!temCodigoPais && (digitos.length === 10 || digitos.length === 11)) digitos = `55${digitos}`;
  return /^[0-9]{10,15}$/.test(digitos) ? digitos : null;
}

/** Mostra o telefone do banco de um jeito legível: +55 11 99999-1234. */
export function formatarTelefone(telefone: string): string {
  const m = telefone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${telefone}`;
}

/** Texto de formulário limpo (sem espaços sobrando), cortado no tamanho máximo. */
export function limparTexto(valor: FormDataEntryValue | null, maximo: number): string {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, maximo);
}

/** O monitor só testa número em operação, ativo, de BM ativa e não banida, e com telefone completo. */
export function entraNoTeste(numero: Numero, bm: Pick<Bm, "ativo" | "banida_em">): boolean {
  return bm.ativo && !bm.banida_em && numero.ativo && numero.situacao === "operacao" && numero.telefone !== null;
}

// ---------------------------------------------------------------------------
// Arquivo da tela (tudo que não é número principal), recolhido e só leitura:
// Reserva / Em operação fora dos principais / Fora da operação / Levou ban / Arquivados.
// Cada número cai numa seção; dentro dela, os números ficam agrupados por BM.
// Número arquivado (ativo = não) ou de BM arquivada vai para "Arquivados".
// BM banida (todos os números dela) e número banido de BM ativa vão para "Levou ban".
// ---------------------------------------------------------------------------
export type IdSecao = "reserva" | "outros" | "fora" | "levou_ban" | "arquivados";
export type Secao = { id: IdSecao; titulo: string; grupos: { bm: Bm; numeros: Numero[] }[]; total: number };

const TITULOS: Record<IdSecao, string> = {
  reserva: "Reserva",
  outros: "Em operação, fora dos principais",
  fora: "Fora da operação",
  levou_ban: "Levou ban",
  arquivados: "Arquivados",
};

/** Número principal ativo, de BM ativa e não banida, que não levou ban: vai para o topo da tela. */
export function ehPrincipal(numero: Numero, bm: Pick<Bm, "ativo" | "banida_em">): boolean {
  return numero.principal && numero.ativo && bm.ativo && !bm.banida_em && numero.situacao !== "banido";
}

function secaoDoNumero(numero: Numero, bm: Bm): IdSecao {
  if (!bm.ativo || !numero.ativo) return "arquivados";
  if (bm.banida_em || numero.situacao === "banido") return "levou_ban";
  if (numero.situacao === "desconectado") return "fora";
  if (numero.situacao === "reserva") return "reserva";
  return "outros";
}

/** Seções do Arquivo (sem os números principais). */
export function agruparEmSecoes(bms: Bm[]): Secao[] {
  const ordem: IdSecao[] = ["reserva", "outros", "fora", "levou_ban", "arquivados"];
  return ordem.map((id) => {
    const grupos = bms
      .map((bm) => ({ bm, numeros: bm.numeros.filter((n) => !ehPrincipal(n, bm) && secaoDoNumero(n, bm) === id) }))
      .filter((g) => g.numeros.length > 0);
    return { id, titulo: TITULOS[id], grupos, total: grupos.reduce((s, g) => s + g.numeros.length, 0) };
  });
}

// ---------------------------------------------------------------------------
// Leitura dos formulários
// ---------------------------------------------------------------------------
export type CamposNumero = {
  bm_id: number;
  final: string;
  telefone: string | null;
  apelido: string;
  limite: number | null;
  responsavel_id: number | null;
  situacao: Situacao;
};

/** Lê e confere os campos do formulário de número. `nomeBm` monta o apelido padrão. */
export function lerCamposNumero(
  form: FormData,
  nomeBm: (bmId: number) => string | undefined,
): { campos: CamposNumero } | { erro: string } {
  const bm_id = Number(form.get("bm_id"));
  if (!Number.isInteger(bm_id) || bm_id <= 0 || !nomeBm(bm_id)) return { erro: "Escolha a BM." };

  const textoTelefone = limparTexto(form.get("telefone"), 30);
  const telefone = textoTelefone ? normalizarTelefone(textoTelefone) : null;
  if (textoTelefone && !telefone) return { erro: "Telefone inválido. Use DDD + número, ex.: (11) 99999-1234." };

  let final = limparTexto(form.get("final"), 4);
  if (!final && telefone) final = telefone.slice(-4);
  if (!/^[0-9]{4}$/.test(final)) return { erro: "O final tem que ter 4 dígitos." };
  if (telefone && !telefone.endsWith(final)) return { erro: `O telefone tem que terminar com ${final}.` };

  const limiteTexto = String(form.get("limite") ?? "");
  const limite = limiteTexto ? Number(limiteTexto) : null;
  if (limite !== null && !(LIMITES as readonly number[]).includes(limite)) return { erro: "Limite inválido." };

  const respTexto = String(form.get("responsavel_id") ?? "");
  const responsavel_id = respTexto ? Number(respTexto) : null;

  const situacao = lerSituacao(form.get("situacao"));
  const apelido = limparTexto(form.get("apelido"), 60) || `${final} ${nomeBm(bm_id)}`;

  return { campos: { bm_id, final, telefone, apelido, limite, responsavel_id, situacao } };
}

/** Situação vinda do formulário (qualquer outra coisa vira "operacao"). */
export function lerSituacao(valor: FormDataEntryValue | null): Situacao {
  return valor === "reserva" || valor === "desconectado" || valor === "banido" ? valor : "operacao";
}

/** Erro do banco em português, para mostrar na tela. */
export function mensagemDoErro(erro: { code?: string; message?: string } | null): string {
  const texto = erro?.message ?? "";
  switch (erro?.code) {
    case "23505":
      if (texto.includes("bm_final")) return "Esse final já existe nessa BM.";
      if (texto.includes("telefone")) return "Esse telefone já está cadastrado.";
      if (texto.includes("monitor_bms")) return "Já existe uma BM com esse nome.";
      return "Já está cadastrado.";
    case "23514":
      if (texto.includes("final_bate")) return "O telefone tem que terminar com o final cadastrado.";
      if (texto.includes("observacao")) return "A observação não pode ter IP nem passar de 300 letras.";
      if (texto.includes("ddd")) return "DDD inválido (2 dígitos).";
      return "Algum campo está fora do formato.";
    case "23503":
      return "BM ou responsável não encontrado.";
    case "42501":
      return "Sem permissão: só admin pode alterar.";
    default:
      return "Não deu para salvar. Tente de novo.";
  }
}
