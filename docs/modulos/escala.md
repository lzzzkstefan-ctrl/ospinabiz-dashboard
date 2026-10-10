# Escala e check-in

Aba `/escala` (menu "Escala"). Pedido do Davi em 10/10/2026: as campanhas rodam 7 dias, atendimento
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
