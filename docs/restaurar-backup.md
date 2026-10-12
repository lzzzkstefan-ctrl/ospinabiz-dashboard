# Restaurar um backup

Os backups ficam nas **Releases** do repositório privado
[lzzzkstefan-ctrl/ospinabiz-dashboard-backups](https://github.com/lzzzkstefan-ctrl/ospinabiz-dashboard-backups):

- `banco-AAAA-MM-DD`: todo dia às 3h de Brasília. Dentro: `roles.sql`, `schema.sql`, `data.sql`
  (gerados por `supabase db dump`, o método oficial), `storage-arquivos.csv` (lista dos arquivos do
  Storage) e `contagem.tsv` (linhas de cada tabela no momento do backup).
- `storage-AAAA-MM-DD`: aos domingos. Dentro: os arquivos de cada bucket e `lista.csv`.
- Ficam os últimos 30 dias. Tudo criptografado (AES-256) com a senha `BACKUP_PASSPHRASE`.

**Sem a `BACKUP_PASSPHRASE` não dá para abrir nenhum backup.** Ela está nos Secrets do repositório de
backups (o GitHub não deixa ler de volta) e precisa estar guardada também fora do GitHub (gerenciador
de senhas do Davi).

Aos domingos o GitHub restaura sozinho o backup do dia num Supabase local e compara a contagem de
linhas com a produção (aba **Actions** do repositório de backups, job "testar-restauracao"). Se ficar
vermelho, o backup daquele dia tem problema.

## O que precisa

- Um computador com Docker **ou** um projeto novo no Supabase para receber o backup.
- `psql` 17 (cliente do Postgres) e `gpg`. No Windows, o Git Bash já tem `gpg`.
- A `BACKUP_PASSPHRASE`.

## 1. Baixar e abrir

1. No repositório de backups, abra **Releases** e baixe o `banco-AAAA-MM-DD.tar.gz.gpg` (e o `.sha256`)
   do dia que você quer.
2. Confira e abra (Git Bash ou terminal Linux/Mac):

```bash
sha256sum -c banco-AAAA-MM-DD.sha256
gpg -d banco-AAAA-MM-DD.tar.gz.gpg > banco.tar.gz      # pede a BACKUP_PASSPHRASE
mkdir banco && tar -xzf banco.tar.gz -C banco
ls banco    # roles.sql  schema.sql  data.sql  storage-arquivos.csv  contagem.tsv
```

## 2. Restaurar o banco

**Nunca restaure por cima do projeto de produção que está funcionando.** Restaure num projeto
**novo** do Supabase (região us-east-1, a mesma do atual; Postgres 17) e depois aponte o dashboard para ele, ou num
Supabase local para conferir.

Antes, prepare dois arquivos (os mesmos ajustes que o teste automático de domingo faz):

```bash
# permissões internas do Supabase (já vêm no projeto novo; o usuário postgres não pode repeti-las)
grep -v '^GRANT SET ON PARAMETER' banco/roles.sql > roles-restaurar.sql
# blocos de dados vazios (alguns são de tabelas internas que o postgres não pode gravar)
awk '/^COPY .* FROM stdin;$/ { if (c != "") print c; c = $0; next }
     c != "" && /^\\\.$/ { c = ""; next }
     c != "" { print c; c = "" }
     { print }' banco/data.sql > data-restaurar.sql
```

Pegue a string de conexão do projeto novo em **Connect > Session pooler** (porta 5432) e rode:

```bash
psql "postgresql://postgres.<ref-novo>:<senha>@<host-do-pooler>:5432/postgres" \
  --single-transaction -v ON_ERROR_STOP=1 \
  -f roles-restaurar.sql \
  -f banco/schema.sql \
  -c 'SET session_replication_role = replica' \
  -f data-restaurar.sql
```

- `--single-transaction`: ou entra tudo, ou nada (não fica meio restaurado).
- `session_replication_role = replica`: desliga os gatilhos durante a carga dos dados, para não
  recalcular nem bloquear nada que já estava certo.

Teste feito em 12/10/2026 (Supabase local, Postgres 17): restaurou **60 tabelas e 4.395 linhas, tudo
igual à produção** (logins em `auth.users`, vendas, funil, escala, tarefas, Storage).

Num Supabase local (com Docker): `npx supabase start` e use
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` no lugar da string acima.

### Conferir

```bash
psql "<string do banco restaurado>" -At -F $'\t' -f contagem.sql > restaurado.tsv
diff banco/contagem.tsv restaurado.tsv && echo "tudo igual"
```

(`contagem.sql` está na pasta `scripts/` do repositório de backups.)

## 3. Restaurar as fotos (Storage)

1. Baixe o `storage-AAAA-MM-DD.tar.gz.gpg` do domingo mais recente e abra igual ao passo 1.
2. Dentro há uma pasta por bucket (hoje só `capas`). No painel do projeto novo: **Storage > New bucket**
   com o mesmo nome e a mesma configuração (o `capas` é público), e envie os arquivos mantendo as
   mesmas pastas (ex.: `inicio/capa-....png`). Os caminhos têm que ser iguais aos do `lista.csv`,
   porque o banco guarda o caminho de cada arquivo.

## 4. Depois de restaurar num projeto novo

O banco volta inteiro (tabelas, dados, logins em `auth.users`, regras de acesso), mas algumas coisas
são do projeto e não vêm no backup:

- **Vercel:** trocar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e
  `SUPABASE_SECRET_KEY` pelas do projeto novo e fazer redeploy. Atualizar também o `.env.local`.
- **Vault e pg_cron:** o `CRON_SECRET` e a URL da Vercel ficam no Vault do Supabase. Recriar no
  projeto novo, senão o relógio (pg_cron) não chama as rotas.
- **Edge Function da Hubla:** publicar de novo (`npx supabase functions deploy hubla-webhook`), com o
  secret `HUBLA_WEBHOOK_TOKEN`, e trocar a URL do webhook na Hubla.
- **Auth:** conferir em Authentication > URL Configuration as URLs de redirecionamento e o SMTP.
- **Repositório de backups:** trocar o secret `SUPABASE_DB_URL` (e `SUPABASE_URL`/`SUPABASE_SECRET_KEY`)
  pelos do projeto novo.
- Atualizar `docs/contas.md` com o ID do projeto novo.
