export const MAX_SCHEDULE_PDF_BYTES = 4 * 1024 * 1024;

export async function readSchedulePdf(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Selecciona un archivo PDF.", status: 400 } as const;
  }
  if (file.size === 0 || file.size > MAX_SCHEDULE_PDF_BYTES) {
    return { error: "El PDF debe pesar entre 1 byte y 4 MB.", status: 413 } as const;
  }
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".pdf")) {
    return { error: "El archivo debe tener extensión .pdf.", status: 415 } as const;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return { error: "El archivo seleccionado no es un PDF válido.", status: 415 } as const;
  }
  return { file, bytes } as const;
}

export function getSafePdfFilename(filename: string) {
  const safeName = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return safeName.toLocaleLowerCase("en-US").endsWith(".pdf") ? safeName : "schedule.pdf";
}

export function getSafeStorageFolder(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "schedule";
}
