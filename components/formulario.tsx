// Peças de formulário usadas por mais de um módulo (BMs, Tarefas...).

export type EstadoForm = { erro?: string; ok?: string };

export const classeSelect =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const classeOpcao = "bg-[#0a1418]";

/** Rótulo + campo. */
export function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-[13px] text-ink-dim ${className ?? ""}`}>
      {rotulo}
      {children}
    </label>
  );
}

/** Mensagem de resultado do formulário: erro em azul de destaque, sucesso discreto. */
export function Aviso({ estado }: { estado: EstadoForm }) {
  if (estado.erro) {
    return (
      <p role="alert" className="text-[13px] text-accent-3">
        {estado.erro}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="text-[13px] text-ink-dim">
        {estado.ok}
      </p>
    );
  }
  return null;
}

/** Edição que abre no próprio card. Fechada fica no fim da linha; aberta ocupa a largura toda. */
export function Gaveta({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <details className="group ml-auto [&[open]]:ml-0 [&[open]]:basis-full">
      <summary className="cursor-pointer list-none rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white group-open:text-white">
        {rotulo}
      </summary>
      <div className="mt-3 rounded-2xl border border-line-soft bg-bg-raised p-4">{children}</div>
    </details>
  );
}
