-- Vendas: receita real da fatura na Hubla, com os order bumps (decisão do Davi, 09/10/2026).
--
-- Duas medidas diferentes, de propósito:
--   - BASE DA COMISSÃO (fechamento, pagamento do vendedor): bruto/líquido de TICKET, da tabela
--     de tickets (vendas.snap_*). O order bump NÃO entra. Nada aqui muda isso.
--   - RECEITA DA OPERAÇÃO (dash geral): o valor real da fatura na Hubla, COM os bumps.
--
-- receita_liquida = o que fica para a operação na fatura inteira (produto principal + bumps),
-- já descontada a taxa da Hubla: no webhook, o recebedor que não é a plataforma
-- (event.invoice.receivers, "paysForFees" = true). Vazio = ainda não sabemos (histórico
-- importado sem esse valor; preenchido pelo export da Hubla).
-- valor_pago (já existia) continua sendo o subtotal da fatura (produtos, sem juros do parcelamento).
--
-- Em mês fechado, preencher receita_liquida segue a trava: só com o admin identificado, e fica
-- em vendas_alteracoes. Não mexe em snap_*, então a comissão não muda.

alter table public.vendas
  add column receita_liquida numeric(10, 2) check (receita_liquida is null or receita_liquida >= 0);

comment on column public.vendas.receita_liquida is
  'Receita líquida da fatura na Hubla (produto principal + order bumps, menos a taxa da Hubla). Não entra na comissão.';
comment on column public.vendas.valor_pago is
  'Subtotal da fatura na Hubla (produtos, sem juros do parcelamento). Só referência; não entra na comissão.';
