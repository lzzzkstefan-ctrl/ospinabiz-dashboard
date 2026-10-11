# Contexto: Tarefas (kanban)

Kanban desde 11/10/2026 (migration `tarefas_kanban`; antes era lista pendente/concluída).

## O que é
- 4 colunas: **A fazer**, **Fazendo**, **Travado**, **Feito** (`tarefas.status` = `a_fazer`, `fazendo`,
  `travado`, `feito`). Resumo no topo: "X/Y feitas", barra de progresso, fazendo, travadas e atrasadas.
- Arrasta o cartão entre colunas e dentro da mesma coluna (`@dnd-kit/core` + `sortable`, versões fixas).
  Mouse, toque (segurar ~0,2 s, para não confundir com rolar) e teclado. Celular: colunas rolam na
  horizontal; desktop: as 4 lado a lado. Vale o que está embaixo do ponteiro (coluna vazia e alta
  perdia para os cartões da vizinha pela regra dos cantos).
- **Posição** (`ordem`, número com casas decimais): ao soltar entre dois cartões, vale o meio dos dois.
  Só o cartão movido é gravado, numa atualização (status + ordem). Erro: a tela volta ao banco.
- Bolinha de concluir no cartão: manda para o topo de Feito (ou de volta ao topo de A fazer).
- Clicar no cartão abre o modal (título, detalhes, coluna, prioridade, responsável, área, prazo + horário,
  vínculo com BM/número). Tarefa de webinário não troca o vínculo.
- **Responsável:** filtro Todos + equipe ativa (sem a conta de teste). Nome = `equipe.apelido` ou o nome
  (Vyenna aparece como "Vy"). Cores fixas da bolinha em `modulos/tarefas/regras.ts` (Davi azul, Rodrigo
  roxo, Vy rosa; outros cinza). Clique na bolinha = mini menu para trocar. "+ Nova tarefa" tem seletor de
  responsável (padrão: a pessoa do filtro) e entra no topo de A fazer.
- **Atrasada:** fora de Feito e já passou de `prazo` + `prazo_hora` (Brasília). Sem horário, o prazo vale
  até o fim do dia.

## Quem pode o quê
- Qualquer logado vê, cria, edita e move; plantonista só as dele (RLS da escala). Ninguém apaga.
- `concluida_em` é preenchida pelo gatilho ao entrar em Feito e limpa ao sair.

## Quem mais usa a tabela
- Início ("Tarefas pendentes" = fora de Feito; atrasadas) e o checklist dos Webinários (feito = ✓).
