"use server";

// Ações da página inicial. A imagem já foi enviada ao Storage pelo navegador;
// aqui só conferimos se é admin e gravamos qual é a capa atual.

import { ehAdmin } from "@/lib/auth/papeis";
import { trocarCapa } from "@/modulos/inicio/capa";
import { caminhoDeCapaValido } from "@/modulos/inicio/regras-capa";
import { refresh } from "next/cache";

export async function salvarCapa(caminho: string): Promise<{ erro?: string }> {
  if (!(await ehAdmin())) return { erro: "Só admin pode trocar a capa." };
  if (!caminhoDeCapaValido(caminho)) return { erro: "Arquivo de capa inválido." };

  const resultado = await trocarCapa(caminho);
  if (!resultado.erro) refresh();
  return resultado;
}
