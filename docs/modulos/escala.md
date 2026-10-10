# Check-in (antes "Escala e check-in")

Aba `/escala` (menu "Check-in"; o endereço continua /escala). Pedido do Davi em 10/10/2026: as campanhas rodam 7 dias, atendimento
das 9h às 22h. No começo, domingo a sexta com os vendedores e sábado sem escala fixa (alguém faz
"raspagem": limpar a fila acumulada). Mais para frente, segunda a segunda. Quem pode cobrir: Davi,
Vyenna, Rodrigo, os irmãos do Davi ou alguém contratado só para sábado.

## Fase 1 (10/10/2026, migration `escala`)

- **Escala da semana:** grade de domingo a sábado, com navegação de semana. Cada dia mostra quem
  cobre (escala padrão + plantões confirmados), horário e tipo (normal / raspagem). Situação do dia:
  **coberto** (turno normal no horário todo), **parcial** (tem alguém, mas sobra buraco ou é só
  raspagem; mostra "sem ninguém: 14h–22h") ou **DESCOBERTO** (ninguém), em destaque.
  Horário da operação = `funil_config.atendimento_inicio/fim` (o mesmo do Funil).
- **Escala padrão** (`/escala/config`, só admin): quem cobre cada dia da semana. Guarda histórico
  (`desde` / `ate`): tirar alguém da escala termina ontem (o que ainda nem começou é apagado), então o
  "escalado" dos dias que já passaram não muda.
- **Plantões extras:** "+ vou ficar" no dia da grade (dia, horário, tipo). Nasce **pendente** (aparece
  apagado na grade, "a confirmar"); o admin confirma ou recusa (recusa pede motivo). Quem pediu
  cancela enquanto pendente. Só de hoje em diante (o admin pode marcar qualquer dia e já confirmar).
- **Check-in:** "Começar turno" (escolhe normal/raspagem) e "Encerrar turno". A hora é a do servidor
  (funções `escala_comecar_turno` / `escala_encerrar_turno`): ninguém digita. Um turno aberto por
  pessoa. Turno esquecido aberto fecha sozinho no fim do atendimento do dia em que começou (pg_cron
  `escala-encerrar-esquecidos`, 22h05) e fica marcado "automático". O admin corrige o horário com
  motivo; cada correção fica em `escala_checkins_alteracoes` (só acrescenta).
- **Atendendo agora:** quem está com turno aberto (todos veem).
- **Presença da semana (escalado x realizado):** por dia e pessoa: horário escalado, turnos feitos,
  horas feitas de horas escaladas e situação: ok, atrasou (entrou mais de 10 min depois), faltou
  (escalado, horário começou e não fez check-in), fora da escala (check-in sem escala), em turno,
  ainda não começou. O admin vê todos; os outros, só a própria.
- **Pessoas que cobrem** (`/escala/config`): o admin adiciona pessoas à equipe só com o nome. Sem
  login a pessoa entra na escala mas não faz check-in.

## Papel "plantonista"

`app_metadata.papel = 'plantonista'`: quem só cobre turnos. Vê Início, Tarefas (só as dele), Funil
(só os leads dele, pelo RLS de sempre) e Escala. **Não vê** Vendas (nenhuma aba, nem a Geral),
comissão, Webinários, Monitor, BMs, Usuários.

O bloqueio é no banco:
- `privado.eh_plantonista()`; `privado.vendas_papel()` devolve `'nenhum'` para ele (antes, quem não
  tinha papel em Vendas virava "vendedor");
- leitura de `tickets` (preço e comissão por ticket), `vendedores`, `vendas_metas` e `monitor_*`
  (telefones dos números) fechada para ele (as regras "qualquer logado lê" foram achadas pelo que
  fazem e trocadas; a migration confere que não sobrou nenhuma);
- `vendas_geral_equipe()` e `webinarios_no_ar()` não devolvem nada para ele;
- tarefas: vê e edita só as dele.

Na tela: `proxy.ts` (BLOQUEADO_PLANTONISTA = /vendas, /webinarios) e o menu (`para` em
`components/painel-nav.tsx`). Testado em 10/10 com um plantonista temporário (apagado depois).

**Convite:** pessoa em "Pessoas que cobrem" → `node --env-file=.env.local scripts/escala-convidar.mjs
--nome="Nome" --email=... [--aplicar]` (prévia sem `--aplicar`; o link sai para mandar no WhatsApp,
vale ~1h). Para ver os leads no Funil, a pessoa também precisa de uma conta de atendente na Data
Crazy ligada a ela.

## Fase 2 (a fazer)

Ligação com o Funil: por dia da semana, leads, sem atendimento na chegada, conversão e cobertura
(coberto / raspagem / descoberto, pelo que aconteceu de verdade no check-in), e quanto se perde
sem plantão. Com poucos leads (cerca de 55 desde 04/10), avisar quando a base for pequena.

## Mudanças de 10/10/2026 (tarde, pedido do Davi; migration `escala_saida_automatica`)

- **Nome:** "Check-in" no menu e no título (endereço continua `/escala`).
- **Plantões extras saíram da tela** (lista e "+ vou ficar"). A tabela `escala_plantoes` e a função
  `escala_cancelar_plantao` continuam no banco, sem uso (vazias).
- **Calendário semanal:** dias em colunas (domingo a sábado), horas em linhas (8h–24h). Cada pessoa
  do dia tem uma faixa na cor dela (pelo id da equipe) com dois blocos lado a lado: claro =
  horário fixo (previsto), forte = entrou/saiu de verdade (realizado). Dia sem ninguém no horário
  fixo: fundo vermelho "descoberto"; horas da operação sem ninguém: vermelho claro. Linha vermelha =
  agora. Navegação anterior / hoje / próxima. No celular a grade rola para o lado dentro do card.
- **"Entrei na operação" / "Sair da operação":** botão grande no topo da aba e no Início (componentes
  `components/painel-operacao.tsx` e `components/botao-operacao.tsx`). É o mesmo check-in (sempre
  tipo normal). "Online agora" com bolinha verde e desde que horas.
- **Atraso:** entrou mais de 10 min depois do início do horário fixo; aparece no calendário e na tabela
  "Previsto x realizado".
- **Saída automática:** quem esquece de sair sai no fim do SEU horário fixo do dia em que entrou
  (antes: 22h05, fim da operação). Sem horário fixo no dia (ou entrou depois do fim dele): meia-noite.
  pg_cron a cada 15 min. Se a pessoa continuar atendendo depois do fim do horário fixo, precisa apertar
  "Entrei na operação" de novo (vira outro bloco).
- **Horários fixos cadastrados em 10/10:** Davi 9h–22h domingo a sexta; Vyenna 9h–22h segunda a
  sexta; sábado descoberto. A pedido do Davi, valem desde **01/10/2026** (mudado direto no banco em
  10/10), para a semana de 04 a 09/10 aparecer coberta. Esses dias mostram "não entrou" porque o
  check-in só existe desde 10/10.
- **"Vale a partir de" de um horário novo:** padrão = domingo da semana atual (tela e ação).

## Mudanças de 10/10/2026 (fim da tarde, pedido do Davi)

- **Calendário semanal saiu da página** (o arquivo `_componentes/calendario.tsx` foi apagado em 10/10; está no histórico do git, commit 05a2bca, se quiser de volta).
- **Página, de cima para baixo:** botão "Entrei na operação" em vidro líquido (`.glass`, borda que
  gira; online ganha brilho verde) + "Online agora"; depois os **7 cards da semana atual** (domingo a
  sábado, hoje em destaque) com o horário fixo de cada pessoa e, embaixo, o que aconteceu: entrou às,
  saiu às (ou "online agora"), atraso, saída automática, "não entrou". Sem navegação de semana.
- **Quem vê o quê:** o horário fixo de todos aparece para todos; entrada, saída e atraso dos outros
  só para o admin (os outros veem só os próprios). "Online agora" todos veem.
- **Admin:** "Editar horários" (`?editar=1`) mostra o formulário de horário fixo e o "tirar" em cada
  card; "corrigir" em cada entrada (com motivo). `/escala/config` virou só **Pessoas**.
- **Espaço do topo (todas as páginas):** `main` com `md:pt-28` (antes 24), faixa fixa no topo que
  esmaece o conteúdo que passa por baixo do menu ao rolar, e `scroll-padding-top` para links com
  `#trecho`. Medido com fotos reais (Edge sem janela): menu termina em 69px, título começa em 112px.
- **Aviso "Date.now() while prerendering" (Cache Components):** `await connection()` no
  `createClient()` de `lib/supabase/server.ts` (o login confere a validade com o relógio). Conferido
  em 11 telas: nenhum aviso.
- **Aviso de hidratação** do `.glass`: `components/pausar-brilho.tsx` põe a classe
  `glass-fora-da-tela` fora do React; os `.glass` que chegam depois (menu e botão, dentro de
  Suspense) têm `suppressHydrationWarning` (o jeito do React para atributo mudado de propósito).

## Pausa (10/10/2026, migration `escala_pausas`)

- Online: ao lado de "Sair da operação", botão **"Pausa"** (vidro líquido amarelo, token
  `--tag-amarelo`). Escolhe o motivo (Almoço, Banho, Imprevisto, Outro) + detalhe opcional (até 120).
- Em pausa: bolinha amarela "Em pausa desde 14:10 (Banho) · 12 min"; o botão vira **"Voltar da
  pausa"** ("Sair da operação" continua). Em "Online agora": "em pausa desde ... (motivo)".
- **Pausa longa:** acima de `escala_config.pausa_longa_min` (padrão 30; admin muda em "Editar
  horários"): vermelho no card e em "Online agora".
- Cards: cada pausa (início, fim, motivo, duração; aberta = "em pausa desde") e o total do dia;
  **tempo online = entradas menos pausas**.
- Saiu da operação (botão, saída automática ou correção) durante a pausa: a pausa termina na mesma
  hora (gatilho `escala_saida_encerra_pausa`) e aparece "terminou com a saída".
- Pausar/voltar só pelas funções `escala_pausar` / `escala_voltar_da_pausa` (hora do servidor);
  uma pausa aberta por pessoa, sempre dentro de uma entrada aberta.
- **"—" antes do check-in existir:** dia anterior ao primeiro check-in registrado (de qualquer
  pessoa) mostra "—" em vez de "não entrou".
- **Espaço do topo em px** (`md:pt-[112px]`, `scroll-padding-top: 120px`): em rem ele encolhia com
  fonte pequena no navegador e o título entrava por baixo do menu.
- Testado em 10/10 com cliques de verdade (Edge sem janela) e uma pessoa de teste apagada no fim.

## Notificações push e app instalável (10/10/2026, migration `notificacoes`)

- **App instalável (PWA):** `app/manifest.ts` (abre em /escala), ícones em `public/` (anel azul,
  gerados com sharp), `appleWebApp` no layout raiz. iPhone: só recebe com o app na tela de início
  (Compartilhar → Adicionar à Tela de Início) e aberto pelo ícone (iOS 16.4+).
- **Service worker** `public/sw.js`: só notificações (sem cache offline); `Cache-Control: no-store`
  (next.config) e liberado sem login no `proxy.ts` (junto com o manifest).
- **Chaves VAPID** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` = URL do
  site): `.env.local` e Vercel. A pública entra no build (NEXT_PUBLIC): mudar exige novo deploy.
- **Avisos** (`modulos/escala/alertas.ts`, envio em `lib/integracoes/webpush.ts`):
  pausa começou / acabou (na hora, pela ação; quem pausou não recebe o próprio), pausa longa,
  **operação descoberta** (no horário de atendimento, em dia com algum horário fixo, ninguém online;
  pausa não conta; avisa uma vez e avisa "coberta de novo" quando alguém volta; sábado sem horário
  fixo não avisa — decisão do Davi), **sem check-in** (por pessoa, 15 min depois do início do
  horário fixo). Pausa longa, descoberta e sem check-in: pg_cron `escala-alertas` a cada 2 min →
  `/api/escala/alertas`, e também logo depois de entrar/sair/pausar.
- **Sem repetição:** `notificacoes_enviadas` com chave única por acontecimento (pausa N, pessoa+dia,
  início da descoberta). Aparelho que desativou (404/410) é apagado de `push_inscricoes`.
- **Quem recebe:** `notificacoes_preferencias` (cada um escolhe no Check-in); sem escolha salva,
  admin recebe tudo e os outros nada. Salvar: update (com data) e, na primeira vez, insert sem
  `atualizado_em` (o grant de insert não inclui a data).
- **Depois:** mesmos avisos pelo WhatsApp quando o número remetente do Monitor estiver configurado.
- Testado em 10/10: ativação no Edge (serviço de push do Windows aceitou), "Testar", ainda não
  entrou, pausa, volta e pausa longa com pessoa de teste (apagada); decisão da operação descoberta
  com 10 cenários (`decidirDescoberta` em regras.ts), incluindo sábado sem horário fixo.
- **Ícone GCS Staff (10/10/2026):** imagem do Davi (1254×1254, 2,2 MB) → `public/icone-1024.png`
  (cópia mestra otimizada), 512, 192, maskable 512 (desenho a 78% no fundo preto, para o corte em
  círculo do Android), `apple-touch-icon.png` (180), `favicon-32.png` e `app/favicon.ico` (16/32/48).
  Nome curto no celular: "GCS Staff". O selo da barra de notificação do Android
  (`selo-notificacao.png`) continua o anel branco: ele precisa ser uma silhueta de uma cor só.
- **Ícone em pixel art (10/10/2026, mais tarde):** trocado pela versão "staff pixel art" do Davi
  (1254×1254, quadrada, fundo preto). Todos os tamanhos redimensionados com vizinho mais próximo
  (`kernel: "nearest"`, sem suavizar) e paleta sem pontilhado. Endereços com `?v=3` para o
  navegador/iPhone não usarem o ícone antigo em cache.

