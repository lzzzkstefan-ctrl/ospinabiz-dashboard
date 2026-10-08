import { TrocarCapa } from "./trocar-capa";

// Capa "sem caixa" no estilo do masterview: ocupa a largura da tela, a imagem some
// no fundo da página e escurece embaixo para o título ficar legível.
// Sem imagem, mostra a aurora azul.
export function Capa({ url, admin }: { url: string | null; admin: boolean }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 h-[460px] w-screen -translate-x-1/2">
      <div className="cover-bleed-mask absolute inset-0">
        {url ? (
          // Uma imagem só, já no tamanho certo: o otimizador do Next não ajuda aqui.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="aurora-soft absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {/* topo escuro: o menu flutuante (vidro) passa por cima da capa */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent" />
      </div>
      {admin && (
        <div className="relative mx-auto h-full max-w-[1180px] px-6">
          <TrocarCapa />
        </div>
      )}
    </div>
  );
}
