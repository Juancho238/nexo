import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async (request: Request) => {
  const app = Deno.env.get("NEXO_APP_URL"),
    allowed = app ? new URL(app).origin : "";
  const cors = {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (!allowed) return reply({ error: "Configurá NEXO_APP_URL" }, 503);
  if (
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== allowed
  )
    return reply({ error: "Origen no permitido" }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors, status: 204 });
  if (request.method !== "POST")
    return reply({ error: "Método no permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!,
    scoped = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: request.headers.get("Authorization") || "" },
      },
      auth: { persistSession: false },
    });
  const {
    data: { user },
    error,
  } = await scoped.auth.getUser();
  if (error || !user) return reply({ error: "Sesión inválida" }, 401);
  const { data: profile } = await scoped
    .from("profiles")
    .select("active,role")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "super_admin")
    return reply({ error: "Acceso denegado" }, 403);
  let id: string;
  try {
    ({ candidate_id: id } = await request.json());
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      throw new Error();
  } catch {
    return reply({ error: "Candidato inválido" }, 400);
  }
  const { data: c } = await scoped
    .from("candidates")
    .select("id,name,email")
    .eq("id", id!)
    .single();
  if (!c?.email)
    return reply({ error: "La ficha debe tener un email válido" }, 400);
  const service = createClient(
    url,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: existing } = await service
    .from("candidate_accounts")
    .select("user_id")
    .eq("candidate_id", id!)
    .maybeSingle();
  if (existing)
    return reply(
      {
        error:
          "Este candidato ya tiene acceso. Para recuperar la contraseña debe usar el portal.",
      },
      409,
    );
  const { data: invite, error: inviteError } =
    await service.auth.admin.inviteUserByEmail(c.email, {
      redirectTo: allowed + "/?portal=1&setup=1",
      data: { name: c.name },
    });
  if (inviteError)
    return reply(
      {
        error:
          "No se pudo invitar. Revisá SMTP o si el email ya tiene otra cuenta.",
      },
      422,
    );
  const { error: saveError } = await service
    .from("candidate_accounts")
    .insert({ user_id: invite.user.id, candidate_id: c.id });
  if (saveError) {
    await service.auth.admin.deleteUser(invite.user.id);
    return reply(
      {
        error:
          "No se pudo asignar el acceso. Revisá si existe una invitación previa.",
      },
      500,
    );
  }
  return reply({ ok: true });
});
