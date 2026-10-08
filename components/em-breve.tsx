export function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-tight">{titulo}</h1>
      <div className="glass-lite glass-static max-w-lg p-5">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">Em breve</p>
        <p className="text-[13.5px] text-ink-dim">{descricao}</p>
      </div>
    </div>
  );
}
