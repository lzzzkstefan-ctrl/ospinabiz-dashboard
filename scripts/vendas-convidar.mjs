// Vendas: convida um vendedor para o painel (papel "atendente").
// - usa o e-mail de acesso guardado em vendedores.email (scripts/vendas-base.mjs --email=...);
// - cria o login pelo Supabase, põe app_metadata.papel = "atendente" e liga o login à equipe
//   (equipe.usuario_id), que é o que o RLS usa para mostrar só as vendas dele;
// - padrão: gera o LINK de convite e mostra aqui, para mandar pelo WhatsApp (não depende
//   de SMTP). Com --enviar-email, o próprio Supabase manda o e-mail (precisa de SMTP próprio).
// O link é pessoal e dá acesso à conta: não cole em lugar público.
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-convidar.mjs --utm=vyenna                     # prévia: só mostra
//   node --env-file=.env.local scripts/vendas-convidar.mjs --utm=vyenna --aplicar           # cria e mostra o link
//   node --env-file=.env.local scripts/vendas-convidar.mjs --utm=vyenna --aplicar --enviar-email
//   ... --site=https://ospinabiz-dashboard.vercel.app (padrão)

import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const porEmail = process.argv.includes("--enviar-email");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const utm = arg("utm");
const site = (arg("site") ?? "https://ospinabiz-dashboard.vercel.app").replace(/\/$/, "");
if (!utm) {
  console.error("Informe --utm=<código do vendedor>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

try {
  const { data: v, error } = await db.from("vendedores").select("equipe_id, email, ativo, equipe(nome, usuario_id)").eq("utm_term", utm).maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw new Error(`vendedor com utm "${utm}" não existe`);
  if (!v.ativo) throw new Error(`${v.equipe.nome} está inativo`);
  if (!v.email) throw new Error(`${v.equipe.nome} sem e-mail de acesso: rode scripts/vendas-base.mjs --email=${utm}:<email>`);
  if (v.equipe.usuario_id) throw new Error(`${v.equipe.nome} já tem login ligado: nada a fazer`);

  console.log(`Convite: ${v.equipe.nome} <${v.email}> · papel atendente · ${porEmail ? "e-mail pelo Supabase" : "link para mandar no WhatsApp"}`);
  if (!aplicar) {
    console.log("Prévia: nada foi criado. Rode com --aplicar.");
    process.exit(0);
  }

  let usuarioId;
  let link = null;
  if (porEmail) {
    const r = await db.auth.admin.inviteUserByEmail(v.email, { redirectTo: `${site}/definir-senha` });
    if (r.error) throw new Error(`convite por e-mail: ${r.error.message}`);
    usuarioId = r.data.user.id;
  } else {
    const r = await db.auth.admin.generateLink({ type: "invite", email: v.email });
    if (r.error) throw new Error(`link de convite: ${r.error.message}`);
    usuarioId = r.data.user.id;
    link = `${site}/confirmar?token_hash=${r.data.properties.hashed_token}&type=invite&next=/definir-senha`;
  }

  const { error: ep } = await db.auth.admin.updateUserById(usuarioId, { app_metadata: { papel: "atendente" } });
  if (ep) throw new Error(`papel: ${ep.message}`);
  const { error: eq } = await db.from("equipe").update({ usuario_id: usuarioId }).eq("id", v.equipe_id);
  if (eq) throw new Error(`ligar à equipe: ${eq.message}`);

  console.log(`\nLogin criado e ligado a ${v.equipe.nome} (atendente).`);
  if (link) console.log(`\nLink de convite (pessoal, mande só para ${v.equipe.nome}):\n${link}`);
  else console.log("E-mail enviado pelo Supabase. Se não chegar, rode de novo sem --enviar-email depois de apagar o convite no painel do Supabase.");
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
