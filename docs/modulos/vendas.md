# Módulo Vendas

Vendas da Hubla (webhook), atribuição aos vendedores (Davi e Vyenna), comissão por venda e
fechamento do mês por vendedor. Base das regras: `docs/modulos/vendas-referencia.md` (cópia do
Lock in do masterview). Decisões em `docs/decisoes.md` (08/10/2026).

## Fluxo

```
Venda aprovada na Hubla
  → Edge Function hubla-webhook      confere x-hubla-token (secret HUBLA_WEBHOOK_TOKEN), senão 401
  → grava o evento em hubla_eventos  (falhou → 500, a Hubla tenta de novo; repetido → 200)
  → gatilho do banco chama           /api/vendas/processar → modulos/vendas/processar.ts
                                     (pg_cron repete a cada 10 min os pendentes)
```

- **Pagamento** (`invoice.payment_succeeded`): cria UMA venda por fatura (`id_fatura` único).
  - `utm_term` = código de um vendedor ativo (`davi`, `vyenna`) → atribuída na hora.
  - Sem código ou código desconhecido → **A revisar** (só o admin vê e atribui).
  - Se já chegou reembolso dessa fatura antes, a venda já nasce **reembolso**.
- **Pedido de reembolso** (`refund_request.created` / `.canceled` / `.rejected`): vai para
  `vendas_reembolsos` (ver "Reembolsos" no fim). Não muda a venda.
- **Reembolso** (`invoice.refunded`, `refund_request.accepted`): marca a venda. Se ela ainda não
  existe, o evento fica como `reembolso_antes_da_venda` e vale quando o pagamento chegar.
- **Chargeback:** a Hubla não tem tratamento automático aqui; o admin marca na venda.
- **Falhou?** O evento fica com `erro`; o admin reprocessa em `/vendas/config`. Reprocessar não duplica.

## Ticket, bump e valores

> **Duas medidas (decisão do Davi, 09/10/2026):**
> - **Fechamento, pagamento e comissão** (e a margem que sugere a faixa): só o produto principal,
>   pelo **bruto/líquido de ticket** da tabela (`snap_*`). Order bump não entra. Na tela:
>   "Bruto de ticket (base da comissão)" e "Líquido de ticket (base da comissão)".
> - **Visão geral / receita da operação:** **"Receita na Hubla (com bumps)"** = `vendas.receita_liquida`,
>   o valor real da fatura (principal + bumps) depois da taxa da Hubla. Webhook: recebedor da fatura com
>   o mesmo id do vendedor (`event.invoice.receivers`). Histórico: `scripts/vendas-receita-hubla.mjs`
>   com o export de faturas da Hubla (prévia antes de gravar; mês fechado com `--admin`).
> - **Comissão SEMPRE pela tabela de tickets** (decisão do Davi, 10/10/2026; migration
>   `vendas_comissao_pela_tabela`). A regra de 09/10 ("líquido de ticket pela fatura real a partir de
>   outubro") foi revogada: outubro do Davi a 10% = R$ 54,66 (tabela), não R$ 55,58.
>   O valor com juros virou só informação: **"Recebido real"** = `vendas.liquido_real` (parte do ticket
>   no que entrou de verdade da fatura: `receita_liquida` × preço do ticket ÷ subtotal), guardado a
>   partir de `vendas_config.liquido_real_desde` (2026-10-01) e mostrado só na Geral (chefe/gerente),
>   nunca na comissão nem no fechamento. `scripts/vendas-liquido-real.mjs` foi desligado.

- **Regra A:** "Protocolo Game Changer" (ou "Game Changer Society") na venda, como principal
  OU como order bump → venda de **ticket**. Nexus PGC, Combo, Acesso Vitalício e templates
  nunca entram (nem venda com ticket, nem bruto, nem comissão); o nome deles fica em
  `vendas.bumps` só para o card. Sem Protocolo na venda → **sem comissão (produto)**.
- **Ticket pelo valor cobrado do Protocolo**, nunca pelo nome da oferta ("Ticket - R$208"
  cobra R$ 288): ticket ativo com esse valor; senão, inativo (preço da época). Não bate com
  nenhum → **A revisar** com o motivo.
- Webhook: valor = `amountCents` da oferta do Protocolo (`ticketDoPrincipal`, `regras.ts`).
- **Planilha da Hubla:** não traz valor por item, então valor do Protocolo = valor do
  produto − preços dos outros itens (`BUMPS` em `scripts/vendas-planilha-hubla.mjs`).
- Venda nunca é descartada: sem ticket, conta só na quantidade até o admin escolher o ticket.
- **Vendas antigas:** `scripts/vendas-corrigir-produto.mjs` (prévia por vendedor e mês; grava
  um mês de um vendedor por vez, mês fechado só com `--fechado-ok`).
- **Snapshot:** ao criar a venda (ou trocar o ticket dela), o banco copia para a venda o bruto, o
  líquido e as 5 comissões do ticket (`vendas.snap_*`, trigger `vendas_snapshot_ticket`).
  Os totais somam essa cópia. Mudar ou desativar ticket não muda venda antiga.
- Comissão unitária de cada ticket = líquido × %, meio centavo para cima, em centavos inteiros
  (`comissaoDe` em `regras.ts`; ex.: 14905 × 10% = 1490,5 → 1491). Os valores ficam prontos na
  tabela `tickets` (`comissao_6` … `comissao_10`).
- Tickets ativos (out/2026): R$ 338, 278, 238 e 158. Os antigos ficam inativos para o histórico.

## Fechamento do mês (por vendedor)

```
Lucro  = líquido da operação − anúncios − imposto Meta − custos fixos − mensagens
Margem = Lucro ÷ líquido          (a comissão não entra)  → faixa SUGERIDA
```

Faixas (o limite de baixo entra na faixa de cima): <10% → 6% · 10–<20% → 7% · 20–<35% → 8% ·
35–50% → 9% · >50% → 10%. Anúncios, imposto Meta e mensagens são digitados pelo admin por mês.

- Na aba de cada vendedor, o admin escolhe o **%** (6 a 10; a faixa sugerida vem marcada) e
  clica **Fechar mês**. Grava em `vendas_fechamentos`: %, faixa sugerida, totais congelados,
  quem fechou e quando. Mês fechado não se fecha de novo: reabra ou use ajuste (abaixo).
- Venda mudou depois do fechamento (reembolso, correção): a tela avisa; o valor do mês continua
  o congelado no fechamento.

### Mês fechado (travado) — migration `vendas_mes_fechado`, 09/10/2026

- **Trava no banco:** venda de mês fechado daquele vendedor só muda se a gravação disser quem
  está mudando (`alterado_via` = `admin` + `alterado_por`, ou `hubla`). Sem isso, o banco recusa.
  Vale também para mover venda para dentro de mês fechado. Apagar venda de mês fechado: nunca.
  A Hubla, em mês fechado, só muda status (reembolso/chargeback) e cria venda nova.
- **Registro** em `vendas_alteracoes`: quem, quando, antes/depois. Só admin lê; ninguém edita
  nem apaga (nem a chave secreta). Na tela: "Registro de alterações" no fechamento do mês.
- **Estorno:** venda paga de mês fechado que vira reembolso/chargeback gera um estorno com a
  comissão dela (na faixa do fechamento), descontado sozinho no **próximo** fechamento do
  vendedor, com a venda e o mês de origem. Voltou para pago antes do desconto: estorno cancelado.
- **Mês fechado mostra a comissão congelada** (a que foi paga). O reembolso aparece só como
  estorno no mês seguinte, nunca reduzindo o mês antigo (senão descontaria duas vezes).
- **Reabrir:** só admin, motivo obrigatório, registrado. Cancela os estornos nascidos no mês e
  ainda não descontados; os descontados naquele fechamento voltam a pendentes.
- **Ajuste manual:** valor (+/−) e motivo, só admin, só em mês fechado, sem reabrir. Não se
  edita nem apaga: corrige-se com outro ajuste.
- **A receber** = comissão − estornos + ajustes − adiantamentos. Negativo aparece como "saldo
  negativo de R$ X, descontado no próximo fechamento".
- **Saldo negativo** (migration `vendas_saldo_negativo`): mês fechado com a receber abaixo de
  zero ganha um estorno "saldo negativo" (sem venda), descontado sozinho no próximo fechamento.
  Recalculado ao fechar, ao lançar ajuste e ao mudar adiantamento; voltou a ≥ 0 → cancelado.
  Depois que esse saldo foi descontado, o mês não aceita mais ajuste: lance no mês seguinte.
- **Exportar** (só mês fechado): CSV em `/api/vendas/fechamento?mes=AAAA-MM&vendedor=<id>` e
  PDF pela impressão do navegador em `/vendas/fechamento?mes=AAAA-MM&vendedor=<id>`.
  Cliente aparece só com o primeiro nome e os 4 últimos dígitos.

## Quem vê o quê

> **Papel em Vendas** (`app_metadata.vendas`, migration `vendas_papeis`, 09/10/2026), separado do
> admin do sistema (Monitor, BMs, Usuários, Funil). Sem o campo: admin = chefe, os outros = vendedor.
> | | chefe | gerente | vendedor |
> |---|---|---|---|
> | Abas | todos os vendedores + Geral | a própria + Geral | a própria + Geral |
> | Geral | completa (por vendedor) | completa (só números agregados) | equipe: quantidade, % da meta e o ticket médio dele (sem R$ da equipe) |
> | Vendas que lê (RLS) | todas | só as próprias | só as próprias |
> | Configuração, fechar/reabrir mês, ajustes, adiantamentos, meta, PDF/CSV | sim | não | não |
> | Nova venda | qualquer vendedor | só no próprio nome, pendente | só no próprio nome, pendente |
> | Confirmar venda pendente | todas | só as próprias | não |
>
> Geral sai de duas funções do banco que devolvem só números (`vendas_geral_completa`,
> `vendas_geral_equipe`). Venda pendente (`aguardando_confirmacao`) e de teste não contam em nada.
> Hoje: Rodrigo = chefe (admin); Davi = chefe até o Rodrigo ativar a conta, depois gerente
> (continua admin do sistema); Vyenna = vendedora.


| | Admin | Vendedor |
|---|---|---|
| Vendas | todas | **só as dele** (RLS) |
| "A revisar" (sem dono / sem ticket) | sim | não |
| Fechamentos | todos | só os dele (RLS) |
| Nome, telefone, e-mail do cliente (`vendas_clientes`) | sim | não |
| E-mail de acesso dos vendedores (`vendedores.email`) | sim | não (coluna sem permissão) |
| Payload bruto da Hubla (`hubla_eventos`) | sim | não |
| Faturamento geral, margem, custos | sim | não |

O papel vem de `app_metadata.papel` (`admin` / `atendente`) e o vendedor é ligado ao login por
`equipe.usuario_id`.

## Histórico (`origem = 'importacao'`)

- **Davi:** `scripts/vendas-importar-masterview.mjs --backup=C:\dev\backups\masterview\<pasta>`.
  Lê o backup CSV do Lock in, acha o ticket pelo bruto (ativo ou inativo) e, depois de gravar,
  compara os totais por mês com o backup.
- **Vyenna:** exportar a planilha da Hubla (XLSX, com a coluna "UTM Termo") e rodar
  `scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<xlsx> --utm=vyenna`. A prévia mostra os
  totais por mês nas 5 faixas para ela conferir; só depois `--aplicar`. Os meses ficam abertos
  até o admin fechar.
- Não há venda paga depois de 04/09/2026: a operação parou em setembro de 2026 (não é falha
  de importação nem do webhook).
- Venda importada sem ticket (produto, combo antigo) não entra em "A revisar": fica na lista do
  mês com o motivo.

## Scripts (rodam na máquina do admin, com a chave secreta; sem `--aplicar` só mostram)

| Script | O que faz |
|---|---|
| `scripts/vendas-base.mjs` | papel admin do Davi, tickets inativos que faltam, e-mail de acesso do vendedor |
| `scripts/vendas-importar-masterview.mjs` | histórico do Davi a partir do backup do Lock in |
| `scripts/vendas-importar-hubla-xlsx.mjs` | histórico de um vendedor a partir da planilha da Hubla |
| `scripts/vendas-convidar.mjs` | convite (link para WhatsApp ou e-mail), papel atendente e ligação com a equipe |

## "Copiar resumo"

```
PRESTAÇÃO COMERCIAL GCS

Total de vendas: XX
Faturamento bruto: R$ XX
Líquido: R$ XX

Margem: X%          ← % do fechamento do vendedor (6% a 10%), não a margem da operação
Comissão: R$ XX

Vendas:
27x R$288           ← só tickets com venda, do maior número para o menor
```

## Na Hubla

- URL: a Edge Function `hubla-webhook` do Supabase (endereço em `docs/contas.md`). É o único
  receptor: a rota `/api/vendas/hubla` da Vercel foi apagada em 09/10/2026.
- Token: secret `HUBLA_WEBHOOK_TOKEN` da Edge Function (Supabase). Nunca no código.
- Até a versão da empresa ser validada, o masterview continua recebendo as vendas do Davi.
  Ainda não está confirmado se a Hubla aceita duas regras de webhook para o mesmo evento:
  testar criando a segunda regra e conferindo que as duas recebem a próxima venda.

## Registro de alterações completo (10/10/2026, migration `vendas_registro_completo`)

Davi e Rodrigo são os dois **chefes** em Vendas (pedido do Davi, 10/10). Para que tudo o que um chefe
faz fique rastreável, `vendas_alteracoes` passou a registrar também o **mês aberto**:
- venda criada, alterada (só os campos que mudaram, antes e depois) ou **apagada** (a venda inteira
  em "antes") por uma pessoa: `por` = quem a tela informou (`alterado_por`) ou o login;
- **mês fechado** (quem fechou, faixa, quantidade, bruto, líquido, comissão), além de mês reaberto
  (com motivo), ajuste e estorno, como já era;
- o webhook da Hubla em mês aberto não entra (não é pessoa); em mês fechado continua entrando.
Só o chefe lê (RLS `vendas_chefe()`); ninguém escreve nem apaga direto (testado em 10/10 com
chefe, gerente e vendedor temporários). Na tela: "Registro de alterações" no painel do mês, para o
chefe, em qualquer mês (antes só em mês fechado).

## Protocolo Viral (16/10/2026, migration `vendas_viral`)

O Viral é o downsell para o lead "Sem dinheiro": 15 ofertas na Hubla, de R$ 48,90 a R$ 118,90. Ele
chega pelo mesmo webhook do GCS, com `utm_term` = vendedor e `utm_content` = `lead_{telefone}`.
Decisão e porquês em `docs/decisoes.md`.

- **Como é reconhecido:** pelo ID do produto ou da oferta em `vendas_produtos_hubla` (Configuração de
  vendas, seção Protocolo Viral). O cadastro começa com o produto `ptOj9sEG0z4hnImIeHvC`, que vale
  para todas as ofertas dele. Nome e valor não contam (`ofertaViral` e `montarVendaNova` em `regras.ts`).
- **A venda:** `linha = 'viral'`, sem ticket.
  - `valor_pago` = total que o cliente pagou (faturamento).
  - `viral_preco` = preço da oferta.
  - `viral_liquido` = o que a Hubla repassa sem os juros do parcelamento (gatilho `vendas_comissao_viral`).
- **Comissão = regra do GCS:** líquido × % da faixa do fechamento (6 a 10%), calculada venda a venda
  com meio centavo para cima (`comissaoDe` e `privado.vendas_viral_comissao`).
  - Uma venda ainda sem o valor da Hubla fica sem comissão até ele chegar.
  - Enquanto houver venda assim, o mês não fecha.
- **Fechamento:** `comissao` = GCS + Viral na faixa. A parte do Viral também fica em `viral_qtd`,
  `viral_bruto`, `viral_liquido` e `viral_comissao`. O estorno de uma venda do Viral reembolsada em mês
  fechado = líquido dela × faixa do fechamento.
- **Tela do vendedor:**
  - bloco "Protocolo Viral" com vendas, faturamento, ticket médio, comissão na faixa e vendas por oferta;
  - filtro "Protocolo Viral" e etiqueta "Viral R$ X" na lista;
  - o Viral não entra no total de vendas nem no bruto/líquido de ticket do GCS;
  - a comissão total (GCS + Viral) aparece no fechamento, no "Copiar resumo" e na mensagem.
- **Geral (chefe e gerente):**
  - tabela GCS x Viral por vendedor (quantidade, faturamento, ticket médio e comissão na faixa sugerida);
  - conversão do downsell: leads que receberam a etiqueta 🪞DOWNSELL VIRAL no mês x quantos deles
    compraram o Viral, ligando a venda ao lead pelo telefone, como na sincronização do Funil;
  - vendas por oferta (48,90 a 118,90).
  - Tudo sai de funções do banco que devolvem só números (`vendas_viral_resumo`, `vendas_viral_conversao`).
- **Meta da equipe e tabela "Por vendedor":** só GCS.
- **Funil:** venda do Viral ligada ao lead marca `funil_leads.downsell = 'viral'`.

## Reembolsos (16/10/2026, migration `vendas_reembolsos`)

Alerta de pedido de reembolso da Hubla. Decisão e porquês em `docs/decisoes.md`.

- **Eventos a marcar no webhook da Hubla** (mesma regra/URL das vendas): *Solicitação de Reembolso
  criada*, *aceita*, *cancelada* e *rejeitada*, além de *Pagamento da fatura realizado* e *Fatura
  reembolsada*, que já estavam marcados.
- **Tabela `vendas_reembolsos`:** um pedido por `refund.id`, ligado à venda pela fatura.
  - Guarda cliente (nome e telefone), produto (GCS ou Protocolo Viral), valor (total da fatura),
    vendedor (o da venda; sem venda, o do `utm_term`), pago em, pedido em, prazo e status.
  - Status: `pendente`, `revertido` ou `reembolsado`. `revertido` vem da tela (quem e quando) ou da
    Hubla (cliente cancelou ou o pedido foi rejeitado).
  - Quem lê: admin, chefe e o vendedor dono. Só o servidor grava, além da função
    `vendas_reembolso_reverter`.
- **Prazo:** pago em + `vendas_config.reembolso_prazo_dias` (padrão 7, Configuração de vendas →
  Reembolsos). A Hubla não manda o prazo no evento. Pedido feito depois da garantia fica sem prazo.
- **Comissão:** não muda nada no pedido. Quando a Hubla aceita ou reembolsa, a venda vira `reembolso`
  como antes: sai do mês aberto, e em mês fechado a trava gera o estorno.
- **Push** (`modulos/vendas/reembolsos.ts`, envio em `lib/notificacoes.ts`):
  - vai para os admins do sistema, os chefes de Vendas e o vendedor dono;
  - texto: "Reembolso solicitado: Nome, R$ valor, produto. Prazo: X"; ao tocar, abre
    `/vendas/reembolsos?id=<pedido>`;
  - lembretes (pg_cron a cada 15 min → `/api/vendas/reembolsos`): pendente há 24h, e falta menos de
    24h para o prazo (só se o pedido chegou com mais de 24h de folga);
  - chave única em `notificacoes_enviadas`: o mesmo aviso nunca sai duas vezes.
- **Tela `/vendas/reembolsos`** (link "Reembolsos" no topo de Vendas, com o número de pendentes):
  - pendentes do mais urgente para o menos urgente, com contagem regressiva;
  - botões de WhatsApp, "Copiar ID do pedido" (ID da fatura na Hubla) e "Marcar como revertido";
  - histórico do mês com a taxa de reversão por vendedor e por produto (revertidos ÷ revertidos +
    reembolsados).
  - O telefone aparece mascarado; o número inteiro vai só no link do WhatsApp.
- **Selo** "reembolso solicitado" na venda paga com pedido pendente (lista, tabela e detalhe).
