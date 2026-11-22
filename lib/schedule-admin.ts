import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type AuthorizationResult =
  | { authorized: true; user: User; adminClient: SupabaseClient }
  | { authorized: false; response: Response };

export async function authorizeScheduleAdmin(request: Request): Promise<AuthorizationResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    return {
      authorized: false,
      response: Response.json(
        { error: "Falta configurar Supabase en el entorno del servidor (URL, clave publicable y clave secreta de servicio)." },
        { status: 503 },
      ),
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1];
  if (!token) {
    return { authorized: false, response: Response.json({ error: "Inicia sesión para continuar." }, { status: 401 }) };
  }

  const authClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { authorized: false, response: Response.json({ error: "La sesión no es válida o expiró. Inicia sesión de nuevo." }, { status: 401 }) };
  }

  if (!data.user.email_confirmed_at) {
    return { authorized: false, response: Response.json({ error: "Confirma tu correo antes de cargar horarios." }, { status: 403 }) };
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();

  if (roleError) {
    return {
      authorized: false,
      response: Response.json(
        { error: "No se pudo verificar los permisos de administrador. Ejecuta la migración de roles en Supabase e intenta de nuevo." },
        { status: 503 },
      ),
    };
  }

  if (!adminRole) {
    return { authorized: false, response: Response.json({ error: "Tu cuenta no está autorizada para publicar horarios." }, { status: 403 }) };
  }

  return { authorized: true, user: data.user, adminClient };
}
