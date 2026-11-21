import { MolduraArquivada } from "@/components/arquivado";

// Aba arquivada em 21/11/2026: abre em modo leitura (lib/arquivo.ts).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MolduraArquivada nome="Funil (antigo)">{children}</MolduraArquivada>;
}
