// Gera um link para a pessoa (re)definir a senha, sem apagar nem recriar o login.
// Serve para quem já tem login mas ficou sem senha (ex.: convite aberto num link que não
// funcionou). O usuário continua o mesmo, então o vínculo com a equipe/vendedor não muda.
// O link não é enviado por e-mail: é mostrado aqui para mandar no WhatsApp. Ele é pessoal,
// dá acesso à conta, vale uma vez só e expira (prazo do Supabase, em geral 1 hora).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/link-senha.mjs --nome=Vyenna
//   ... --site=https://ospinabiz-dashboard.vercel.app (padrão)

import { createClient } from "@supabase/supabase-js";

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const nome = arg("nome");
const site = (arg("site") ?? "https://ospinabiz-dashboard.vercel.app").replace(/\/$/, "");
if (!nome) {
  console.error("Informe --nome=<nome na equipe>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

try {
  const { data: eq, error } = await db.from("equipe").select("nome, usuario_id").eq("nome", nome).maybeSingle();
  if (error) throw new Error(error.message);
  if (!eq) throw new Error(`"${nome}" não está na equipe`);
  if (!eq.usuario_id) throw new Error(`${eq.nome} ainda não tem login: use o convite`);

  const { data: u, error: eu } = await db.auth.admin.getUserById(eq.usuario_id);
  if (eu) throw new Error(eu.message);
  const r = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email });
  if (r.error) throw new Error(r.error.message);

  console.log(`Link para ${eq.nome} criar a senha (pessoal, uso único, expira):`);
  console.log(`${site}/confirmar?token_hash=${r.data.properties.hashed_token}&type=recovery&next=/definir-senha`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
