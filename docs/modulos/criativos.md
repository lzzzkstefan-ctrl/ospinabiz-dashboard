# Criativos (fase 1, 26/11/2026)

Só a gestão (`app_metadata.gestao`: Davi e Rodrigo). Bloqueio em três lugares: menu
(`components/painel-nav.tsx`), endereço (`lib/supabase/proxy.ts`, `GESTAO_PATHS`) e banco (RLS com
`privado.eh_gestao()`). Migration `20261126120000_criativos`.

## O que é

O gargalo da operação é produzir criativo em volume (meta: **10 criativos novos por semana**, temporada de
férias). A aba organiza os criativos por status e usa IA (Claude, da Anthropic) como copywriter, com o
agente em `docs/modulos/criativos-agente.md` como cérebro. O principal é a **variação do campeão**: mantém
o corpo que já vende e troca só o hook e o subhook, mais variações visuais (roupa, óculos, cenário,
legenda...) pra gravar em lote.

Regras do Rodrigo que a ferramenta respeita: criativo simples vence produzido; anúncio leva pro WhatsApp
(60 a 90 s); orgânico é o mesmo criativo com outro hook e CTA; referência de player é escolhida à mão e
**colada** (link + transcrição). A ferramenta não raspa a Biblioteca de Anúncios (ver `docs/decisoes.md`).

## Telas

- **`/criativos`**: colunas por status (Ideia → Roteiro → Gravar → Gravado → No ar → Venceu / Perdeu),
  filtro por origem, busca por título ou hook. Cartão: título, hook, origem, nº de variações e o status,
  que muda direto no cartão. Faixa "IA este mês" no topo.
- **`/criativos/novo`**, três caminhos:
  - **Tenho um criativo campeão**: cola a transcrição → a IA separa hook, subhook, corpo e CTA sem
    reescrever → a pessoa confere e salva com status **No ar** (a transcrição vai pro roteiro completo).
  - **Quero ideias**: direção opcional (dá pra colar frases reais de lead) → 5 ideias → "Virar criativo".
  - **Analisar referência**: link + transcrição do anúncio de outro player → hook, ângulo, promessa,
    estrutura, por que escala, o que adaptar sem copiar e 3 hooks nossos ("Virar criativo" guarda o link
    e a transcrição na referência).
  - Atalho "criar em branco", sem IA.
- **`/criativos/[id]`**:
  - **Gerar variações** (botão principal; precisa do corpo): diagnóstico, 10 hooks/subhooks com
    "Virar criativo" (filho com `origem = variacao`, `pai_id`, mesmo corpo e CTA do pai, status Gravar),
    matriz visual de 6 combinações e lista de gravação de 30 min, com botões de copiar.
  - **Versão orgânica**: hook dos 2 primeiros segundos, 3 alternativas, CTA de orgânico, como cortar pra
    30–45 s e legenda; "Salvar como criativo orgânico" cria um filho com `origem = organico`.
  - **Roteiro completo** (modo 3 do agente): "Usar neste criativo" preenche ângulo, formato, duração,
    hook, subhook, roteiro e CTA (e passa de Ideia pra Roteiro).
  - **Resultado**: status + **Venceu / Perdeu** com o motivo numa frase → `criativo_aprendizados`.
  - Campos editáveis (os principais à mostra; ângulo, formato, roteiro, referência e métricas em "Mais
    campos"), variações filhas, histórico da IA (cada geração reabre do jeito que saiu) e apagar.

## Tabelas

| Tabela | Pra quê |
|---|---|
| `criativos` | O criativo: título, status, ângulo, formato, duração, hook, subhook, corpo, CTA, roteiro completo, origem (`ideia_propria`, `variacao`, `referencia`, `organico`), `pai_id` (variação → campeão; apagar o pai deixa o filho solto), referência (link e transcrição), notas e `metricas` (jsonb livre: hoje custo por lead, conversas e vendas digitados). |
| `criativo_geracoes` | Cada chamada à IA: modo, entrada, saída (JSON), modelo, tokens, custo estimado em R$. Histórico e trava de gasto. **Ninguém altera nem apaga** (é o que conta o gasto). Falha também é gravada quando gastou token. |
| `criativo_aprendizados` | Memória da operação: venceu/perdeu + motivo. Os últimos 20 entram no fim do system prompt. |

RLS nas três: a gestão lê e escreve tudo (menos alterar/apagar gerações); `anon` nada.

## Fluxo da IA

1. Botão na tela → `POST /api/criativos/gerar` (`{ modo, criativo_id?, texto?, link? }`). A rota confere
   se quem chamou é da gestão e chama `modulos/criativos/gerar.ts`. `maxDuration = 300` (máximo do Hobby
   da Vercel com Fluid compute, o mesmo que o Funil já usa).
2. `gerar.ts` confere a **trava de gasto**: soma `custo_estimado_brl` do mês (horário de Brasília). Se já
   chegou em `CRIATIVOS_LIMITE_MENSAL_BRL` (padrão R$ 100), responde o aviso e não chama a IA.
3. `prompt.ts` (só servidor) monta o system prompt: o agente (do "## 1. Quem você é" em diante) + um
   bloco "rodando no dashboard" (responder só JSON, não inventar, marcar o que precisa confirmar), em
   cache na Anthropic; depois a memória da operação (últimos 20 aprendizados).
4. `lib/integracoes/anthropic.ts` chama o **Claude Sonnet 5.5** (`claude-sonnet-5-5`) em streaming,
   pedindo JSON no formato fixo do modo (`modulos/criativos/formatos.ts`, structured outputs).
5. O JSON é conferido com o schema. Quebrado ou cortado → pede **de novo uma vez**. Recusa do filtro de
   segurança → a API tenta sozinha num modelo reserva (`fallbacks: "default"`).
6. Grava em `criativo_geracoes` (com o login de quem clicou) e devolve pra tela.

Modos: `variacoes`, `ideias`, `roteiro`, `organico`, `analise_referencia` e `separar` (separar o campeão;
não estava na lista original, entrou pra o gasto dele também contar).

Esforço de raciocínio: `high` nos modos de criação; `low` no separar (só recorta o texto).

## Custos

- Preço do Sonnet 5.5: US$ 2 por milhão de tokens de entrada, US$ 10 por milhão de saída (o raciocínio
  conta como saída). O agente vai em cache: da 2ª chamada em diante (em até 5 min) a parte dele custa ~5%.
- Conversão pra real pela cotação de `CRIATIVOS_COTACAO_DOLAR` (padrão 6, de propósito acima do real, pra o
  painel não mostrar menos do que a fatura). É **estimativa**: a fatura de verdade fica no console da Anthropic.
- Ordem de grandeza (estimada, ainda **sem medição real**): uma geração de variações deve ficar entre
  R$ 0,20 e R$ 1,00; separar campeão, centavos. Com o limite padrão de R$ 100 dá pra ~100+ gerações no mês.
  Conferir com as primeiras gerações (o custo de cada uma aparece na tela e no histórico).

## Variáveis de ambiente

| Nome | Onde | Pra quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` e Vercel | Chave da API. Sem ela os botões avisam e não geram. |
| `CRIATIVOS_LIMITE_MENSAL_BRL` | Vercel (opcional) | Trava do mês em reais. Padrão 100. |
| `CRIATIVOS_COTACAO_DOLAR` | Vercel (opcional) | Cotação usada na estimativa. Padrão 6. |

## Mudar o agente

Editar `docs/modulos/criativos-agente.md` e subir (vale no próximo deploy). O arquivo vai junto pra função
da Vercel por `outputFileTracingIncludes` (`next.config.ts`); nunca vai pro navegador.

## Fora desta fase

Upload de vídeo com transcrição automática; métricas puxadas do Gerenciador de Anúncios; qualquer raspagem
da Biblioteca de Anúncios.
