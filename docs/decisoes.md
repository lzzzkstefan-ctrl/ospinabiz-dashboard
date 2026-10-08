# Decisões do projeto

Registro curto do que foi decidido e por quê. Decisão nova entra no topo.

## 2026-10-08: Estrutura organizada por módulo

Cada módulo tem uma pasta própria em cada camada:
- telas em `app/(painel)/<modulo>`;
- rotas de máquina em `app/api/<modulo>`;
- regras em `modulos/<modulo>`;
- documentação em `docs/modulos/<modulo>.md`.

Ferramentas usadas por mais de um módulo ficam em `lib/`.

**Por quê:** módulo novo (vendas, fechamento) entra sem mexer nos outros. As regras ficam
fora das telas pra serem usadas pelo webhook, pelo relógio e pelo botão sem copiar código.

## 2026-10-08: Supabase é o relógio, Vercel faz o trabalho

O webhook, o envio e o alerta rodam em rotas `app/api` do Next, na Vercel. O pg_cron do Supabase
só chama essas rotas nos horários certos.

**Por quê:**
- **Cron da Vercel:** no Hobby, o cron roda no máximo 1x/dia por tarefa e com precisão de hora
  (±59 min).
- **pg_cron:** é gratuito e tem precisão de minuto.
- **Código:** ficar num lugar só (Next) é mais simples de manter do que dividir com Edge Functions em Deno.

## 2026-10-08: GitHub na conta pessoal, sem organização

A Vercel Hobby não importa repositório privado de organização. Transferir para uma organização
da empresa quando a Vercel for para um time pago. Ver `contas.md`.

## 2026-10-08: Login só por convite, papéis admin e atendente

Cadastro público desligado. O papel fica em `app_metadata` (o usuário não consegue editar).
