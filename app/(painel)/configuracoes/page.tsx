import { AtivarNotificacoes } from "../_componentes/notificacoes-aparelho";

// Notificações deste aparelho (antes no Check-in). Desde 21/11/2026 os avisos que sobram são os de
// venda e de reembolso: cada pessoa ativa em cada aparelho dela.
export default function NotificacoesPage() {
  return (
    <section className="glass-lite glass-static max-w-2xl p-5">
      <h2 className="mb-1 text-[15px] font-semibold text-white">Notificações deste aparelho</h2>
      <p className="m-0 mb-4 text-[12.5px] leading-relaxed text-ink-dim">
        Avisos de venda e de reembolso no navegador e no celular, mesmo com o app fechado. Ative em cada aparelho. No iPhone, instale a Ospinabiz na tela
        de início e abra pelo ícone.
      </p>
      <AtivarNotificacoes />
    </section>
  );
}
