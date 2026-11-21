# Central de gestão (fase 2, 21/11/2026): Hoje, Projetos e Decisões

Só a gestão (`app_metadata.gestao`: Davi e Rodrigo). O bloqueio é em três lugares: menu
(`components/painel-nav.tsx`), endereço (`lib/supabase/proxy.ts`, `GESTAO_PATHS`) e banco (RLS com
`privado.eh_gestao()`). Migration `20261121150000_gestao_hoje_projetos_decisoes`.

Código: regras em `modulos/gestao/regras.ts`, leitura em `modulos/gestao/dados.ts`, ações em
`app/(painel)/acoes-hoje.ts`, `app/(painel)/projetos/acoes.ts` e `app/(painel)/decisoes/acoes.ts`
(todas passam por `lib/gestao-acao.ts`).

## Hoje (`/`)
- **Prioridades da semana:** até 3 por semana (segunda a domingo), com dono e prazo; concluir, editar e
  apagar no próprio cartão. Tabela `prioridades` (`semana` = a segunda-feira).
- **Números:** vendas e faturamento líquido de hoje e da semana, da tabela `vendas`: só `status = pago`,
  sem `teste` e sem `aguardando_confirmacao`. Líquido = `receita_liquida` (o que a Hubla repassa da
  fatura); sem ela (venda manual), `viral_liquido` ou `snap_liquido`.
- **Líquido por lead x CPL:** investimento, CPL e leads da semana em `numeros_semana` (digitados;
  `origem = 'manual'`, vira `'prime'` quando a API do Prime entrar). Leads vazio = investimento ÷ CPL.
  Vermelho quando o líquido por lead é menor que o CPL.
- **Esperando decisão:** decisões com status pendente (mostra quem decide).
- **Prazos da semana:** iniciativas (fora de No ar/Pausado) e itens de checklist não feitos com prazo
  até daqui a 7 dias, incluindo os atrasados.

## Projetos (`/projetos`)
Substitui Tarefas e Melhorias (arquivadas). Kanban por iniciativa: Ideia · Planejando · Em andamento ·
No ar · Pausado (`@dnd-kit`, mesmo jeito do quadro de Tarefas). Iniciativa: título, frente, objetivo,
dono, prazo, checklist com responsável e prazo por item, links e comentários (só o autor apaga).
Tabelas `iniciativas`, `iniciativa_itens`, `iniciativa_links`, `iniciativa_comentarios`; frentes em
`frentes` (a fase 3 completa). Iniciativas iniciais: Funil em blocos com ganchos, Webinário com o Julio,
Reels dos módulos, Pesquisa GCS, Viral via influencers e Lançamento (colunas iniciais a ajustar).

## Decisões (`/decisoes`)
- **Registro** (`decisoes`): data, decisão, por quê, quem (decidiu ou decide), frente, iniciativa e
  status (Pendente / Decidido / Revisar).
- **Pauta da reunião** (`pauta_itens`): qualquer um da gestão põe assunto durante a semana; na reunião
  cada item vira decisão (`decisao_id`), tarefa num projeto (`iniciativa_item_id`) ou é descartado.
  Os resolvidos dos últimos 14 dias ficam visíveis e podem voltar para a pauta.
