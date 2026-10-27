// Mapa do funil: lê o JSON de uma automação exportada da Data Crazy e devolve SÓ a estrutura (tipo de
// bloco, ordem, primeiras palavras do texto e os caminhos). Roda no navegador: o arquivo inteiro nunca
// vai para o servidor. Sem banco nem API. Regras em docs/modulos/funil.md ("Mapa do funil").
//
// O formato do export não é documentado pela Data Crazy, então a leitura é tolerante: procura "nós"
// (objetos com id e tipo/dados) e "ligações" (source/target, from/to ou next) em qualquer lugar do JSON,
// como fazem os editores de fluxo. O que não for reconhecido vira aviso na tela.

export type TipoBloco = "texto" | "audio" | "video" | "imagem" | "documento" | "outro";
export type BlocoMapa = { id: string; tipo: TipoBloco; inicio: string | null };
export type CaminhoMapa = { nome: string; blocos: string[]; juntaveis: string[][] };
export type MapaLido = { nome: string; arquivo: string; blocos: BlocoMapa[]; caminhos: CaminhoMapa[]; avisos: string[] };

type Obj = Record<string, unknown>;
type No = { id: string; obj: Obj; tipoNo: string; rotulo: string | null };
type Ligacao = { de: string; para: string; rotulo: string | null };

const MAX_CAMINHOS = 60;
const PALAVRAS = 6;

const ehObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const idDe = (x: unknown) => (typeof x === "string" || typeof x === "number" ? String(x) : null);

/** Nós de controle (não mandam mensagem): condição, espera, etiqueta, webhook... */
const CONTROLE = /(condi|condition|if|switch|split|random|wait|delay|espera|aguard|timer|tag|etiqueta|webhook|http|api|start|inicio|início|trigger|gatilho|end|fim|goto|jump|variable|variavel|variável|assign|crm|pipeline|transfer|atendente|finish|finaliz)/i;

/** "Olá {{nome}}, tudo bem? Vou te mostrar..." → "Olá {{nome}}, tudo bem? Vou te" (só as primeiras palavras) */
export function primeirasPalavras(t: string | null, n = PALAVRAS): string | null {
  if (!t) return null;
  const palavras = t.replace(/\s+/g, " ").trim().split(" ");
  return palavras.slice(0, n).join(" ") + (palavras.length > n ? "…" : "");
}

/** Tipo de mídia pelo tipo declarado ou pela extensão de alguma URL dentro do bloco. */
function tipoDaMidia(o: Obj): TipoBloco | null {
  const declarado = [o.type, o.kind, o.mediaType, o.messageType, ehObj(o.data) ? o.data.type : null, ehObj(o.data) ? o.data.mediaType : null]
    .map((x) => (typeof x === "string" ? x.toLowerCase() : ""))
    .join(" ");
  const corpo = JSON.stringify(o).toLowerCase();
  if (/audio|áudio|voice|ptt/.test(declarado) || /\.(ogg|opus|mp3|m4a|wav|aac)\b/.test(corpo)) return "audio";
  if (/video|vídeo/.test(declarado) || /\.(mp4|mov|webm|3gp)\b/.test(corpo)) return "video";
  if (/image|imagem|photo|foto|sticker/.test(declarado) || /\.(jpe?g|png|webp|gif)\b/.test(corpo)) return "imagem";
  if (/document|documento|file|arquivo|pdf/.test(declarado) || /\.(pdf|docx?|xlsx?)\b/.test(corpo)) return "documento";
  return null;
}

/** Primeiro texto de mensagem achado no bloco (campos comuns: text, message, content, body, caption). */
function textoDoBloco(o: Obj, profundidade = 0): string | null {
  if (profundidade > 3) return null;
  for (const k of ["text", "texto", "message", "mensagem", "content", "conteudo", "body", "caption", "legenda", "value"]) {
    const t = texto(o[k]);
    if (t && !/^https?:\/\//.test(t)) return t;
  }
  for (const v of Object.values(o)) {
    if (ehObj(v)) {
      const t = textoDoBloco(v, profundidade + 1);
      if (t) return t;
    }
  }
  return null;
}

/** Blocos de mensagem de um nó (um nó pode ter vários conteúdos em lista). */
function blocosDoNo(no: No): BlocoMapa[] {
  const dados = ehObj(no.obj.data) ? no.obj.data : no.obj;
  for (const k of ["messages", "mensagens", "contents", "conteudos", "items", "blocks"]) {
    const lista = dados[k];
    if (Array.isArray(lista) && lista.length && lista.every(ehObj)) {
      return (lista as Obj[]).flatMap((item, i) => {
        const tipo = tipoDaMidia(item) ?? (textoDoBloco(item) ? "texto" : null);
        return tipo ? [{ id: `${no.id}#${i + 1}`, tipo, inicio: tipo === "texto" ? primeirasPalavras(textoDoBloco(item)) : null }] : [];
      });
    }
  }
  if (CONTROLE.test(no.tipoNo) && !/message|mensagem|send|enviar|text|audio|video|image|media/i.test(no.tipoNo)) return [];
  const midia = tipoDaMidia(no.obj);
  if (midia) return [{ id: no.id, tipo: midia, inicio: null }];
  const t = textoDoBloco(dados);
  if (t) return [{ id: no.id, tipo: "texto", inicio: primeirasPalavras(t) }];
  if (/message|mensagem|send|enviar/i.test(no.tipoNo)) return [{ id: no.id, tipo: "outro", inicio: null }];
  return [];
}

/** Junta nós e ligações de qualquer lugar do JSON. */
function coletar(raiz: unknown): { nos: Map<string, No>; ligacoes: Ligacao[] } {
  const nos = new Map<string, No>();
  const ligacoes: Ligacao[] = [];
  const visitar = (x: unknown, profundidade: number) => {
    if (profundidade > 12) return;
    if (Array.isArray(x)) {
      for (const y of x) visitar(y, profundidade + 1);
      return;
    }
    if (!ehObj(x)) return;
    const de = idDe(x.source ?? x.from ?? x.sourceId ?? x.origin);
    const para = idDe(x.target ?? x.to ?? x.targetId ?? x.destination);
    if (de && para) {
      const rotulo = texto(x.label) ?? texto(ehObj(x.data) ? x.data.label : null) ?? texto(x.sourceHandle) ?? texto(x.condition) ?? null;
      ligacoes.push({ de, para, rotulo });
    } else {
      const id = idDe(x.id ?? x.nodeId ?? x.key);
      const tipoNo = [x.type, x.kind, x.nodeType, ehObj(x.data) ? x.data.type : null].find((t) => typeof t === "string") as string | undefined;
      if (id && (tipoNo || ehObj(x.data))) {
        const dados = ehObj(x.data) ? x.data : x;
        nos.set(id, { id, obj: x, tipoNo: tipoNo ?? "", rotulo: texto(dados.label) ?? texto(dados.name) ?? texto(dados.title) ?? null });
        for (const k of ["next", "nextId", "nextNodeId", "nextStep", "proximo"]) {
          const prox = idDe(x[k] ?? dados[k]);
          if (prox) ligacoes.push({ de: id, para: prox, rotulo: null });
        }
      }
    }
    for (const v of Object.values(x)) if (typeof v === "object" && v !== null) visitar(v, profundidade + 1);
  };
  visitar(raiz, 0);
  return { nos, ligacoes: ligacoes.filter((l) => nos.has(l.de) && nos.has(l.para)) };
}

/** Rótulo de saída útil ("GCS 278", "Pix"); ids e handles técnicos ("source-1", "a8f3...") não servem. */
function rotuloUtil(r: string | null): string | null {
  if (!r) return null;
  if (/^(source|target|handle|output|out|default|bottom|right|left|top)[-_]?\d*$/i.test(r)) return null;
  if (/^[0-9a-f-]{16,}$/i.test(r)) return null;
  return r.slice(0, 60);
}

/** Lê um arquivo exportado (pode ter um ou vários fluxos). */
export function lerMapas(json: unknown, arquivo: string): MapaLido[] {
  const fluxos = Array.isArray(json) && json.length > 0 && json.every((f) => ehObj(f) && (Array.isArray(f.nodes) || ehObj(f.flow))) ? json : [json];
  return fluxos.map((f, i) => lerUmMapa(f, fluxos.length > 1 ? `${arquivo} (${i + 1})` : arquivo));
}

function lerUmMapa(json: unknown, arquivo: string): MapaLido {
  const avisos: string[] = [];
  const raiz = ehObj(json) ? json : {};
  const nome =
    texto(raiz.name) ?? texto(raiz.nome) ?? texto(raiz.title) ?? (ehObj(raiz.flow) ? texto(raiz.flow.name) : null) ?? arquivo.replace(/\.json$/i, "");
  const { nos, ligacoes } = coletar(json);
  if (!nos.size) return { nome, arquivo, blocos: [], caminhos: [], avisos: ["Não achei nenhum bloco no arquivo. Ele é o export de uma automação da Data Crazy?"] };

  const blocosDe = new Map<string, BlocoMapa[]>();
  for (const no of nos.values()) blocosDe.set(no.id, blocosDoNo(no));
  const blocos = [...blocosDe.values()].flat();
  if (!blocos.length) avisos.push("Achei os blocos, mas nenhum parece mandar mensagem (texto, áudio, vídeo ou imagem).");

  const saidas = new Map<string, Ligacao[]>();
  const entram = new Set<string>();
  for (const l of ligacoes) {
    saidas.set(l.de, [...(saidas.get(l.de) ?? []), l]);
    entram.add(l.para);
  }
  // começo: nó sem ninguém apontando para ele (o gatilho); se houver vários, o que parece início vem primeiro
  let inicios = [...nos.keys()].filter((id) => !entram.has(id));
  if (!inicios.length) inicios = [nos.keys().next().value as string];
  inicios.sort((a, b) => Number(/start|inicio|início|trigger|gatilho/i.test(nos.get(b)!.tipoNo)) - Number(/start|inicio|início|trigger|gatilho/i.test(nos.get(a)!.tipoNo)));
  if (!ligacoes.length && nos.size > 1) avisos.push("Não achei as ligações entre os blocos: a ordem é a do arquivo.");

  // todos os caminhos do começo até o fim (sem repetir bloco no mesmo caminho)
  const caminhos: { nomes: string[]; nos: string[] }[] = [];
  const andar = (id: string, nomes: string[], visitados: string[]) => {
    if (caminhos.length >= MAX_CAMINHOS) return;
    const seguintes = (saidas.get(id) ?? []).filter((l) => !visitados.includes(l.para));
    if (!seguintes.length) {
      caminhos.push({ nomes, nos: visitados });
      return;
    }
    for (const l of seguintes) {
      const destino = nos.get(l.para)!;
      const rotulo = seguintes.length > 1 ? (rotuloUtil(l.rotulo) ?? rotuloUtil(destino.rotulo) ?? `saída ${seguintes.indexOf(l) + 1}`) : null;
      andar(l.para, rotulo ? [...nomes, rotulo] : nomes, [...visitados, l.para]);
    }
  };
  if (ligacoes.length) for (const i of inicios) andar(i, [], [i]);
  else caminhos.push({ nomes: [], nos: [...nos.keys()] });
  if (caminhos.length >= MAX_CAMINHOS) avisos.push(`O fluxo tem muitos caminhos: mostrei só os ${MAX_CAMINHOS} primeiros.`);

  return {
    nome,
    arquivo,
    blocos,
    caminhos: caminhos.map((c, i) => {
      const ids: string[] = [];
      const juntaveis: string[][] = [];
      let seguidos: string[] = [];
      for (const id of c.nos) {
        const bs = blocosDe.get(id) ?? [];
        if (!bs.length) {
          // bloco de controle (espera, condição...) separa as mensagens
          if (seguidos.length > 1) juntaveis.push(seguidos);
          seguidos = [];
          continue;
        }
        for (const b of bs) {
          ids.push(b.id);
          if (b.tipo === "texto") seguidos.push(b.id);
          else {
            if (seguidos.length > 1) juntaveis.push(seguidos);
            seguidos = [];
          }
        }
      }
      if (seguidos.length > 1) juntaveis.push(seguidos);
      return { nome: c.nomes.length ? c.nomes.join(" › ") : caminhos.length > 1 ? `Caminho ${i + 1}` : "Caminho único", blocos: ids, juntaveis };
    }),
    avisos,
  };
}
