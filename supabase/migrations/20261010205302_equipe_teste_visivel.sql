-- Pessoa de teste VISÍVEL (pedido do Davi, 10/10/2026): para testar as notificações.
-- equipe.teste_visivel = true (só vale para quem tem equipe.teste = true):
--   - aparece no "Online agora" para o admin;
--   - a pausa e a volta da pausa dela geram aviso (pausa_inicio / pausa_fim);
--   - continua FORA de "operação descoberta/coberta", pausa longa, sem check-in, horários fixos e
--     dos cards da semana.
-- Liga/desliga na aba Usuários (registrado em usuarios_registro, ação "teste").

alter table public.equipe add column teste_visivel boolean not null default false;
comment on column public.equipe.teste_visivel is
  'Só para pessoa de teste: aparece no Online agora do admin e gera aviso de pausa/volta (nada mais).';

alter table public.usuarios_registro drop constraint usuarios_registro_acao_check;
alter table public.usuarios_registro add constraint usuarios_registro_acao_check
  check (acao in ('convite', 'novo_link', 'papel', 'atendente', 'utm', 'desativar', 'reativar', 'teste'));
