import { randomUUID } from "node:crypto";
import { authorizeScheduleAdmin } from "@/lib/schedule-admin";
import { parseSchedulePdf } from "@/lib/schedule-parser";
import { getSafePdfFilename, getSafeStorageFolder, readSchedulePdf } from "@/lib/schedule-upload";

export async function POST(request: Request) {
  const authorization = await authorizeScheduleAdmin(request);
  if (!authorization.authorized) return authorization.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "No se pudo leer el archivo enviado." }, { status: 400 });
  }
  if (formData.get("confirmed") !== "true") {
    return Response.json({ error: "Confirma la vista previa antes de publicar." }, { status: 400 });
  }

  let upload;
  try {
    upload = await readSchedulePdf(formData);
  } catch {
    return Response.json({ error: "No se pudo leer el PDF seleccionado." }, { status: 400 });
  }
  if ("error" in upload) return Response.json({ error: upload.error }, { status: upload.status });

  let schedule;
  try {
    schedule = await parseSchedulePdf(upload.bytes);
  } catch (error: unknown) {
    return Response.json({
      error: error instanceof Error ? error.message : "No se pudo interpretar el PDF.",
    }, { status: 422 });
  }

  const { data: bucket, error: bucketError } = await authorization.adminClient.storage.getBucket("schedules");
  if (bucketError || !bucket) {
    return Response.json({ error: "No existe el bucket schedules en Supabase Storage." }, { status: 409 });
  }
  if (bucket.public) {
    return Response.json({ error: "El bucket schedules debe ser privado antes de subir horarios." }, { status: 409 });
  }

  const { data: existingSchedule, error: existingError } = await authorization.adminClient
    .from("schedules")
    .select("id, storage_path")
    .eq("branch_name", schedule.branchName)
    .eq("week_start_date", schedule.weekStartDate)
    .maybeSingle();
  if (existingError) {
    return Response.json({
      error: `No se pudo comprobar si esa semana ya estaba publicada: ${existingError.message}`,
    }, { status: 500 });
  }
  if (existingSchedule && formData.get("replaceExisting") !== "true") {
    return Response.json({
      error: "Esa semana ya existe. Vuelve a revisar la vista previa y confirma que quieres reemplazarla.",
      alreadyPublished: true,
    }, { status: 409 });
  }

  const safeFilename = getSafePdfFilename(upload.file.name);
  const folder = getSafeStorageFolder(schedule.branchName);
  const storagePath = `${folder}/${schedule.weekStartDate}/${randomUUID()}_${safeFilename}`;
  const { error: storageError } = await authorization.adminClient.storage
    .from("schedules")
    .upload(storagePath, Buffer.from(upload.bytes), { contentType: "application/pdf", upsert: false });
  if (storageError) {
    return Response.json({ error: `No se pudo subir el PDF a Storage: ${storageError.message}` }, { status: 502 });
  }

  const { error: publishError } = await authorization.adminClient.rpc("publish_schedule", {
    p_branch_name: schedule.branchName,
    p_week_start_date: schedule.weekStartDate,
    p_week_end_date: schedule.weekEndDate,
    p_original_filename: safeFilename,
    p_storage_path: storagePath,
    p_uploaded_by: authorization.user.id,
    p_employees: schedule.employees.map((employee) => ({
      full_name: employee.fullName,
      role: null,
      shifts: employee.shifts.map((shift) => ({
        work_date: shift.workDate,
        start_time: shift.startTime,
        end_time: shift.endTime,
        is_day_off: shift.isDayOff,
        day_label: shift.dayLabel,
      })),
    })),
  });

  if (publishError) {
    const { error: cleanupError } = await authorization.adminClient.storage.from("schedules").remove([storagePath]);
    return Response.json({
      error: `El PDF se recibió, pero no se publicaron los turnos: ${publishError.message}`,
      ...(cleanupError ? { cleanupWarning: "No se pudo quitar el archivo temporal de Storage." } : {}),
    }, { status: 500 });
  }

  let cleanupWarning: string | undefined;
  if (existingSchedule?.storage_path) {
    const { error: removeError } = await authorization.adminClient.storage
      .from("schedules")
      .remove([existingSchedule.storage_path]);
    if (removeError) cleanupWarning = "La semana se reemplazó, pero quedó una copia anterior del PDF en Storage.";
  }

  return Response.json({
    ok: true,
    employeeCount: schedule.employees.length,
    weekStartDate: schedule.weekStartDate,
    weekEndDate: schedule.weekEndDate,
    ...(cleanupWarning ? { cleanupWarning } : {}),
  });
}
