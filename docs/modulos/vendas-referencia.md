> **Referência, não é deste projeto.** Cópia do `docs/lock-in.md` do masterview (aba Lock in),
> feita em 2026-10-08 só como base para as regras do módulo Vendas. Caminhos, tabelas e
> variáveis citados abaixo são do masterview; nada aqui é usado direto no ospinabiz-dashboard.

# Lock in — como a aba foi construída

Aba **Dinheiro › Lock in** do masterview (`/dinheiro?aba=lock-in`). Documento de leitura:
explica o que existe hoje no código, sem propor mudança. Nada aqui tem chave, token,
telefone ou dado real de cliente.

---

## 1. Objetivo e de onde veio

**O problema:** como atendente da operação de X1, o Davi ganha comissão sobre as vendas que
fecha. Até setembro/2026 isso era controlado à mão num banco **"Vendas" do Notion** (colunas
Nome, Categoria = ticket, Plataforma, Status, Date), e todo fim de mês ele montava o
**fechamento** e mandava pro chefe (Rodrigo) no WhatsApp.

**O que a aba faz:**

- recebe as vendas da Hubla sozinha (webhook) e separa as que são do Davi;
- calcula quantidade, bruto, líquido e comissão do mês, na margem escolhida (6% a 10%);
- monta a mensagem de fechamento pro Rodrigo e abre o WhatsApp com ela pronta;
- gera um link público só leitura com as vendas do mês (pra conferência);
- guarda o histórico de fechamentos e mostra um resumo anual.

**Como o Notion entrou:** o CSV exportado do banco "Vendas" pode ser importado pela tela
(botão "Importar CSV"), mas **só as linhas da Kirvano entram**. O histórico da Hubla veio da
planilha exportada da própria Hubla (script `scripts/import-hubla-xlsx.mjs`), porque ela traz
o id da fatura e evita duplicar com o webhook.

Primeiro commit: `1ff74f8` (25/09/2026). Última mudança na aba: `236c4be` (26/09/2026).

---

## 2. Fluxo completo (Hubla → tela)

```
Venda paga na Hubla
   │  Hubla dispara o webhook (payload v2, evento "Fatura")
   ▼
POST /api/webhooks/hubla            app/api/webhooks/hubla/route.ts
   │  1. confere o header x-hubla-token  (≠ → 401)
   │  2. lê o corpo, tenta JSON
   │  3. acha o dono pelo OWNER_EMAIL
   │  4. GRAVA o evento bruto em webhook_eventos   (falhou → 500, a Hubla tenta de novo)
   │  5. responde 200 na hora
   ▼
after(() => processar(...))         roda depois da resposta
   │  lerFatura()  lib/hubla.ts    → tira do payload só o que importa
   │  reembolso?   → marca a venda como "Reembolso"
   │  pagamento?   → já existe? (duplicada) → para
   │               → utm_term = o meu?  não → só log
   │               → acha o ticket pelo nome do item (lib/ofertas.ts)
   │                    não achou → decisao "revisar" (caixa "A revisar")
   │                    achou     → INSERT em vendas (origem "webhook")
   ▼
webhook_eventos.processado = true (+ decisao, venda_id ou erro)
   ▼
Tela /dinheiro?aba=lock-in          app/dinheiro/page.tsx → AbaLockIn
   │  busca vendas do mês, tickets, margem, eventos "revisar"
   ▼
components/dinheiro/lock-in/painel.tsx  (totais, rosca, abas Pago/Reembolso/Tabela,
                                          caixa "A revisar", fechamento do mês)
```

### 2.1 Recebimento e validação

Arquivo: `app/api/webhooks/hubla/route.ts`. A rota fica fora do login (o `proxy.ts` deixa
passar); a trava é o header `x-hubla-token`, comparado em tempo constante:

```ts
function tokenValido(recebido: string | null) {
  const esperado = process.env.HUBLA_WEBHOOK_TOKEN?.trim();
  const veio = recebido?.trim();
  const motivo = !esperado
    ? "HUBLA_WEBHOOK_TOKEN não configurado no servidor"
    : !veio
      ? "requisição sem x-hubla-token"
      : !timingSafeEqual(sha(veio), sha(esperado))
        ? "x-hubla-token diferente do configurado"
        : null;
  if (motivo) console.warn(`[webhook hubla] 401: ${motivo}`);
  return !motivo;
}
```

Por quê: sem token configurado, ninguém entra (falha fechada). O `.trim()` existe porque o
token colado na Vercel com Enter no fim dava 401 (ver seção 5).

### 2.2 Grava antes, processa depois

**Toda** entrega vira uma linha em `webhook_eventos` com o payload bruto, mesmo JSON inválido
ou repetida. Só depois de gravar é que a rota responde, e o processamento roda com `after()`:

```ts
const { data: evento, error } = await supabase.from("webhook_eventos").insert({
  user_id: userId, plataforma: "Hubla", evento: f.evento || "desconhecido",
  id_externo: f.invoiceId, payload: payload ?? { bruto: bruto.slice(0, 100_000) },
  utm_term: f.utmTerm, utm_content: f.utmContent,
  erro: payload == null ? "JSON inválido" : userId ? null : "dono (OWNER_EMAIL) não encontrado",
  processado: payload == null || !userId,
}).select("id").single();

if (error || !evento) return NextResponse.json({ ok: false }, { status: 500 }); // Hubla tenta de novo
if (payload != null && userId) after(() => processar(supabase, userId, evento.id, f));
return NextResponse.json({ ok: true });
```

Por quê: a Hubla recebe resposta rápida e nada se perde. Se o processamento quebrar, o
evento fica com `erro` preenchido e dá pra reprocessar olhando o payload.

### 2.3 Como vira linha no banco

`lerFatura()` (`lib/hubla.ts`) transforma o payload num objeto simples (`FaturaHubla`):
id da fatura, utm_term/utm_content, primeiro nome, telefone, nomes dos itens, total,
data e hora do pagamento. Depois `processar()` faz o `insert` em `vendas`:

```ts
await supabase.from("vendas").insert({
  user_id: userId,
  cliente: clienteDe(f),            // "Fulano -1234": 1º nome + 4 últimos dígitos
  ticket_id: principal.ticket?.id ?? null,
  principal_produto: principal.produto,
  oferta: principal.produto ? f.nomeOferta : null,
  bumps: principal.bumps,           // só os nomes, pra mostrar
  itens_fatura: f.itens,
  pago_em: f.pagoEm,
  plataforma: "Hubla",
  status: "Pago",
  data: f.dataPagamento ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
  origem: "webhook",
  id_externo: f.invoiceId,
});
```

O cliente nunca é gravado com nome completo nem telefone inteiro. O telefone sai do
`utm_content` no formato `lead_<telefone>`; se não vier assim, usa o do comprador:

```ts
export function telefoneDe(f: FaturaHubla) {
  const lead = f.utmContent?.trim().match(/^lead_(\+?[\d\s().-]+)$/i);
  const bruto = lead ? lead[1] : f.telefonePayer;
  return bruto.replace(/\D/g, "");
}
```

### 2.4 Como aparece na tela

- `app/dinheiro/page.tsx` → `AbaLockIn` busca: vendas do mês escolhido (`?mes=YYYY-MM`),
  eventos com `decisao = 'revisar'`, observações/link do mês (`lock_in_meses`) e
  adiantamentos. Do payload dos eventos "revisar" só sai o necessário pro navegador
  (cliente curto, valor, data, utm_term, motivo, ticket sugerido) — nada de e-mail ou documento.
- `components/dinheiro/lock-in/painel.tsx` desenha tudo: seletor de mês, margem (6–10%),
  rosca e resumo por ticket, comparativo de margens, abas **Pago / Reembolso (+ Chargeback) /
  Tabela**, filtros, nova venda manual, caixa **A revisar** (`revisar.tsx`) e o bloco de
  **fechamento** (`fechamento.tsx`).
- Sub-aba **Resumo anual** (`?visao=ano`) → `resumo-anual.tsx`.
- Página pública `/r/<código>` → `app/r/[codigo]/page.tsx` + `lib/lock-in-publico.ts` +
  `lista-publica.tsx` (sem login; tem botão "Baixar CSV").
- A visão geral do Dinheiro ("Na conta") também usa a comissão prevista do mês atual.

---

## 3. Banco

Tudo no Supabase do masterview, schema `public`, com RLS ligado e `user_id = auth.uid()` em
toda tabela (o `anon` não tem acesso a nada). O webhook e a página pública usam a
`service_role` no servidor, que ignora RLS — por isso a página pública escolhe a dedo os
campos que devolve.

### Tabelas

**`tickets`** — a tabela oficial de preços/comissões (valores exatos, não calculados).

| Coluna | Para que serve |
|---|---|
| `id`, `user_id` | identificação / dono |
| `nome` | rótulo do ticket (ex.: "288"); casa com a "Categoria" do Notion |
| `valor_bruto` | preço cheio do ticket; também é como o ticket é achado pelo preço |
| `valor_liquido` | líquido unitário (o que entra como "líquido" nos totais) |
| `comissao_6` … `comissao_10` | comissão unitária em R$ para cada margem |
| `incompleto` | calculada: true se faltar líquido ou alguma comissão |
| `provisorio` | valores ainda a confirmar (aviso na tela e na mensagem) |
| `cor`, `ordem`, `ativo` | etiqueta, ordem na tela, aposentar sem apagar |

**`vendas`** — uma linha por venda.

| Coluna | Para que serve |
|---|---|
| `cliente` | "Nome -1234" (1º nome + 4 últimos dígitos) |
| `ticket_id` | ticket da venda; null = sem comissão |
| `principal_produto` | o principal é produto, não ticket (só vendas antigas) |
| `oferta` | nome da oferta, só em venda sem ticket (explica o porquê) |
| `bumps` | nomes dos order bumps (só exibição, não conta) |
| `itens_fatura` | nomes de todos os itens da fatura |
| `plataforma` | `Hubla` ou `Kirvano` |
| `status` | `Pago`, `Reembolso`, `Chargeback` |
| `data` | dia da venda no fuso de São Paulo (é por ela que o mês filtra) |
| `pago_em` | data+hora exata do pagamento (Hubla) |
| `origem` | `webhook`, `manual` ou `hubla_import` |
| `id_externo` | id da fatura; **único por usuário** → trava contra duplicata |
| `revisar_motivo` | motivo de "A revisar" (preenchido pelos scripts) |
| `emoji` | marcação livre |
| `editado_em` | venda editada à mão → scripts de recálculo não mexem |

**`lock_in_config`** — uma linha por usuário: `margem` (6–10), `utm_term` (padrão `davi`),
`whatsapp_chefe` (só dígitos, digitado na tela), `valor_society` (sem uso hoje).

**`webhook_eventos`** — log de toda entrega: `evento`, `id_externo`, `payload` (jsonb bruto),
`utm_term`, `utm_content`, `decisao` (`minha` / `outro_atendente` / `revisar` / `nao_minha`),
`venda_id`, `processado`, `erro`, `recebido_em`, `revisado_em`.

**`lock_in_meses`** — um registro por mês: `observacoes` (entram na mensagem) e
`link_codigo` (parte aleatória da URL pública; null = link desativado).

**`lock_in_fechamentos`** — o que foi fechado/pago de verdade, um por mês: `vendas`,
`comissao`, `margem`, `observacao`, `origem` (`manual` ou `app`), `off` (mês sem trabalho),
`reembolsos`, `chargebacks`, `valor_final` (null = calcula sozinho).

**`lock_in_adiantamentos`** — adiantamentos do mês (`ano`, `mes`, `valor`, `data`); descontam
do valor final.

**`bumps`** — preços de order bumps. Criada na 0043, **sem uso no código atual**.

### Migrations

| Arquivo | O que fez |
|---|---|
| `0037_lock_in.sql` | cria `tickets`, `vendas`, `lock_in_config`, `webhook_eventos` + RLS |
| `0038_vendas_import_hubla.sql` | origem `hubla_import`, venda sem ticket, coluna `oferta` |
| `0039_lock_in_fechamento.sql` | status `Chargeback`, tabela `lock_in_meses` (observações + link) |
| `0040_vendas_principal_bumps.sql` | `principal_produto` e `bumps` |
| `0041_lock_in_whatsapp_hora.sql` | `whatsapp_chefe` e `pago_em` |
| `0042_lock_in_combo.sql` | `valor_society` e `revisar_motivo` (regra de combo, depois abandonada) |
| `0043_lock_in_bumps.sql` | tabela `bumps`, `editado_em`, `tickets.provisorio` |
| `0044_vendas_itens_fatura.sql` | `itens_fatura` |
| `0045_lock_in_fechamentos.sql` | tabela `lock_in_fechamentos` |
| `0046_lock_in_fechamento_off.sql` | coluna `off` |
| `0047_lock_in_fechamento_vendas_opcional.sql` | `vendas` do fechamento pode ser vazio |
| `0048_lock_in_adiantamentos.sql` | reembolsos/chargebacks/valor final + `lock_in_adiantamentos` |

---

## 4. Regras de negócio

### 4.1 Como identifica a venda como minha (utm_term "davi")

O `utm_term` vem de `event.invoice.paymentSession.utm.term` (ou, se vazio,
`firstPaymentSession.utm.term`). Compara sem maiúsculas e sem espaços com o valor salvo em
`lock_in_config.utm_term` (padrão `davi`, editável na tela):

```ts
export const normalizarTerm = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function decidir(utmTerm: string | null, meu: string): Decisao {
  const t = normalizarTerm(utmTerm ?? "");
  if (!t) return "revisar";                                   // sem utm → caixa "A revisar"
  return t === normalizarTerm(meu) ? "minha" : "outro_atendente";
}
```

- `minha` → segue pra virar venda.
- `outro_atendente` → só fica no log, nenhuma venda.
- `revisar` → aparece na caixa **A revisar**; o Davi clica "É minha" (escolhe o ticket e a
  venda é criada, `aceitarRevisao`) ou "Não é minha" (`recusarRevisao`, vira `nao_minha`).

### 4.2 Produto principal x order bump/combo

Regra atual (desde `1980879`): o **ticket é o item cujo nome tem "Game Changer Society" ou
"Ticket - R$…"**, e o preço é lido do próprio nome. Todo o resto é bump e **nunca conta**
(nem venda, nem bruto, nem comissão). Venda com bump = 1 venda do ticket.

```ts
export const ehItemDeTicket = (nome: string) =>
  /game\s*changer\s*society/i.test(nome) || /ticket\s*-?\s*r\$/i.test(nome);

export function ticketPelosItens(nomesItens: string[], tickets: Ticket[]): Principal {
  const nomes = nomesItens.map((n) => n.trim()).filter(Boolean);
  const item = nomes.find(ehItemDeTicket);
  const bumps = nomes.filter((n) => n !== item);
  if (!item) return { ticket: null, produto: false, bumps, motivo: "fatura sem item de ticket" };
  const preco = precoDaOferta(item);   // "R$168,90" → 16890 centavos
  if (preco == null) return { ticket: null, produto: false, bumps, motivo: `item sem preço no nome: ${item}` };
  const t = ticketDoPreco(preco, tickets);   // ticket ATIVO com valor_bruto igual
  return t ? { ticket: t, produto: false, bumps }
           : { ticket: null, produto: false, bumps, motivo: `ticket de R$ ${reais(preco)} não está na tabela` };
}
```

Os nomes dos itens vêm de `event.products[].name` + `offers[].name`
(`"<produto> - <oferta>"`). Quando o nome da oferta está desatualizado em relação ao preço
cobrado, `lib/ofertas-apelidos.json` corrige (o apelido tem prioridade sobre o preço do nome).

Sem item de ticket, ou preço que não está na tabela → **não cria venda**; o evento vai pra
"A revisar" com o motivo.

### 4.3 Qual valor é o "líquido" — e de qual campo do payload

**Nenhum.** O líquido **não vem do payload**. Ele vem da tabela `tickets`
(`valor_liquido`), multiplicado pela quantidade de vendas pagas daquele ticket:

```ts
export function liquidoUnit(t: Ticket): number | null {
  return t.valor_liquido == null ? null : centavos(Number(t.valor_liquido));
}
```

O mesmo vale pro bruto (`tickets.valor_bruto`). Do payload, o único valor lido é
`event.invoice.amount.subtotalCents` (ou `totalCents` se não houver), e ele **só aparece na
caixa "A revisar"** como referência — não entra em total nenhum.

Por quê: a tabela oficial tem os valores exatos; usar o valor pago na fatura traria desconto,
bump e taxa pra dentro da conta e não bateria centavo a centavo com o fechamento.

### 4.4 Comissão e onde fica o percentual

O **percentual escolhido** fica em `lock_in_config.margem` (6, 7, 8, 9 ou 10; salvo ao clicar
na tela). Mas a comissão **não é calculada por porcentagem**: cada ticket tem a comissão
unitária pronta em `comissao_6` … `comissao_10`, e o app soma:

```ts
// tudo em centavos; a comissão NUNCA é recalculada por porcentagem
export function comissaoUnit(t: Ticket, m: Margem): number | null {
  const v = t[`comissao_${m}`];
  return v == null ? null : centavos(Number(v));
}

export function resumirVendas(vendas: Venda[], tickets: Ticket[]): ResumoLockIn {
  for (const v of vendas) {
    if (v.status !== "Pago") continue;          // reembolso/chargeback não contam
    const t = v.ticket_id ? tickets.find((x) => x.id === v.ticket_id) : undefined;
    if (!t) { /* conta só na quantidade: "sem comissão" */ continue; }
    l.qtd += 1;
    l.bruto += centavos(Number(t.valor_bruto));
    l.liquido += liquidoUnit(t) ?? 0;
    for (const m of MARGENS) l.comissao[m] += comissaoUnit(t, m) ?? 0;
  }
  ...
}
```

(trecho resumido de `lib/lock-in.ts`)

- Calcula as 5 margens de uma vez (é o "Comissão em cada margem" da tela); a mensagem usa a
  margem salva.
- Ticket **incompleto** (falta líquido ou alguma comissão): a venda conta em quantidade e
  bruto, não em líquido/comissão, e a tela avisa.
- Venda **sem ticket**: conta só na quantidade, como "sem comissão definida".

### 4.5 Reembolso, chargeback e venda duplicada

**Reembolso** — eventos `invoice.refunded` ou `refund_request.accepted`. Acha a venda pelo id
da fatura e troca o status:

```ts
if (reembolso) {
  const { data } = await supabase.from("vendas")
    .update({ status: "Reembolso", atualizado_em: new Date().toISOString() })
    .eq("user_id", userId).eq("id_externo", f.invoiceId!).select("id");
  return concluir(supabase, eventoId, data?.length
    ? { venda_id: data[0].id }
    : { erro: "reembolso de fatura sem venda (de outro atendente ou ainda não revisada)" });
}
```

A venda não é apagada: sai dos totais (só `Pago` conta) e entra na contagem de reembolsos.

**Chargeback** — **não tem tratamento no webhook**. O status existe (0039) e só é marcado à
mão, pelo detalhe da venda. Conta igual reembolso: fora dos totais, contado à parte.

**Duplicada** — três travas:

1. antes de criar, procura venda com o mesmo `id_externo` ou evento anterior da mesma fatura
   já decidido:
   ```ts
   if (vendaExistente || anteriores?.length) {
     return concluir(supabase, eventoId, { venda_id: vendaExistente?.id ?? null, erro: "evento repetido: nada criado" });
   }
   ```
2. no banco, `unique (user_id, id_externo)` em `vendas`; se duas entregas chegam juntas, a
   segunda bate no erro `23505` e é registrada como "evento repetido";
3. na importação do CSV do Notion, a chave é `cliente | data | ticket` (`chaveVenda`), e linha
   repetida não é gravada.

Os scripts de importação também pulam fatura que já existe (ex.: veio pelo webhook).

### 4.6 Fechamento do mês (período, fuso, totais)

**Período:** mês `YYYY-MM`, intervalo `[dia 1, dia 1 do mês seguinte)` sobre `vendas.data`:

```ts
export function intervaloMes(mes: string) {
  return { inicio: `${mes}-01`, fim: `${somarMes(mes, 1)}-01` };
}
```

**Fuso:** `America/Sao_Paulo` em tudo. A data da venda é o instante `statusAt "paid"` da
fatura convertido pro dia de São Paulo (venda paga às 22h do dia 30 fica no dia 30, não no 1º
em UTC). O "hoje"/mês atual da tela também usa `hojeBR()`.

```ts
function diaBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
```

**Totais:** `resumirVendas()` sobre as vendas do mês (seção 4.4). Reembolsos e chargebacks
são contados à parte.

**Mensagem pro Rodrigo** (`textoFechamento`, botão "Enviar para o Rodrigo" → abre
`wa.me/<whatsapp_chefe>?text=…`): bruto do mês, total de vendas aprovadas, comissão na margem,
reembolsos, chargebacks, margem, linhas "N vendas R$X" por ticket, adiantamentos e valor
final (se houver), observações e o link público (se ativo). Ao enviar,
`registrarEnvioFechamento` grava o mês em `lock_in_fechamentos` com `origem = 'app'`.

**Valor final** = comissão − adiantamentos do mês, nunca negativo (ou o valor digitado à mão):

```ts
export function valorFinalDe(comissao: number, adiantamentos: { valor: number }[]) {
  return Math.max(0, comissao - adiantamentos.reduce((s, a) => s + a.valor, 0));
}
```

**Resumo anual:** antes de `INICIO_CALCULADO = "2026-10"` vale só o fechamento oficial
digitado (histórico). De outubro/2026 em diante o app calcula, **só com vendas de origem
`webhook` e `manual`** (as importadas da planilha ficam no banco, fora do resumo), e mostra
se o fechamento e o calculado não batem (`difere`).

**Link público** `/r/<código>`: código aleatório de 32 caracteres (`randomBytes(24)`),
desativável (apaga o código → URL dá 404 na hora). Mostra só cliente curto, ticket, data/hora,
plataforma, status, id da fatura e totais.

---

## 5. O que não foi feito, ficou pendente ou já deu problema

### Não feito / pendente

- **Kirvano sem webhook.** Vendas da Kirvano só entram à mão ou pelo CSV do Notion.
  `lib/hubla.ts` é só da Hubla.
- **Chargeback automático:** nenhum evento de chargeback/disputa da Hubla é tratado; só à mão.
- **Exportação:** o painel privado não exporta nada. O único export é o "Baixar CSV" da
  página pública `/r/<código>` (e o texto copiado da mensagem/resumo).
- **Reembolso que chega antes da venda existir** (ex.: venda ainda em "A revisar"): só gera
  log com erro. Se depois o Davi clicar "É minha", a venda nasce como **Pago** mesmo já
  reembolsada — precisa corrigir à mão.
- **Reembolso de mês já fechado:** muda o status da venda, então o calculado daquele mês muda;
  o fechamento gravado não. O resumo anual marca a diferença, mas nada avisa ativamente.
- **Reembolso parcial:** não existe; qualquer reembolso tira a venda inteira.
- **Falha no processamento** (`after()`): a Hubla já recebeu 200, então não reenvia. O evento
  fica com `erro` em `webhook_eventos`, mas não há tela nem rotina de reprocessar.
- **Restos de regras antigas:** tabela `bumps` e `lock_in_config.valor_society` sem uso;
  `principal_produto` só existe em vendas antigas; comentário da 0037 ainda diz "webhook não
  usado ainda".
- **Ticket provisório** (R$ 398,90 na época do commit `1980879`): valores a confirmar.
- **Privacidade do log:** `webhook_eventos.payload` guarda o payload inteiro de **todas** as
  vendas da operação, inclusive de outros atendentes (nome, telefone, e-mail do comprador).
  A tela não mostra, mas está no banco.

### O que já deu problema

- **401 com token certo:** o token colado na Vercel com espaço/Enter no fim não batia. Fix:
  `.trim()` nas duas pontas e motivo do 401 no log (`b77962b`).
- **Regra de order bump mudou 3 vezes:**
  1. pelo `amountCents` da oferta com `isOrderBump: false` (`0dfb566`);
  2. "combo = ticket + Society", ticket = valor − R$ 98,90 (`97f04a2`) — no recálculo,
     66 combos viraram 43 tickets e 23 "a revisar";
  3. atual: pelo **nome** do item, com o preço escrito no nome (`1980879`).
- **Nome da oferta com preço errado:** uma oferta tinha "R$288,90" no nome mas cobrava
  R$ 288,00 → criado `lib/ofertas-apelidos.json`.
- **Importação histórica:** das 852 vendas da planilha, 640 casaram ticket, 147 eram produto
  e 65 não se encaixaram (`cb85312`) — por isso as importadas ficam fora do resumo anual.

---

## 6. Exemplo de payload da Hubla (dados falsos)

Montado a partir dos campos que o código lê (`lib/hubla.ts`), com valores inventados. Não é
uma cópia de entrega real; a Hubla manda mais campos, que o app ignora.

```json
{
  "type": "invoice.payment_succeeded",
  "version": "2.0.0",
  "event": {
    "hasOrderBump": true,
    "products": [
      {
        "name": "Game Changer Society",
        "offers": [
          { "name": "Ticket - R$188", "amountCents": 18800, "isOrderBump": false }
        ]
      },
      {
        "name": "Produto Bônus Exemplo",
        "offers": [
          { "name": "Oferta Bump", "amountCents": 4700, "isOrderBump": true }
        ]
      }
    ],
    "invoice": {
      "id": "inv_00000000-exemplo-0000",
      "createdAt": "2026-10-05T23:58:10.000Z",
      "saleDate": "2026-10-05T23:59:00.000Z",
      "statusAt": [
        { "status": "unpaid", "when": "2026-10-05T23:58:10.000Z" },
        { "status": "paid",   "when": "2026-10-06T00:01:30.000Z" }
      ],
      "amount": {
        "subtotalCents": 23500,
        "discountCents": 0,
        "totalCents": 23500
      },
      "payer": {
        "firstName": "Fulano de Tal",
        "phone": "+5500900000000"
      },
      "paymentSession": {
        "utm": { "term": "davi", "content": "lead_5500900001234" }
      },
      "firstPaymentSession": {
        "utm": { "term": "davi", "content": "lead_5500900001234" }
      }
    }
  }
}
```

O que o app tira disso:

| Campo | Vira |
|---|---|
| `type` | `invoice.payment_succeeded` → pagamento |
| `event.invoice.id` | `vendas.id_externo` |
| `paymentSession.utm.term` | "davi" → venda minha |
| `paymentSession.utm.content` | `lead_…` → 4 últimos dígitos "1234" |
| `payer.firstName` | "Fulano" → cliente `Fulano -1234` |
| `products[].name` + `offers[].name` | itens: `Game Changer Society - Ticket - R$188` (ticket) e `Produto Bônus Exemplo - Oferta Bump` (bump) |
| `statusAt` `paid` | `pago_em` = 06/10 00:01 UTC → `data` = **2026-10-05** (São Paulo) |
| `amount.subtotalCents` | só referência na caixa "A revisar" |

Reembolso usa o mesmo formato com `"type": "invoice.refunded"` ou
`"refund_request.accepted"` e o mesmo `event.invoice.id`.

---

## 7. Variáveis de ambiente

Só os nomes. Valores no `.env.local` (fora do git) e na Vercel.

| Variável | Usada em | Para quê |
|---|---|---|
| `HUBLA_WEBHOOK_TOKEN` | rota do webhook | senha do header `x-hubla-token` |
| `OWNER_EMAIL` | webhook, login, scripts | quem é o dono das vendas |
| `SUPABASE_URL` | `lib/supabase/server.ts` | cliente com service_role (webhook, página pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/server.ts` | idem (só servidor) |
| `NEXT_PUBLIC_SUPABASE_URL` | app | cliente com login |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | cliente com login |
| `HUBLA_API_TOKEN` | `scripts/hubla-api-itens.mjs` | API pública da Hubla (só script local) |
| `POSTGRES_URL_NON_POOLING` | scripts de importação/seed/migration | conexão direta no Postgres |

Observação: o `.env.example` do projeto só lista `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `OWNER_EMAIL`; as outras não estão lá.
