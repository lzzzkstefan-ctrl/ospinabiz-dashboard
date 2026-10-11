# Contexto: Melhorias (backlog e novidades)

Pedido do Davi em 11/10/2026. Migration `melhorias`.

## O que é
- **Backlog** em 4 colunas por status: Ideia, Para fazer, Em andamento, Feito. Cada item tem título,
  descrição, prioridade (alta, média, baixa), aba relacionada e quem sugeriu.
- Arrasta pela alça ⋮⋮ do cartão (coluna embaixo do ponteiro/dedo) ou troca no seletor de status do
  cartão (mais fácil no celular). Biblioteca `@dnd-kit/core` (versão fixa), porque o arrastar nativo do
  navegador não funciona no toque do iPhone.
- Indo para **Feito**, pede a linha que aparece em **Novidades** (já vem com o título). A data entra
  sozinha (gatilho). Saindo de Feito, a data é apagada.
- **Sugerir melhoria** (Início): qualquer pessoa logada, inclusive vendedor e plantonista. Cai em Ideia,
  em nome de quem sugeriu.

## Quem pode o quê
- Chefe e gerente em Vendas (`privado.usuarios_gestor`): veem a aba (menu "Melhorias"), criam, editam,
  movem e apagam.
- Os outros: só sugerem. Não leem o quadro (por isso a sugestão grava sem pedir a linha de volta).
- O nome de quem sugeriu vem da equipe (gatilho `privado.melhorias_ajusta`) e não muda depois.

## Arquivos no git
- `docs/backlog.md` e `docs/changelog.md` são GERADOS do banco por `npm run melhorias:docs`
  (`scripts/melhorias-docs.mjs`, chave secreta, só local). A Vercel não grava no git, então o que muda
  pela tela entra nos arquivos na próxima vez que o script rodar (antes de cada push; regra no CLAUDE.md).
- O mesmo script marca feito (`--feito=<id> --linha="..."`) e cria item (`--novo="Título" --aba=Funil`).

## Itens iniciais
As 11 pendências combinadas até 11/10 entraram em "Para fazer" (prioridades propostas pelo Davi aceitas)
e as 3 entregas de 11/10 em "Feito".
