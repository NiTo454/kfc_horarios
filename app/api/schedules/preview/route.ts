import { authorizeScheduleAdmin } from "@/lib/schedule-admin";
import { parseSchedulePdf } from "@/lib/schedule-parser";
import { readSchedulePdf } from "@/lib/schedule-upload";

export async function POST(request: Request) {
  const authorization = await authorizeScheduleAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }

  let upload;
  try {
    upload = await readSchedulePdf(formData);
  } catch {
    return Response.json({ error: "No se pudo leer el PDF seleccionado." }, { status: 400 });
  }
  if ("error" in upload) return Response.json({ error: upload.error }, { status: upload.status });

  const { data: bucket, error: bucketError } = await authorization.adminClient.storage.getBucket("schedules");
  if (bucketError || !bucket) {
    return Response.json({ error: "No existe el bucket schedules en Supabase Storage." }, { status: 409 });
  }
  if (bucket.public) {
    return Response.json({ error: "El bucket schedules debe ser privado antes de subir horarios." }, { status: 409 });
  }

  let schedule;
  try {
    schedule = await parseSchedulePdf(upload.bytes);
  } catch (error: unknown) {
    return Response.json({
      error: error instanceof Error ? error.message : "No se pudo interpretar el PDF.",
    }, { status: 422 });
  }

  const { data: existingSchedule, error: existingError } = await authorization.adminClient
    .from("schedules")
    .select("id")
    .eq("branch_name", schedule.branchName)
    .eq("week_start_date", schedule.weekStartDate)
    .maybeSingle();
  if (existingError) {
    return Response.json({
      error: `No se pudo comprobar si esa semana ya estaba publicada: ${existingError.message}`,
    }, { status: 500 });
  }

  return Response.json({
    preview: {
      ...schedule,
      alreadyPublished: Boolean(existingSchedule),
      sourceFilename: upload.file.name,
    },
  });
}
