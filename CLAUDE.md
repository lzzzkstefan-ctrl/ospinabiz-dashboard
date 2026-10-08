ESTE É O DASHBOARD DA EMPRESA, NÃO O MASTERVIEW PESSOAL. Nunca usar credenciais ou caminhos de C:\dev\masterview.

# Ospinabiz Dashboard

Dashboard interno da empresa Ospinabiz. Projeto separado do masterview (pessoal do Davi):
repositório, Supabase, Vercel e credenciais próprios.

## Regras

- Nunca ler, copiar ou referenciar nada de `C:\dev\masterview` (código, `.env.local`, Supabase, `.vercel`).
- Todos os tokens em variáveis de ambiente (`.env.local` local, Vercel, secrets do Supabase). Nunca no código.
  `.env.example` tem só os nomes.
- `docs/contas.md` registra onde está cada conta e quem é o dono. Só nomes, nunca senhas ou tokens.
- Versões das dependências principais ficam fixas (sem `latest`).

## Stack

- Next.js 16 (App Router, `proxy.ts` no lugar de middleware, `cacheComponents` ligado). Leia
  `node_modules/next/dist/docs/` antes de usar APIs que você não tem certeza que existem nessa versão.
- Supabase: Auth (convite só por e-mail, cadastro público desligado), Postgres com RLS,
  Edge Functions, pg_cron + pg_net. Região sa-east-1.
- Supabase CLI via `npx supabase` (devDependency).
- Hospedagem: Vercel (Hobby, conta pessoal do Davi por enquanto; projeto pensado para transferir a um time).

## Estrutura

```
app/(auth)/        login, esqueci-senha, definir-senha, confirmar (link dos e-mails), erro
app/(painel)/      layout com menu lateral
  monitor/         módulo 1: monitor dos números de WhatsApp (ver docs/monitor.md)
  vendas/, bms/    em breve
components/        componentes compartilhados (ui/ = shadcn)
lib/supabase/      clientes do Supabase (browser, server, proxy)
supabase/
  migrations/      SQL versionado
  functions/       meta-webhook (status da Meta), run-test (envia o template)
docs/              monitor.md, contas.md
```

## Decisões

- Agendamento e webhook rodam no Supabase (pg_cron + Edge Functions), não no cron da Vercel,
  pra não depender de plano pago.
- pg_cron roda em UTC. America/Sao_Paulo é UTC-3 (sem horário de verão desde 2019):
  7h30 = `30 10 * * *`, 17h = `0 20 * * *`.
- Papéis de usuário: `admin` e `atendente`.
- O plano gratuito do Supabase pausa o projeto após 7 dias sem atividade. Manter um ping diário externo.

## Comandos

```bash
npm run dev      # local
npm run build    # checar antes de subir
npm run lint
npx supabase ... # CLI do Supabase
```
