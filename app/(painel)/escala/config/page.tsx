import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormPessoa } from "../_componentes/formularios";

// Pessoas do Check-in (só admin): quem pode ter horário fixo. Os horários fixos são editados na
// própria aba Check-in ("Editar horários").
export default function PessoasPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/escala" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Check-in
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Pessoas</h1>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("equipe").select("id, nome, usuario_id, ativo, teste").order("nome");
  const pessoas = (data ?? []).filter((p) => p.ativo);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-dim">
        Quem pode ter horário fixo (vendedores, seus irmãos, alguém só para sábado). Para entrar na operação e ver os leads no Funil, a pessoa precisa de login: o convite
        de plantonista é feito pelo admin (link pelo WhatsApp).
      </p>
      <FormPessoa />
      <ul className="m-0 flex list-none flex-col p-0">
        {pessoas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
            <span className="flex-1 text-white">
              {p.nome}
              {p.teste && (
                <Etiqueta cor="roxo" className="ml-2">
                  teste
                </Etiqueta>
              )}
            </span>
            {p.usuario_id ? <Etiqueta cor="verde">tem login</Etiqueta> : <Etiqueta cor="cinza">sem login (não entra na operação)</Etiqueta>}
          </li>
        ))}
      </ul>
    </section>
  );
}
