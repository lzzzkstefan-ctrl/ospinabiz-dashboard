# Contas do projeto

Onde está cada conta e quem é o dono. **Só nomes e URLs. Nunca senhas, tokens ou chaves.**

| Serviço | O quê | Nome / URL | Dono | Plano | Criado em |
|---|---|---|---|---|---|
| GitHub | Repositório privado | [lzzzkstefan-ctrl/ospinabiz-dashboard](https://github.com/lzzzkstefan-ctrl/ospinabiz-dashboard) | Conta pessoal do Davi (`lzzzkstefan-ctrl`) | Free | 2026-10-08 |
| Supabase | Organização | Ospinabiz | Davi | Free | 2026-10-08 |
| Supabase | Projeto (sa-east-1) | ID `ihxevdaaxzamqzawzgmd` ([painel](https://supabase.com/dashboard/project/ihxevdaaxzamqzawzgmd)) | Organização Ospinabiz | Free | 2026-10-08 |
| Supabase | Auth: admin inicial | Criado pelo painel do Supabase, com `app_metadata.papel = "admin"` | Davi | | 2026-10-08 |
| Vercel | Projeto | [ospinabiz-dashboard.vercel.app](https://ospinabiz-dashboard.vercel.app), ligado ao GitHub (deploy automático da `main`) | Conta pessoal do Davi | Hobby | |
| SMTP (e-mails de convite) | _a definir_ | | | | |
| Meta | BM do monitor + número remetente | _pendente_ | | | |
| Telegram | Bot de alertas | _pendente_ | | | |
| Hubla | Webhook de vendas → `/api/vendas/hubla` (ao lado do Metrito) | _a cadastrar_ (token em `HUBLA_WEBHOOK_TOKEN`) | | | |

## Observações

- **GitHub:** sem organização por enquanto. A Vercel Hobby não importa repositório privado de
  organização, então o repositório fica na conta pessoal. Quando a Vercel for para um time
  pago, transferir o repositório para uma organização da empresa (Settings > Transfer ownership)
  e reconectar na Vercel.

- **Vercel:** está na conta pessoal (Hobby) temporariamente. Os termos do Hobby são para uso
  não comercial, então o projeto deve ir para um time da empresa quando o dashboard for
  usado de verdade. A transferência é feita em Project Settings > Transfer.
- **Supabase gratuito:** pausa após 7 dias sem atividade. Limite de 2 projetos gratuitos ativos.
