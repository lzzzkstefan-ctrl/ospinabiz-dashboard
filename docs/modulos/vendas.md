# Módulo Vendas

Vendas da Hubla (webhook), atribuição aos vendedores, comissão e margem do mês.
Base das regras: `docs/modulos/vendas-referencia.md` (cópia do Lock in do masterview).

## Fluxo

```
Venda aprovada na Hubla
  → POST /api/vendas/hubla           confere x-hubla-token (HUBLA_WEBHOOK_TOKEN), senão 401
  → grava o evento em hubla_eventos  (falhou → 500, a Hubla tenta de novo)
  → responde 200 e processa depois   modulos/vendas/processar.ts (after())
```

- **Pagamento** (`invoice.payment_succeeded`): cria UMA venda por fatura (`id_fatura` único).
  - `utm_term` = código de um vendedor ativo (`davi`, `vyenna`) → atribuída na hora.
  - Sem código ou código desconhecido → **A atribuir** (o vendedor clica "É minha"; o admin corrige).
  - Se já chegou reembolso dessa fatura antes, a venda já nasce **reembolso**.
- **Reembolso** (`invoice.refunded`, `refund_request.accepted`): marca a venda. Se ela ainda não
  existe, o evento fica como `reembolso_antes_da_venda` e vale quando o pagamento chegar.
- **Chargeback:** a Hubla não tem tratamento automático aqui; o admin marca na venda.
- **Falhou?** O evento fica com `erro`; o admin reprocessa em `/vendas/config`. Reprocessar não duplica.

## Ticket, bump e valores

- Ticket = item com "Game Changer Society" ou "Ticket - R$…" no nome; o preço vem do nome e
  casa com um ticket **ativo** da tabela. O resto é order bump e nunca conta.
- Bruto, líquido e comissão vêm da tabela `tickets` (não do valor pago). Venda sem ticket
  reconhecido conta só na quantidade ("sem ticket") até o admin escolher o ticket.
- Comissão = soma das comissões unitárias da faixa (`comissao_6` … `comissao_10`).
  Comissão unitária = líquido × %, arredondada por venda (meio centavo para cima).

## Margem do mês e faixa (só admin vê)

```
Lucro  = líquido da operação − anúncios − imposto Meta − custos fixos − mensagens
Margem = Lucro ÷ líquido          (a comissão não entra)
```

Faixas (o limite de baixo entra na faixa de cima): <10% → 6% · 10–<20% → 7% · 20–<35% → 8% ·
35–50% → 9% · >50% → 10%. Anúncios, imposto Meta e mensagens são digitados pelo admin por mês;
sem os três, a comissão aparece como **prévia** (comparativo 6%–10%).

Custos fixos têm histórico: o valor vale a partir de um mês (`custos_fixos_valores.vigente_desde`).

## Quem vê o quê

| | Admin | Vendedor |
|---|---|---|
| Vendas | todas | só as dele + "A atribuir" (RLS) |
| Nome, telefone, e-mail do cliente (`vendas_clientes`) | sim | não |
| Payload bruto da Hubla (`hubla_eventos`) | sim | não |
| Faturamento geral da operação | sim | não |
| Margem, custos, valores do mês | sim | não (vê só a faixa) |

## "Copiar resumo"

```
PRESTAÇÃO COMERCIAL GCS

Total de vendas: XX
Faturamento bruto: R$ XX
Líquido: R$ XX

Margem: X%          ← faixa da comissão (6% a 10%), não a margem da operação
Comissão: R$ XX

Vendas:
27x R$288           ← só tickets com venda, do maior número para o menor
```

## Na Hubla

- URL: `https://ospinabiz-dashboard.vercel.app/api/vendas/hubla`
- Token: o mesmo valor em `HUBLA_WEBHOOK_TOKEN` (`.env.local` e Vercel). Nunca no código.
