import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeScheduleAdmin } from "@/lib/schedule-admin";

type AdminRoleRow = {
  id: string;
  user_id: string;
  role: string;
  active: boolean;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
};

async function findAuthUserByEmail(adminClient: SupabaseClient, email: string) {
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLocaleLowerCase("en-US") === normalizedEmail);
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 20) return null;
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeScheduleAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const { data: roles, error } = await authorization.adminClient
    .from("user_roles")
    .select("id, user_id, role, active, granted_by, created_at, updated_at")
    .eq("role", "admin")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: `No se pudieron cargar los roles de administrador: ${error.message}` }, { status: 500 });
  }

  const admins = await Promise.all(
    (roles as AdminRoleRow[]).map(async (role) => {
      const { data: userData } = await authorization.adminClient.auth.admin.getUserById(role.user_id);
      return {
        id: role.id,
        userId: role.user_id,
        email: userData.user?.email ?? null,
        active: role.active,
        grantedBy: role.granted_by,
        createdAt: role.created_at,
        updatedAt: role.updated_at,
      };
    }),
  );

  return Response.json({ admins, currentUserId: authorization.user.id });
}

export async function POST(request: Request) {
  const authorization = await authorizeScheduleAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "No se pudo leer la solicitud." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return Response.json({ error: "Escribe el correo de la cuenta que recibirá permisos de administrador." }, { status: 400 });
  }

  let targetUser;
  try {
    targetUser = await findAuthUserByEmail(authorization.adminClient, email);
  } catch (error: unknown) {
    return Response.json({
      error: `No se pudo buscar la cuenta: ${error instanceof Error ? error.message : "error desconocido"}`,
    }, { status: 500 });
  }

  if (!targetUser) {
    return Response.json({ error: "No encontramos una cuenta registrada con ese correo." }, { status: 404 });
  }

  if (!targetUser.email_confirmed_at) {
    return Response.json({ error: "La cuenta existe pero aún no ha confirmado su correo." }, { status: 409 });
  }

  const { error } = await authorization.adminClient
    .from("user_roles")
    .upsert(
      {
        user_id: targetUser.id,
        role: "admin",
        active: true,
        granted_by: authorization.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role" },
    );

  if (error) {
    return Response.json({ error: `No se pudo otorgar el rol de administrador: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, userId: targetUser.id, email: targetUser.email ?? email });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeScheduleAdmin(request);
  if (!authorization.authorized) return authorization.response;

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ error: "Falta el usuario a revocar." }, { status: 400 });
  }

  if (userId === authorization.user.id) {
    return Response.json({ error: "No puedes quitarte tu propio acceso de administrador." }, { status: 400 });
  }

  const { error } = await authorization.adminClient
    .from("user_roles")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", "admin");

  if (error) {
    return Response.json({ error: `No se pudo revocar el acceso: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
