# Arquivado e Configurações (21/11/2026)

A operação do dia a dia passou para o Prime. O app deixou de ser painel de operação e virou a
**central de gestão** do Davi e do Rodrigo. Fase 1 do plano: arquivar a operação e montar a base.

## Quem vê o quê

- **Gestão** (`app_metadata.gestao = true`, só Davi e Rodrigo): Hoje, Vendas, Arquivado e
  Configurações inteiras. Checagem em `lib/auth/gestao.ts` (proxy) e `usuarioLogado().gestao`.
- **Vyenna** (papel `admin`, Vendas `gerente`) e **Teste**: só Vendas e Configurações → Notificações.
  `/` manda para `/vendas`. O papel dela não mudou de propósito: a Vendas lê o papel admin
  (ex.: Reembolsos) e tinha que continuar igual.
- O bloqueio de endereço digitado fica em `lib/supabase/proxy.ts` (`GESTAO_PATHS` + `ehAbaArquivada`).

## Abas arquivadas (só leitura)

Monitor (`/monitor`), Check-in (`/escala`), BMs (`/bms`), Fechamento (`/fechamento`, que nunca saiu do
"em breve"), Webinários antigo (`/webinarios`), Funil antigo (`/funil`), Tarefas (`/tarefas`) e
Melhorias (`/melhorias`). Lista em `lib/arquivo.ts` (`ABAS_ARQUIVADAS`), cards em `/arquivado`.

Só leitura em três camadas:
1. **Tela:** `layout.tsx` de cada aba usa `MolduraArquivada` (`components/arquivado.tsx`): faixa
   "arquivado em 21/11/2026" e `data-arquivado`, que no `globals.css` tira o clique dos campos e botões
   de formulários (menos `method="get"`), dos botões de envio e do arrastar.
2. **Servidor:** toda ação em `app/(painel)/<aba>/acoes.ts` começa com `soLeitura()` e devolve
   "Aba arquivada em 21/11/2026: só leitura." sem fazer nada.
3. **Banco:** gatilho `arquivada_so_leitura` (migration `20261121120000_arquivar_abas_operacao`) em
   40 tabelas: `monitor_*`, `escala_*`, `funil_*` (as visões `funil_*_equipe` só leem), `webinario*`,
   `tarefas`, `melhorias`, `compromissos`, `feriados`, `equipe_whatsapp`, `notificacoes_preferencias`.

Nada foi apagado. Para reabrir uma aba: tirar o `soLeitura` (ou fazer ele devolver null para ela), o
`layout.tsx` e o gatilho das tabelas dela (`drop trigger arquivada_so_leitura on public.<tabela>`).

## Rotinas desligadas

`cron.unschedule` na mesma migration (o comando de reativar de cada uma está no comentário dela):

| Agendamento | O que fazia |
|---|---|
| `escala-alertas` (*/2) | pausa, volta, atraso na entrada, pausa longa, operação descoberta/coberta (push e WhatsApp) |
| `escala-feriados` (de hora em hora) | pergunta da véspera e lembrete das 20h |
| `escala-encerrar-esquecidos` (*/15) | encerrava check-in esquecido |
| `monitor-rodar-teste-*` e `monitor-fechar-teste-*` (manhã e tarde) | teste dos números das BMs pela Meta + Telegram |
| `funil-sincronizar` (*/15) | leads e conversas da Data Crazy |

As rotas dessas rotinas (`/api/escala/alertas`, `/api/escala/feriados`, `/api/monitor/rodar-teste`,
`/api/monitor/fechar-teste`, `/api/funil/sincronizar`) respondem 410 mesmo se forem chamadas.
O aviso de feriado da véspera saiu do layout do painel.

**Continua ligado:** webhook da Hubla, `vendas-processar-pendentes`, `vendas-reembolsos-lembretes` e os
avisos de venda e de reembolso (push).

## Configurações (`/configuracoes`)

- **Notificações** (todos): ativar, testar e desligar o push neste aparelho
  (`_componentes/notificacoes-aparelho.tsx`, ações em `app/(painel)/acoes-push.ts`). Saiu do Check-in
  porque o aviso de venda continua.
- **Usuários** (`/configuracoes/usuarios`, antes `/admin/usuarios`): só a gestão (antes chefe e gerente
  de Vendas). O atendente da Data Crazy aparece só para consulta (o Funil está travado).
- **Diagnóstico** (`/configuracoes/diagnostico`, antes `/admin/notificacoes`): só a gestão.
- Os endereços antigos redirecionam (`next.config.ts`).
