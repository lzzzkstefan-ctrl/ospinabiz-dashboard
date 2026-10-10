// Escala: convida um PLANTONISTA (quem só cobre turnos) para o painel.
// - a pessoa precisa estar em "Pessoas que cobrem" (/escala/config) com esse nome;
// - cria o login pelo Supabase, põe app_metadata.papel = "plantonista" e liga o login à pessoa
//   (equipe.usuario_id): é o que o check-in e o RLS do Funil usam;
// - padrão: gera o LINK de convite e mostra aqui, para mandar pelo WhatsApp (só para a pessoa;
//   o link dá acesso à conta). Vale ~1 hora.
// Plantonista vê: Início, Escala e check-in, os leads dele no Funil e as tarefas dele. Não vê
// Vendas, comissão, Webinários nem Monitor (bloqueado no banco, migration escala).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/escala-convidar.mjs --nome="Lucas" --email=lucas@exemplo.com            # prévia
//   node --env-file=.env.local scripts/escala-convidar.mjs --nome="Lucas" --email=lucas@exemplo.com --aplicar  # cria e mostra o link
//   ... --site=https://ospinabiz-dashboard.vercel.app (padrão)

import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const nome = arg("nome")?.trim();
const email = arg("email")?.trim().toLowerCase();
const site = (arg("site") ?? "https://ospinabiz-dashboard.vercel.app").replace(/\/$/, "");
if (!nome || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Informe --nome="Nome como está na equipe" e --email=email@valido');
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

try {
  const { data: p, error } = await db.from("equipe").select("id, nome, usuario_id, ativo").eq("nome", nome).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) throw new Error(`"${nome}" não está na equipe: adicione em /escala/config (Pessoas que cobrem) primeiro`);
  if (!p.ativo) throw new Error(`${p.nome} está inativo`);
  if (p.usuario_id) throw new Error(`${p.nome} já tem login ligado: nada a fazer`);

  console.log(`Convite: ${p.nome} · papel plantonista · link para mandar no WhatsApp`);
  if (!aplicar) {
    console.log("Prévia: nada foi criado. Rode com --aplicar.");
    process.exit(0);
  }

  const r = await db.auth.admin.generateLink({ type: "invite", email });
  if (r.error) throw new Error(`link de convite: ${r.error.message}`);
  const usuarioId = r.data.user.id;
  const link = `${site}/confirmar?token_hash=${r.data.properties.hashed_token}&type=invite&next=/definir-senha`;

  const { error: ep } = await db.auth.admin.updateUserById(usuarioId, { app_metadata: { papel: "plantonista" } });
  if (ep) throw new Error(`papel: ${ep.message}`);
  const { error: eq } = await db.from("equipe").update({ usuario_id: usuarioId }).eq("id", p.id);
  if (eq) throw new Error(`ligar à equipe: ${eq.message}`);

  console.log(`\nLogin criado e ligado a ${p.nome} (plantonista).`);
  console.log(`\nLink de convite (pessoal, mande só para ${p.nome}; vale ~1 hora):\n${link}`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
