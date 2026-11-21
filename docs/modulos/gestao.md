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

# Fase 3 (21/11/2026): Frentes e Funis

Migration `20261121190000_gestao_frentes_funis`. Ações em `app/(painel)/frentes/acoes.ts` e
`app/(painel)/funis/acoes.ts`.

## Frentes (`/frentes`, `/frentes/<slug>`)
- `frentes` ganhou objetivo, `meta_mensal`, público, canal, `estrategia` ("Como funciona"), notas e
  `linha_vendas` (`gcs`/`viral`): de onde sai o real do mês (vendas pagas, sem teste, confirmadas;
  líquido como no Hoje) para comparar com a meta.
- **Oferta e escada de preços:** `ofertas` (front, downsell, upsell, order bump; preço ou faixa com
  `preco_ate`; condição; conversão com origem para a fase 4).
- **Influencers:** `frente_influencers` (nome, @, nicho, seguidores, contato, custo, remuneração
  fixo/comissão/cupom, link, cupom, vendas com origem, notas). Aparece na frente do Viral (ou em
  qualquer frente que tiver influencer).
- **Próximos passos:** as iniciativas da frente em Projetos que não estão no ar nem pausadas.
- Dados iniciais: o texto do pedido de 21/11 (X1, Viral, Webinários); Lançamento vazio. Os 6 ganchos
  não estavam em nenhum arquivo: as notas dos blocos P1/P2 começaram vazias.

## Funis (`/funis`, `?m=<slug>`)
- Canvas com React Flow (`@xyflow/react` 12.12.1): `mapas` (um por funil; `frente_id` vazio = visão
  geral), `mapa_blocos` e `mapa_ligacoes` (o banco só liga blocos do mesmo funil). Nomes `mapa_*`
  para não confundir com as tabelas `funil_*` antigas (Data Crazy, arquivadas).
- Bloco: nome, tipo, status (verde no ar, amarelo em construção, cinza ideia, vermelho com problema),
  preço ou faixa, número da etapa (com origem), nota (gancho), links (um por linha "Nome | url") e,
  na visão geral, o funil que ele abre (`abre_mapa_id`).
- Editar: clicar no bloco abre o painel; "+ Bloco" cria num espaço livre perto do meio da tela;
  puxar de uma bolinha até outra liga (raio de 48 px); clicar na seta edita o rótulo ou apaga.
  Arrastar salva a posição. A câmera não fica salva (abre ajustada à tela; computador e celular
  são diferentes) — a coluna `mapas.viewport` ficou sem uso.
- Exportar PNG: `html-to-image` 1.11.11 (exemplo oficial do React Flow), imagem do funil inteiro.
- Figma/FigJam: link por funil (só `figma.com`), aberto embutido ao lado com "Figma ao lado".
