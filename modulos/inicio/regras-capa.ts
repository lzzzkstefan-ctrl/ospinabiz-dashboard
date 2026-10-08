// Regras da capa da página inicial (sem banco: usadas no navegador e no servidor).

export const BUCKET_CAPAS = "capas";

/** Formatos aceitos (iguais aos do bucket) e tamanho máximo: 5 MB. */
export const TIPOS_CAPA: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const TAMANHO_MAXIMO_CAPA = 5 * 1024 * 1024;

/** Só aceita caminhos gerados pela própria tela: inicio/capa-<número>.<jpg|png|webp>. */
export function caminhoDeCapaValido(caminho: string): boolean {
  return /^inicio\/capa-\d+\.(jpg|png|webp)$/.test(caminho);
}

/** Confere o arquivo escolhido e monta o caminho no bucket. */
export function caminhoParaArquivo(arquivo: { type: string; size: number }, agora: number): { caminho: string } | { erro: string } {
  const extensao = TIPOS_CAPA[arquivo.type];
  if (!extensao) return { erro: "Use uma imagem JPG, PNG ou WEBP." };
  if (arquivo.size > TAMANHO_MAXIMO_CAPA) return { erro: "Imagem muito grande (máximo 5 MB)." };
  return { caminho: `inicio/capa-${agora}.${extensao}` };
}
