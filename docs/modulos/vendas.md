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
- **Reembolso** (`invoice.refunded`, `refund_request.accepted`): marca a venda. Se ela ainda não
  existe, o evento fica como `reembolso_antes_da_venda` e vale quando o pagamento chegar.
- **Chargeback:** a Hubla não tem tratamento automático aqui; o admin marca na venda.
- **Falhou?** O evento fica com `erro`; o admin reprocessa em `/vendas/config`. Reprocessar não duplica.

## Ticket, bump e valores

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
  negativo de R$ X, descontado no próximo fechamento" (o desconto automático do saldo ainda
  está para ser feito — ver decisões).
- **Exportar** (só mês fechado): CSV em `/api/vendas/fechamento?mes=AAAA-MM&vendedor=<id>` e
  PDF pela impressão do navegador em `/vendas/fechamento?mes=AAAA-MM&vendedor=<id>`.
  Cliente aparece só com o primeiro nome e os 4 últimos dígitos.

## Quem vê o quê

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
