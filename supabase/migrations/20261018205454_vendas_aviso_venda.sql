-- Push de venda paga (18/10/2026): "💰 Venda R$ … · produto · vendedor · comissão R$ …"
-- (modulos/vendas/aviso-venda.ts). Só libera o tipo 'venda' no registro de avisos; a chave
-- única (tipo, chave = 'venda:<id>') garante um aviso por venda. Nenhum dado é alterado.
alter table public.notificacoes_enviadas drop constraint if exists notificacoes_enviadas_tipo_check;
alter table public.notificacoes_enviadas add constraint notificacoes_enviadas_tipo_check
  check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'entrada', 'saida', 'teste', 'feriado', 'reembolso', 'venda'));
