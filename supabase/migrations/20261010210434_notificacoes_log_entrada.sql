-- Notificações: registro de envio e avisos de entrada/saída (pedido do Davi, 10/10/2026).
--
-- Problema: em produção só chegou a primeira notificação; os avisos de pausa ficaram gravados com
-- enviados = 0 e não havia como saber por quê. Agora cada aviso guarda:
--   resultado: por aparelho, o que o serviço de push respondeu (aceito / código do erro);
--   erro:      a mensagem, se o envio quebrou antes de terminar.
-- E entrar/sair da operação passam a gerar aviso próprio (uma chave por entrada: "entrada:<id>",
-- "saida:<id>"), com liga/desliga nas preferências (vazio = padrão: admin recebe).

alter table public.notificacoes_enviadas add column resultado jsonb;
alter table public.notificacoes_enviadas add column erro text;

alter table public.notificacoes_enviadas drop constraint notificacoes_enviadas_tipo_check;
alter table public.notificacoes_enviadas add constraint notificacoes_enviadas_tipo_check
  check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'entrada', 'saida', 'teste'));

-- vazio (null) = padrão (admin recebe, os outros não)
alter table public.notificacoes_preferencias add column entrada boolean;
alter table public.notificacoes_preferencias add column saida boolean;
grant insert (entrada, saida), update (entrada, saida) on public.notificacoes_preferencias to authenticated;
