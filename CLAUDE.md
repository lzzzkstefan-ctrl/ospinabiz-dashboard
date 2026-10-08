ESTE É O DASHBOARD DA EMPRESA, NÃO O MASTERVIEW PESSOAL. Nunca usar credenciais, Supabase ou dados do masterview (só o visual pode ser copiado; ver Regras).

# Ospinabiz Dashboard

Dashboard interno da empresa Ospinabiz. Projeto separado do masterview (pessoal do Davi):
repositório, Supabase, Vercel e credenciais próprios. O Davi não é programador: explique
escolhas em português simples.

## Regras

- A pasta oficial do projeto é `C:\dev\ospinabiz-dashboard`. Código não fica no OneDrive: ele sincroniza
  o `.env.local` para a nuvem e trava arquivos do `node_modules` e do `.next`.
- Nunca ler, copiar ou referenciar nada do masterview (código, `.env.local`, Supabase, `.vercel`).
  Ele fica em `D:\ARQUIVOS\Documents\GitHub\masterview` (`C:\dev\masterview` não existe).
  **Exceção: o design visual segue o masterview; credenciais, Supabase e dados nunca.**
  Pode ler (só leitura) estilos e aparência: `globals.css`, `tailwind.config.ts`, fontes, cores,
  componentes visuais (botões, cards, menu, layout). Continua proibido: `.env*`, chaves,
  `lib/supabase`, rotas de API, banco e dados. Nunca alterar nada lá; o visual é copiado para
  dentro deste projeto, sem importar arquivos de lá.
- Todos os tokens em variáveis de ambiente (`.env.local` local, Vercel em produção). Nunca no código.
  `.env.example` tem só os nomes.
- Dados reais (telefones dos números monitorados, clientes) ficam no banco, nunca no código nem no git.
- `docs/contas.md` registra onde está cada conta e quem é o dono. Só nomes, nunca senhas ou tokens.
- Decisão nova de arquitetura vai para `docs/decisoes.md` (com o porquê).
- Versões das dependências principais ficam fixas (sem `latest`).

## Estrutura

```
app/                          tudo que vira endereço (URL)
  (auth)/                     telas públicas: login, esqueci-senha, definir-senha, confirmar, erro
  (painel)/                   telas com login; layout.tsx = menu em pílula (topo) + barra de ícones (celular)
    page.tsx                  Início: capa editável + "Status do dia" (resumo das outras abas)
    <modulo>/page.tsx         tela do módulo (monitor, vendas, fechamento, bms)
    <modulo>/_componentes/    peças visuais usadas só por esse módulo
    admin/usuarios/           convites e papéis (só admin)
  api/                        endereços chamados por máquinas (Meta, pg_cron, botões)
    <modulo>/<acao>/route.ts  ex.: api/monitor/webhook, api/monitor/rodar-teste
modulos/<modulo>/             regras de negócio do módulo (sem tela, sem HTML)
lib/                          ferramentas compartilhadas por todos os módulos
  supabase/                   client.ts (navegador), server.ts (servidor, usuário logado),
                              admin.ts (chave secreta, só servidor), proxy.ts (sessão/login)
  integracoes/                meta.ts, telegram.ts (futuro: hubla.ts, kirvano.ts)
  auth/papeis.ts              checagem de papel admin/atendente
components/                   peças visuais usadas por mais de um módulo (ui/ = shadcn)
supabase/
  config.toml                 config do Supabase local
  migrations/                 SQL versionado (criar com `npx supabase migration new <nome>`)
docs/
  contas.md                   onde está cada conta
  decisoes.md                 decisões e porquês
  modulos/<modulo>.md         contexto de cada módulo (monitor.md já existe)
proxy.ts                      porteiro do Next: roda a checagem de login em toda página
```

## Onde cada coisa fica

| Tipo de arquivo | Lugar |
|---|---|
| Tela que uma pessoa abre | `app/(painel)/<modulo>/page.tsx` |
| Peça visual de um módulo só | `app/(painel)/<modulo>/_componentes/` |
| Peça visual usada em mais de um módulo | `components/` |
| Endereço chamado por máquina (webhook, cron, botão) | `app/api/<modulo>/<acao>/route.ts` |
| Regra de negócio (cálculo, decisão, montagem de mensagem) | `modulos/<modulo>/` |
| Conversa com serviço externo (Meta, Telegram, Hubla...) | `lib/integracoes/` |
| Acesso ao banco | `lib/supabase/` (`admin.ts` só no servidor) |
| Mudança no banco (tabela, coluna, RLS, cron) | `supabase/migrations/` |
| Contexto de módulo | `docs/modulos/<modulo>.md` |

Regras de convivência:
- Rotas em `app/api` são finas: recebem, conferem quem chamou e chamam `modulos/`. Regra não fica nelas.
- `modulos/X` não importa nada de `modulos/Y`. O que for comum sobe para `lib/`.
- `lib/integracoes/` só fala com o serviço externo; não decide nada de negócio.
- `/api` passa pelo `proxy.ts` sem exigir login. Por isso **toda** rota em `app/api` tem que
  checar sozinha quem chamou: assinatura da Meta, `Authorization: Bearer CRON_SECRET` ou usuário logado.
- Módulo novo = uma pasta em cada camada (`app/(painel)`, `app/api`, `modulos`, `docs/modulos`)
  + item no menu (`components/painel-nav.tsx`).

## Stack

- Next.js 16 (App Router, `proxy.ts` no lugar de middleware, `cacheComponents` ligado). Leia
  `node_modules/next/dist/docs/` antes de usar APIs que você não tem certeza que existem nessa versão.
- Supabase: Auth (convite só por e-mail, cadastro público desligado), Postgres com RLS,
  pg_cron + pg_net. Região sa-east-1.
- Supabase CLI via `npx supabase` (devDependency).
- Skills oficiais do Supabase em `.claude/skills/` (`supabase`, `supabase-postgres-best-practices`),
  instaladas com `npx skills add supabase/agent-skills`. Versões travadas em `skills-lock.json`.
- Hospedagem: Vercel (Hobby, conta pessoal do Davi por enquanto; projeto pensado para transferir a um time).

## Decisões principais (detalhes em docs/decisoes.md)

- "O Supabase é o relógio, a Vercel faz o trabalho": o código do webhook, do envio e do alerta fica
  em `app/api`. O pg_cron só chama essas rotas no horário. Não usar cron da Vercel (Hobby: 1x/dia, ±59 min).
- pg_cron roda em UTC. America/Sao_Paulo é UTC-3 (sem horário de verão desde 2019):
  7h30 = `30 10 * * *`, 17h = `0 20 * * *`.
- Papéis `admin` e `atendente`, guardados em `app_metadata` (nunca `user_metadata`).
- RLS ligado em toda tabela do schema `public`.
- O plano gratuito do Supabase pausa o projeto após 7 dias sem atividade. Manter um ping diário externo.

## Comandos

```bash
npm run dev      # local
npm run build    # checar antes de subir
npm run lint
npx supabase ... # CLI do Supabase
```
