import type { EstadoForm } from "../acoes";

// Mensagem de resultado do formulário: erro em azul de destaque, sucesso discreto.
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
