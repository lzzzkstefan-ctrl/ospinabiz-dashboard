// Regras do cadastro de BMs e números monitorados (sem banco, sem tela).

/**
 * Deixa o telefone no formato do banco: só dígitos, com código do país.
 * Aceita "(11) 99999-0348", "+55 11 99999-0348", "5511999990348"...
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

/** Mostra o telefone do banco de um jeito legível: +55 11 99999-0348. */
export function formatarTelefone(telefone: string): string {
  const m = telefone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${telefone}`;
}

/** Texto de formulário limpo (sem espaços sobrando), cortado no tamanho máximo. */
export function limparTexto(valor: FormDataEntryValue | null, maximo: number): string {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, maximo);
}

/** Erro do banco em português, para mostrar na tela. */
export function mensagemDoErro(codigo: string | undefined, oQue: string): string {
  switch (codigo) {
    case "23505":
      return `${oQue} já está cadastrado.`;
    case "23514":
      return "Telefone inválido.";
    case "23503":
      return "BM não encontrada.";
    case "42501":
      return "Sem permissão: só admin pode cadastrar.";
    default:
      return "Não deu para salvar. Tente de novo.";
  }
}
