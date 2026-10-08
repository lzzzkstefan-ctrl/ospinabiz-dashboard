// Capa da página inicial: a imagem fica no bucket "capas" do Storage e o caminho
// da imagem atual fica em config_painel (chave "capa_inicio"). Só admin troca.

import { createClient } from "@/lib/supabase/server";
import { BUCKET_CAPAS } from "./regras-capa";

const CHAVE = "capa_inicio";

/** Endereço público da capa atual, ou null se ainda não tem. */
export async function urlDaCapa(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("config_painel").select("valor").eq("chave", CHAVE).maybeSingle();
  if (!data?.valor) return null;
  return supabase.storage.from(BUCKET_CAPAS).getPublicUrl(data.valor).data.publicUrl;
}

/**
 * Grava a capa nova e apaga a imagem antiga do bucket.
 * O RLS garante que só admin consegue (config_painel e storage).
 */
export async function trocarCapa(caminho: string): Promise<{ erro?: string }> {
  const supabase = await createClient();
  const { data: atual } = await supabase.from("config_painel").select("valor").eq("chave", CHAVE).maybeSingle();

  const { error } = await supabase
    .from("config_painel")
    .upsert({ chave: CHAVE, valor: caminho, atualizado_em: new Date().toISOString() });
  if (error) return { erro: "Não deu para salvar a capa." };

  if (atual?.valor && atual.valor !== caminho) {
    await supabase.storage.from(BUCKET_CAPAS).remove([atual.valor]);
  }
  return {};
}

/** Nome da pessoa logada na equipe (para o "Bom dia, Fulano"). */
export async function nomeNaEquipe(usuarioId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("equipe").select("nome").eq("usuario_id", usuarioId).maybeSingle();
  return data?.nome ?? null;
}
