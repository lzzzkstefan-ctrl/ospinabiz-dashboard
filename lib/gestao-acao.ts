// Ações da central de gestão: quem chama tem que ser da gestão (o RLS confere de novo no banco).
import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";

export const SO_GESTAO: EstadoForm = { erro: "Só a gestão (Davi e Rodrigo) mexe aqui. Se acabou de ganhar acesso, saia e entre de novo." };

/** Cliente do banco com o login de quem chamou, ou null se não for da gestão. */
export async function dbDaGestao() {
  const u = await usuarioLogado();
  if (!u?.gestao) return null;
  return { db: await createClient(), usuario: u };
}

/** Mensagem curta para o erro do banco (sem detalhes técnicos na tela). */
export function falhou(e: { message: string; code?: string } | null, padrao = "Não deu para salvar."): EstadoForm | null {
  if (!e) return null;
  console.error("[gestao]", e.code, e.message);
  if (e.code === "23514") return { erro: "Algum campo ficou fora do formato (texto longo demais, data ou link inválido)." };
  return { erro: padrao };
}
