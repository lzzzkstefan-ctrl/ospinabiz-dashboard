import { PainelNav, PainelNavMobile } from "@/components/painel-nav";
import { UsuarioAtual } from "@/components/usuario-atual";
import { ehAdmin } from "@/lib/auth/papeis";
import { Suspense } from "react";

// O papel vem do login (pedido), então o menu fica dentro do Suspense. Enquanto carrega,
// mostra o menu de atendente: nunca aparece aba de admin para quem não é admin.
async function Menu() {
  const admin = await ehAdmin();
  return <Navegacao admin={admin} />;
}

function Navegacao({ admin }: { admin: boolean }) {
  return (
    <>
      {/* na impressão (relatório de fechamento em PDF) o menu some */}
      <div className="print:hidden">
        <PainelNav
          admin={admin}
          usuario={
            <Suspense>
              <UsuarioAtual />
            </Suspense>
          }
        />
      </div>
      <div className="print:hidden">
        <PainelNavMobile admin={admin} />
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
            <Navegacao admin={false} />
          </Suspense>
        }
      >
        <Menu />
      </Suspense>
      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-8 md:pb-16 md:pt-24 print:max-w-none print:p-0">{children}</main>
    </>
  );
}
