import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ParsedShift = {
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
  dayLabel: string | null;
};

export type ParsedEmployee = {
  fullName: string;
  shifts: ParsedShift[];
};

export type ParsedSchedule = {
  branchName: string;
  weekStartDate: string;
  weekEndDate: string;
  dates: string[];
  employees: ParsedEmployee[];
};

const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g;
const shiftTokenPattern = /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}(?:\s*\([^)]+\))?|[A-ZÁÉÍÓÚÑ]{2,12}/g;
const timeRangePattern = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/;

function toIsoDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("El PDF contiene una fecha inválida.");
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractLines(items: unknown[]) {
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("str" in item) || typeof item.str !== "string") continue;
    current += item.str;
    if ("hasEOL" in item && item.hasEOL === true) {
      if (current.trim()) lines.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function parseShift(token: string, workDate: string): ParsedShift {
  const timeRange = timeRangePattern.exec(token);
  if (timeRange) {
    const startHour = Number(timeRange[1]);
    const startMinute = Number(timeRange[2]);
    const endHour = Number(timeRange[3]);
    const endMinute = Number(timeRange[4]);
    if (startHour > 23 || endHour > 24 || startMinute > 59 || endMinute > 59 || (endHour === 24 && endMinute !== 0)) {
      throw new Error("El PDF contiene una hora inválida.");
    }
    return {
      workDate,
      startTime: `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`,
      endTime: `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
      isDayOff: false,
      dayLabel: null,
    };
  }

  const code = token.toLocaleUpperCase("es-MX");
  return {
    workDate,
    startTime: null,
    endTime: null,
    isDayOff: true,
    dayLabel: code === "LIB" ? "Descanso" : code === "VAC" ? "Vacaciones" : code,
  };
}

export async function parseSchedulePdf(bytes: Uint8Array): Promise<ParsedSchedule> {
  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > 30) {
      throw new Error("El PDF tiene demasiadas páginas para procesarlo como horario semanal.");
    }

    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(...extractLines(content.items));
      if (lines.join("\n").length > 500_000) {
        throw new Error("El texto del PDF supera el límite permitido.");
      }
    }
    if (lines.length === 0) {
      throw new Error("Este PDF no contiene texto seleccionable. Los horarios escaneados requieren OCR y no se publicaron.");
    }

    const periodLine = lines.find((line) => /^Periodo\s*:/i.test(line));
    const periodDates = periodLine?.match(datePattern) ?? [];
    if (periodDates.length !== 2) {
      throw new Error("No encontré el rango de fechas del horario. Verifica que sea un PDF de texto con el formato de horario por trabajador.");
    }

    const headerIndex = lines.findIndex((line) => /^TRABAJADOR\b/i.test(line) && (line.match(datePattern) ?? []).length > 0);
    if (headerIndex < 0) {
      throw new Error("No reconocí la tabla de trabajadores y fechas de este PDF.");
    }

    const dates = (lines[headerIndex].match(datePattern) ?? []).map(toIsoDate);
    const weekStartDate = toIsoDate(periodDates[0]);
    const weekEndDate = toIsoDate(periodDates[1]);
    const startTimestamp = Date.parse(`${weekStartDate}T00:00:00Z`);
    const endTimestamp = Date.parse(`${weekEndDate}T00:00:00Z`);
    const expectedDays = Math.floor((endTimestamp - startTimestamp) / 86_400_000) + 1;
    if (dates.length < 1 || dates.length > 14 || dates.length !== expectedDays || dates[0] !== weekStartDate || dates[dates.length - 1] !== weekEndDate) {
      throw new Error("Las fechas de la tabla no coinciden con el periodo indicado en el PDF.");
    }
    for (let index = 0; index < dates.length; index++) {
      const expectedDate = new Date(startTimestamp + index * 86_400_000).toISOString().slice(0, 10);
      if (dates[index] !== expectedDate) {
        throw new Error("Las fechas de la tabla no están en orden consecutivo.");
      }
    }

    const centerLine = lines.find((line) => /^Centro\s*:/i.test(line));
    const branchName = centerLine?.replace(/^Centro\s*:/i, "").trim() || "Tizayuca";
    const employees: ParsedEmployee[] = [];

    for (const line of lines.slice(headerIndex + 1)) {
      if (!/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}|\b(?:LIB|VAC)\b/i.test(line)) continue;
      const row = /^(.+?)\s+\([A-Z0-9]{2,8}\)\s+(.+)$/.exec(line);
      if (!row) {
        throw new Error("Encontré una fila de horario que no pude reconocer. No se guardó ningún dato.");
      }

      const fullName = row[1].trim().replace(/\s+/g, " ");
      const tokens = row[2].match(shiftTokenPattern) ?? [];
      if (!fullName || fullName.length > 120 || tokens.length !== dates.length) {
        throw new Error("Una fila del PDF no contiene un turno para cada fecha. No se guardó ningún dato.");
      }

      employees.push({
        fullName,
        shifts: tokens.map((token, index) => parseShift(token, dates[index])),
      });
      if (employees.length > 300) {
        throw new Error("El PDF contiene demasiados trabajadores para una sola semana.");
      }
    }

    if (employees.length === 0) {
      throw new Error("No encontré trabajadores en el PDF. Verifica el archivo antes de volver a intentarlo.");
    }

    const seenNames = new Set<string>();
    for (const employee of employees) {
      const normalizedName = employee.fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
      if (seenNames.has(normalizedName)) {
        throw new Error("El PDF tiene trabajadores repetidos. No se guardó ningún dato.");
      }
      seenNames.add(normalizedName);
    }

    return {
      branchName,
      weekStartDate,
      weekEndDate,
      dates,
      employees,
    };
  } finally {
    await loadingTask.destroy();
  }
}
