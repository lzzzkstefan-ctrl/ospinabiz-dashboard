import { Gaveta } from "@/components/formulario";
import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { carregarUsuarios } from "@/modulos/usuarios/gestao";
import { NOME_STATUS, PAPEIS } from "@/modulos/usuarios/regras";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoAtivo, BotaoNovoLink, FormConvidar, FormEditar } from "./_componentes/formularios";

// Usuários (só chefe e gerente em Vendas): lista, convite com link para o WhatsApp, papel, ligação
// com o atendente da Data Crazy e o código UTM da Hubla, desativar/reativar e o registro de mudanças.
// Contexto em docs/modulos/usuarios.md.

export default function UsuariosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Usuários</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Quem entra na dashboard, com que papel, e a ligação com a Data Crazy e a Hubla.</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const COR_STATUS = { ativo: "verde", pendente: "laranja", desativado: "cinza" } as const;
const NOME_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.id, p.nome]));
const NOME_ACAO: Record<string, string> = {
  convite: "convidou",
  novo_link: "gerou novo link para",
  papel: "trocou o papel de",
  atendente: "trocou o atendente da Data Crazy de",
  utm: "trocou o código UTM de",
  desativar: "desativou",
  reativar: "reativou",
};
const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nunca";
const resumo = (v: unknown) => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>).map((x) => (x === null ? "nada" : NOME_PAPEL[String(x)] ?? String(x))).join(", ") : "");

async function Conteudo() {
  const eu = await usuarioLogado();
  if (!eu || (eu.vendas !== "chefe" && eu.vendas !== "gerente")) notFound();
  const souChefe = eu.vendas === "chefe";
  const { usuarios, atendentes, registro } = await carregarUsuarios();

  return (
    <>
      <section className="glass-lite glass-static p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Convidar</h2>
        <p className="m-0 mb-3 text-[12.5px] text-ink-dim">
          Gera o link de convite para você copiar e mandar no WhatsApp. Se o nome já existe na equipe sem login (ex.: cadastrado no Check-in), o convite liga a esse cadastro.
          {!souChefe && " Só o chefe convida outro chefe."}
        </p>
        <FormConvidar podeChefe={souChefe} />
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Pessoas · {usuarios.length}</h2>
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Nome</th>
              <th className="py-1.5 pr-3 font-medium">E-mail</th>
              <th className="py-1.5 pr-3 font-medium">Papel</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium">Último acesso</th>
              <th className="py-1.5 pr-3 font-medium">Data Crazy · UTM</th>
              <th className="py-1.5 font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const ehEu = u.id === eu.id;
              const intocavel = u.papel === "chefe" && !souChefe;
              return (
                <tr key={u.id} className={cn("border-t border-line-soft align-top text-ink", u.status === "desativado" && "opacity-60")}>
                  <td className="py-2 pr-3 text-white">
                    {u.nome ?? <span className="text-ink-faint">sem nome</span>}
                    {ehEu && <span className="ml-1.5 text-[11px] text-ink-faint">(você)</span>}
                    {u.teste && (
                      <Etiqueta cor="roxo" className="ml-1.5">
                        teste
                      </Etiqueta>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-ink-dim">{u.email}</td>
                  <td className="py-2 pr-3">{u.papel ? NOME_PAPEL[u.papel] : "—"}</td>
                  <td className="py-2 pr-3">
                    <Etiqueta cor={COR_STATUS[u.status]}>{NOME_STATUS[u.status]}</Etiqueta>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-dim">{quando(u.ultimoAcesso)}</td>
                  <td className="py-2 pr-3 text-[12.5px] text-ink-dim">
                    {u.atendente?.nome ?? "—"} · <span className="font-mono">{u.utm ?? "—"}</span>
                  </td>
                  <td className="py-2">
                    {intocavel ? (
                      <span className="text-[11.5px] text-ink-faint">só o chefe edita</span>
                    ) : (
                      <Gaveta rotulo="Editar">
                        <div className="flex min-w-[min(640px,80vw)] flex-col gap-4">
                          <FormEditar
                            id={u.id}
                            papel={u.papel}
                            atendente={u.atendente?.dcId ?? null}
                            utm={u.utm}
                            podeChefe={souChefe}
                            atendentes={atendentes
                              .filter((a) => !a.suporte)
                              .map((a) => ({ dcId: a.dcId, nome: a.nome, livre: a.equipeId === null || a.equipeId === u.equipeId }))}
                          />
                          {u.status === "pendente" && <BotaoNovoLink id={u.id} />}
                          {!ehEu && (
                            <div className="border-t border-line-soft pt-3">
                              <BotaoAtivo id={u.id} nome={u.nome ?? u.email} desativado={u.status === "desativado"} />
                            </div>
                          )}
                        </div>
                      </Gaveta>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="m-0 mt-2 text-[11.5px] text-ink-faint">
          {PAPEIS.map((p) => `${p.nome}: ${p.descricao}`).join(" · ")}. Desativar corta o acesso e mantém o histórico (vendas, check-ins, atendimentos). Troca de papel vale
          quando o login da pessoa renova (até 1 h) ou ela sai e entra.
        </p>
      </section>

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-white">Registro de mudanças</h2>
        {registro.length === 0 ? (
          <p className="m-0 text-[13px] italic text-ink-faint">Nenhuma mudança ainda.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
            {registro.map((r, i) => (
              <li key={i} className="text-ink-dim">
                <span className="tabular-nums text-ink-faint">{quando(r.quando)}</span> · <span className="text-ink">{r.por ?? "?"}</span> {NOME_ACAO[r.acao] ?? r.acao}{" "}
                <span className="text-white">{r.alvo}</span>
                {r.antes || r.depois ? (
                  <span>
                    {" "}
                    ({r.antes ? `${resumo(r.antes)} → ` : ""}
                    {resumo(r.depois)})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
