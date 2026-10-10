import { PainelNav, PainelNavMobile, type PapelMenu } from "@/components/painel-nav";
import { UsuarioAtual } from "@/components/usuario-atual";
import { usuarioLogado } from "@/lib/auth/papeis";
import { Suspense } from "react";

// O papel vem do login (pedido), então o menu fica dentro do Suspense. Enquanto carrega,
// mostra o menu mais restrito (o do plantonista): nunca aparece aba que a pessoa não pode abrir.
async function Menu() {
  const papel = (await usuarioLogado())?.papel ?? "plantonista";
  return <Navegacao papel={papel} />;
}

function Navegacao({ papel }: { papel: PapelMenu }) {
  return (
    <>
      {/* na impressão (relatório de fechamento em PDF) o menu some */}
      <div className="print:hidden">
        <PainelNav
          papel={papel}
          usuario={
            <Suspense>
              <UsuarioAtual />
            </Suspense>
          }
        />
      </div>
      <div className="print:hidden">
        <PainelNavMobile papel={papel} />
      </div>
    </>
  );
}

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* o menu lê o endereço (usePathname): em página com parâmetro desconhecido no build
          (ex.: /webinarios/[id]) isso só se resolve no pedido, então o menu provisório também
          fica dentro de um Suspense (docs: use-pathname, "Cache Components") */}
      <Suspense
        fallback={
          <Suspense fallback={null}>
            <Navegacao papel="plantonista" />
          </Suspense>
        }
      >
        <Menu />
      </Suspense>
      {/* faixa no topo (computador): o conteúdo que rola some por baixo do menu fixo em vez de ficar
          atrás dele, legível e "por baixo" */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden h-[92px] bg-gradient-to-b from-background via-background/85 to-transparent md:block print:hidden" />
      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-8 md:pb-16 md:pt-[112px] print:max-w-none print:p-0">{children}</main>
    </>
  );
}
