// Integração com a API da Data Crazy (DATACRAZY_API_KEY). Só leitura (GET).
// Sem regra de negócio aqui: só busca e devolve os campos que o painel usa.
// Docs: https://docs.datacrazy.io (spec em https://api.datacrazy.io/v1/api/openapi/v1/json)
//
// Limite da Data Crazy: 60 chamadas por minuto POR ROTA. Este cliente espera
// ~1,05 s entre chamadas da mesma rota e, se mesmo assim vier 429, espera o
// Retry-After. Nunca passa do prazo (`ate`): se não der tempo, lança PrazoEsgotado.

const BASE = "https://api.g1.datacrazy.io/api/v1";
const INTERVALO_POR_ROTA_MS = 1050;

export class PrazoEsgotado extends Error {
  constructor() {
    super("prazo da rodada esgotado");
  }
}

export type DcEtiqueta = { id: string; name: string; color: string | null };
export type DcAtendente = { id: string; name: string };
export type DcInstancia = { id: string; name: string };
export type DcLead = {
  id: string;
  createdAt: string;
  updatedAt: string | null;
  name: string | null;
  rawPhone: string | null;
  tags: { id: string; name: string }[];
  contacts: { contactId: string | null }[];
};
export type DcConversa = {
  id: string;
  createdAt: string;
  lastMessageDate: string | null;
  attendants: { id: string }[];
  instance: { id: string; name: string } | null;
  contact: { contactId: string | null } | null;
};
export type DcEventoHistorico = {
  id: string;
  createdAt: string;
  historyCode: string;
  sessionName: string | null;
  parameters: Record<string, unknown> | null;
};

export class DataCrazy {
  private ultimaChamada = new Map<string, number>();
  chamadas = 0;

  constructor(
    private chave: string,
    /** horário-limite (ms) para começar uma chamada */
    private ate: number,
  ) {}

  static doAmbiente(ate: number): DataCrazy {
    const chave = process.env.DATACRAZY_API_KEY;
    if (!chave) throw new Error("Falta DATACRAZY_API_KEY no servidor.");
    return new DataCrazy(chave, ate);
  }

  /** GET com espera por rota. `rota` é o nome usado para contar o limite (ex.: "/leads/:id/history"). */
  private async get<T>(rota: string, caminho: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(BASE + caminho);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const espera = (this.ultimaChamada.get(rota) ?? 0) + INTERVALO_POR_ROTA_MS - Date.now();
      if (Date.now() + Math.max(espera, 0) > this.ate) throw new PrazoEsgotado();
      if (espera > 0) await dormir(espera);

      this.ultimaChamada.set(rota, Date.now());
      this.chamadas++;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${this.chave}` }, cache: "no-store" });

      if (r.status === 429) {
        const segundos = Number(r.headers.get("retry-after")) || 30;
        this.ultimaChamada.set(rota, Date.now() + segundos * 1000 - INTERVALO_POR_ROTA_MS);
        continue;
      }
      if (!r.ok) throw new Error(`Data Crazy ${rota}: HTTP ${r.status}`);
      return (await r.json()) as T;
    }
    throw new Error(`Data Crazy ${rota}: limite de chamadas (429) repetido`);
  }

  async etiquetas(): Promise<DcEtiqueta[]> {
    const r = await this.get<{ data?: DcEtiqueta[] } | DcEtiqueta[]>("/tags", "/tags", { take: 500 });
    return lista(r);
  }

  async atendentes(): Promise<DcAtendente[]> {
    const r = await this.get<{ data?: DcAtendente[] }>("/attendants/multi", "/attendants/multi", { take: 500 });
    return lista(r);
  }

  async instancias(): Promise<DcInstancia[]> {
    const r = await this.get<{ data?: DcInstancia[] }>("/instances", "/instances", { take: 500 });
    return lista(r);
  }

  /** Leads criados entre `desde` e `ate` (ISO), do mais novo para o mais antigo. */
  async leads(desde: string, ate: string, take = 500): Promise<DcLead[]> {
    const r = await this.get<{ data?: DcLead[] }>("/leads", "/leads", {
      take,
      "filter[createdAtGreaterOrEqual]": desde,
      "filter[createdAtLessOrEqual]": ate,
    });
    return lista(r);
  }

  /** Conversas da mais recente (última mensagem) para a mais antiga. */
  async conversas(skip: number, take = 100): Promise<DcConversa[]> {
    const r = await this.get<{ data?: DcConversa[] }>("/conversations", "/conversations", { skip, take });
    return lista(r);
  }

  async historicoDoLead(leadId: string, skip = 0, take = 200): Promise<{ eventos: DcEventoHistorico[]; total: number }> {
    const r = await this.get<{ data?: DcEventoHistorico[]; count?: number }>(
      "/leads/:id/history",
      `/leads/${encodeURIComponent(leadId)}/history`,
      { skip, take },
    );
    const eventos = lista(r);
    return { eventos, total: r.count ?? eventos.length };
  }
}

function lista<T>(r: { data?: T[] } | T[]): T[] {
  return Array.isArray(r) ? r : (r.data ?? []);
}

function dormir(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms));
}
