"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Lottie } from "lottie-react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import scheduleAnimation from "@/lib/schedule-animation.json";
import type { ParsedSchedule } from "@/lib/schedule-parser";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type IconName = "grid" | "users" | "clock" | "settings" | "upload" | "chevron" | "search" | "calendar" | "file" | "check" | "arrow" | "close" | "user" | "lock" | "mail" | "eye" | "eyeOff";
type Employee = {
  id: string;
  name: string;
  role: string;
  initials: string;
  shifts: Record<string, EmployeeShift>;
};
type EmployeeShift = { startTime: string | null; endTime: string | null; isDayOff: boolean; dayLabel: string | null };
type Schedule = {
  id: string;
  branch_name: string;
  week_start_date: string;
  week_end_date: string;
  original_filename: string;
  created_at: string;
};
type ScheduleDay = { key: string; weekday: string; dayNumber: string };
type SchedulePreview = ParsedSchedule & { alreadyPublished: boolean; sourceFilename: string };
type ScheduleRequestResponse = {
  error?: string;
  preview?: SchedulePreview;
  alreadyPublished?: boolean;
  employeeCount?: number;
  weekStartDate?: string;
  weekEndDate?: string;
  cleanupWarning?: string;
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="5" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.3 3.5-.8" /></>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function getScheduleDays(schedule: Schedule | null): ScheduleDay[] {
  if (!schedule) return [];
  const [startYear, startMonth, startDay] = schedule.week_start_date.split("-").map(Number);
  const [endYear, endMonth, endDay] = schedule.week_end_date.split("-").map(Number);
  const current = new Date(startYear, startMonth - 1, startDay, 12);
  const end = new Date(endYear, endMonth - 1, endDay, 12);
  const result: ScheduleDay[] = [];

  while (current <= end) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    const weekday = current.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
    result.push({ key, weekday: weekday[0].toLocaleUpperCase("es-MX") + weekday.slice(1), dayNumber: String(current.getDate()) });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function formatScheduleRange(schedule: Schedule | null) {
  if (!schedule) return "Sin semana publicada";
  return formatDateRange(schedule.week_start_date, schedule.week_end_date);
}

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("es-MX", options)} – ${end.toLocaleDateString("es-MX", options)}`;
}

function formatPreviewDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const weekday = date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  return `${weekday[0].toLocaleUpperCase("es-MX") + weekday.slice(1)} ${date.getDate()}`;
}

function formatShiftTime(shift: EmployeeShift) {
  return `${shift.startTime?.slice(0, 5) ?? "—"} – ${shift.endTime?.slice(0, 5) ?? "—"}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

function subscribeToSavedName(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("turno-profile-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("turno-profile-change", onChange);
  };
}

function getSavedName() {
  return window.localStorage.getItem("turno.employeeName");
}

type AuthMode = "sign-in" | "sign-up";

type AuthCredentials = {
  email: string;
  password: string;
  fullName: string;
};

function AuthScreen({
  mode,
  loading,
  busy,
  configured,
  error,
  notice,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  loading: boolean;
  busy: boolean;
  configured: boolean;
  error: string;
  notice: string;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (credentials: AuthCredentials) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "sign-up" && password !== confirmPassword) {
      return;
    }
    await onSubmit({ email: email.trim(), password, fullName: fullName.trim() });
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Link className="auth-brand" href="/" aria-label="Turno, inicio"><span className="brand-mark">T</span><span><strong>turno</strong><small>HORARIOS DE EQUIPO</small></span></Link>
        <div className="auth-showcase-copy">
          <span className="auth-kicker"><span /> TU SEMANA, EN ORDEN</span>
          <h1>Tu horario,<br />siempre a la mano.</h1>
          <p>Entra para revisar tus turnos, tu agenda y los horarios del equipo desde el celular o la computadora.</p>
        </div>
        <div className="auth-animation"><Lottie src={scheduleAnimation} loop autoplay aria-hidden="true" /></div>
        <div className="auth-feature"><span className="auth-feature-icon"><Icon name="calendar" size={17} /></span><span><strong>Todo tu equipo, una semana a la vez</strong><small>Sin tener que buscar entre archivos PDF.</small></span><Icon name="arrow" size={16} /></div>
        <div className="auth-showcase-footer"><span>Simple, claro y siempre actualizado.</span><span>Acceso para el equipo</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="auth-mobile-brand"><span className="brand-mark">T</span><strong>turno</strong></span>
          <div className="auth-card-heading">
            <span className="auth-card-eyebrow">{mode === "sign-up" ? "ÚNETE AL EQUIPO" : "BIENVENIDO DE NUEVO"}</span>
            <h2>{mode === "sign-up" ? "Crea tu cuenta" : "Inicia sesión"}</h2>
            <p>{mode === "sign-up" ? "Regístrate con tu correo para consultar los horarios." : "Entra para ver tu agenda semanal."}</p>
          </div>

          <div className="auth-mode-switch" role="tablist" aria-label="Tipo de acceso">
            <button type="button" role="tab" aria-selected={mode === "sign-in"} className={mode === "sign-in" ? "selected" : ""} onClick={() => onModeChange("sign-in")}>Iniciar sesión</button>
            <button type="button" role="tab" aria-selected={mode === "sign-up"} className={mode === "sign-up" ? "selected" : ""} onClick={() => onModeChange("sign-up")}>Crear cuenta</button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "sign-up" && <label className="auth-field"><span>Nombre completo</span><span className="auth-input-wrap"><Icon name="user" size={17} /><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Como aparece en tu horario" required /></span></label>}
            <label className="auth-field"><span>Correo electrónico</span><span className="auth-input-wrap"><Icon name="mail" size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="nombre@correo.com" required /></span></label>
            <label className="auth-field"><span>Contraseña</span><span className="auth-input-wrap"><Icon name="lock" size={17} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} placeholder={mode === "sign-up" ? "Mínimo 8 caracteres" : "Tu contraseña"} required /><button className="show-password" type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShowPassword(!showPassword)}><Icon name={showPassword ? "eyeOff" : "eye"} size={16} /></button></span></label>
            {mode === "sign-up" && <label className="auth-field"><span>Confirma tu contraseña</span><span className="auth-input-wrap"><Icon name="lock" size={17} /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} placeholder="Vuelve a escribirla" required /></span>{confirmPassword && password !== confirmPassword && <small className="auth-field-error">Las contraseñas no coinciden.</small>}</label>}

            {error && <p className="auth-feedback auth-feedback-error" role="alert">{error}</p>}
            {notice && <p className="auth-feedback auth-feedback-success" role="status">{notice}</p>}
            {!configured && <p className="auth-feedback auth-feedback-error" role="alert">Falta configurar Supabase en el archivo .env de la raíz del proyecto.</p>}
            {loading && <p className="auth-loading-note" role="status"><span className="auth-loading-dot" /> Revisando tu sesión…</p>}
            <button type="submit" className="auth-submit" disabled={!configured || loading || busy || (mode === "sign-up" && password !== confirmPassword)}>{busy ? <><span className="button-spinner" /> Procesando…</> : mode === "sign-up" ? "Crear cuenta" : "Entrar a mi horario"}<Icon name="arrow" size={16} /></button>
          </form>

          <p className="auth-privacy"><Icon name="lock" size={13} /> Tu cuenta protege el acceso a los horarios del equipo.</p>
          {mode === "sign-up" && <p className="auth-confirm-note">Puede que Supabase te pida confirmar el correo antes de iniciar sesión.</p>}
        </div>
        <footer className="auth-panel-footer">¿Problemas para entrar? Consulta con el administrador de tu sucursal.</footer>
      </section>
    </main>
  );
}

export default function Home() {
  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supabase = useMemo(() => hasSupabaseConfig ? getSupabaseBrowserClient() : null, [hasSupabaseConfig]);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<SchedulePreview | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [query, setQuery] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameMessage, setNameMessage] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [otherEmployee, setOtherEmployee] = useState<Employee | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const savedName = useSyncExternalStore(subscribeToSavedName, getSavedName, () => null);
  const employee = savedName ? employees.find((person) => normalizeName(person.name) === normalizeName(savedName)) ?? null : null;
  const days = useMemo(() => getScheduleDays(schedule), [schedule]);
  const sessionUserId = session?.user.id;

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoading(false);
      if (nextSession) {
        setAuthError("");
        setAuthNotice("");
        const profileName = nextSession.user.user_metadata.full_name;
        if (typeof profileName === "string" && profileName.trim()) {
          setNameInput((currentName) => currentName || profileName.trim());
        }
      } else {
        setSchedule(null);
        setEmployees([]);
        setScheduleError("");
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : "No se pudo revisar la sesión.");
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !sessionUserId) return;
    const client = supabase;

    let active = true;
    async function loadScheduleData() {
      setScheduleLoading(true);
      setScheduleError("");
      setSchedule(null);
      setEmployees([]);
      try {
        const [scheduleResult, employeeResult] = await Promise.all([
          client.from("schedules")
            .select("id, branch_name, week_start_date, week_end_date, original_filename, created_at")
            .order("week_start_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          client.from("employees").select("id, full_name, role").order("full_name"),
        ]);
        if (scheduleResult.error) throw scheduleResult.error;
        if (employeeResult.error) throw employeeResult.error;
        if (!active) return;

        const latestSchedule = scheduleResult.data as Schedule | null;
        const employeeRows = employeeResult.data ?? [];
        let shiftRows: { employee_id: string; work_date: string; start_time: string | null; end_time: string | null; is_day_off: boolean; day_label: string | null }[] = [];

        if (latestSchedule) {
          const shiftResult = await           client.from("shifts")
            .select("employee_id, work_date, start_time, end_time, is_day_off, day_label")
            .eq("schedule_id", latestSchedule.id)
            .order("work_date");
          if (shiftResult.error) throw shiftResult.error;
          shiftRows = shiftResult.data ?? [];
        }

        if (!active) return;
        const shiftsByEmployee = new Map<string, Record<string, EmployeeShift>>();
        for (const shift of shiftRows) {
          const shifts = shiftsByEmployee.get(shift.employee_id) ?? {};
          shifts[shift.work_date] = {
            startTime: shift.start_time,
            endTime: shift.end_time,
            isDayOff: shift.is_day_off,
            dayLabel: shift.day_label,
          };
          shiftsByEmployee.set(shift.employee_id, shifts);
        }

        setSchedule(latestSchedule);
        setEmployees(employeeRows.map((person) => ({
          id: person.id,
          name: person.full_name,
          role: person.role || "Personal",
          initials: getInitials(person.full_name),
          shifts: shiftsByEmployee.get(person.id) ?? {},
        })));
      } catch (error: unknown) {
        if (!active) return;
        setScheduleError(error instanceof Error ? error.message : "No se pudieron cargar los horarios desde Supabase.");
      } finally {
        if (active) setScheduleLoading(false);
      }
    }

    void loadScheduleData();
    return () => {
      active = false;
    };
  }, [scheduleRefresh, sessionUserId, supabase]);

  const filteredEmployees = employees.filter((employee) =>
    normalizeName(`${employee.name} ${employee.role}`).includes(normalizeName(query)),
  );

  function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredName = nameInput.trim().replace(/\s+/g, " ");
    if (!enteredName) {
      setNameMessage("Escribe tu nombre para continuar.");
      return;
    }
    const matchingEmployee = employees.find((person) => normalizeName(person.name) === normalizeName(enteredName));
    if (!matchingEmployee) {
      setNameMessage(scheduleError || (employees.length
        ? "No encontramos ese nombre en el personal registrado. Revisa cómo aparece escrito en el horario."
        : "Todavía no hay personal ni horarios publicados en Supabase."));
      return;
    }
    window.localStorage.setItem("turno.employeeName", matchingEmployee.name);
    window.dispatchEvent(new Event("turno-profile-change"));
    setNameInput(matchingEmployee.name);
    setNameMessage("");
  }

  function handleChangePerson() {
    window.localStorage.removeItem("turno.employeeName");
    window.dispatchEvent(new Event("turno-profile-change"));
    setNameInput("");
    setNameMessage("");
    setOtherEmployee(null);
    setLookupInput("");
    setLookupMessage("");
  }

  function handleLookupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const matchingEmployee = employees.find((person) => normalizeName(person.name) === normalizeName(lookupInput));
    if (!matchingEmployee) {
      setOtherEmployee(null);
      setLookupMessage(scheduleError || (employees.length
        ? "No encontramos a esa persona en el personal registrado."
        : "Todavía no hay personal ni horarios publicados."));
      return;
    }
    setOtherEmployee(matchingEmployee);
    setLookupMessage("");
  }

  async function handleAuthSubmit(credentials: AuthCredentials) {
    if (!supabase) {
      setAuthError("Configura las variables de Supabase para continuar.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");

    try {
      if (authMode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
          options: {
            emailRedirectTo: new URL("/", window.location.origin).toString(),
            data: { full_name: credentials.fullName },
          },
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        if (data.session) {
          setSession(data.session);
        } else {
          setAuthNotice("Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.");
          setAuthMode("sign-in");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        setSession(data.session);
      }
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "No fue posible conectar con Supabase. Intenta de nuevo.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError(error.message);
        return;
      }
      setSession(null);
      setSchedule(null);
      setEmployees([]);
      setScheduleError("");
      setNameInput("");
      setOtherEmployee(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "No se pudo cerrar la sesión.");
    }
  }

  function closeUploader() {
    setShowUploader(false);
    setSelectedPdf(null);
    setUploadPreview(null);
    setUploadMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function handlePdfSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedPdf(file);
    setUploadPreview(null);
    setUploadMessage("");
    if (file && !file.name.toLocaleLowerCase("en-US").endsWith(".pdf")) {
      setSelectedPdf(null);
      setUploadMessage("El archivo debe ser un PDF.");
      event.target.value = "";
    } else if (file && file.size > 4 * 1024 * 1024) {
      setSelectedPdf(null);
      setUploadMessage("El PDF no puede pesar más de 4 MB.");
      event.target.value = "";
    }
  }

  async function sendScheduleFile(path: string, fields: Record<string, string> = {}) {
    if (!supabase || !selectedPdf) throw new Error("Selecciona un PDF e inicia sesión para continuar.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");

    const formData = new FormData();
    formData.set("file", selectedPdf);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    const response = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      body: formData,
    });
    const result = await response.json() as ScheduleRequestResponse;
    return { response, result };
  }

  async function handlePreviewSchedule() {
    if (!selectedPdf) {
      setUploadMessage("Selecciona el PDF semanal primero.");
      return;
    }
    setUploading(true);
    setUploadMessage("");
    try {
      const { response, result } = await sendScheduleFile("/api/schedules/preview");
      if (!response.ok || !result.preview) throw new Error(result.error ?? "No se pudo analizar el PDF.");
      setUploadPreview(result.preview);
    } catch (error: unknown) {
      setUploadMessage(error instanceof Error ? error.message : "No se pudo preparar la vista previa.");
    } finally {
      setUploading(false);
    }
  }

  async function handlePublishSchedule() {
    if (!selectedPdf || !uploadPreview) return;
    setUploading(true);
    setUploadMessage("");
    try {
      const { response, result } = await sendScheduleFile("/api/schedules/publish", {
        confirmed: "true",
        replaceExisting: uploadPreview.alreadyPublished ? "true" : "false",
      });
      if (!response.ok) {
        if (result.alreadyPublished) {
          setUploadPreview((current) => current ? { ...current, alreadyPublished: true } : current);
        }
        throw new Error(result.error ?? "No se pudo publicar el horario.");
      }

      setUploadNotice(
        `Horario publicado: ${result.employeeCount ?? 0} personas, ${formatDateRange(result.weekStartDate ?? "", result.weekEndDate ?? "")}.`,
      );
      if (result.cleanupWarning) setUploadNotice((message) => `${message} ${result.cleanupWarning}`);
      setScheduleRefresh((current) => current + 1);
      closeUploader();
    } catch (error: unknown) {
      setUploadMessage(error instanceof Error ? error.message : "No se pudo publicar el horario.");
    } finally {
      setUploading(false);
    }
  }

  function renderNameForm(className: string) {
    return (
      <form className={`name-form ${className}`} onSubmit={handleNameSubmit}>
        <label htmlFor={`${className}-name`}>Escribe tu nombre tal como aparece en el horario</label>
        <div className="name-form-controls">
          <div className="name-input-wrap"><Icon name="user" size={17} /><input id={`${className}-name`} value={nameInput} onChange={(event) => { setNameInput(event.target.value); setNameMessage(""); }} placeholder="Como aparece en el horario" autoComplete="name" required /></div>
          <button type="submit" className="primary-button" disabled={scheduleLoading}>Ver mi horario</button>
        </div>
        {nameMessage && <span className="form-message" role="alert">{nameMessage}</span>}
        <span className="form-hint">{scheduleLoading ? "Cargando personal desde Supabase…" : "El nombre debe coincidir con una persona registrada en los horarios."}</span>
      </form>
    );
  }

  function renderAgenda(person: Employee, isLookup = false) {
    return (
      <div className={`agenda-list ${isLookup ? "lookup-agenda" : ""}`}>
        {days.map((day) => {
          const shift = person.shifts[day.key];
          const isDayOff = shift?.isDayOff ?? false;
          const label = !shift ? "Sin turno" : isDayOff ? shift.dayLabel ?? "Descanso" : formatShiftTime(shift);
          return <article className={`agenda-day ${isDayOff ? "agenda-day-off" : ""}`} key={`${person.id}-agenda-${day.key}`}>
            <div className="agenda-date"><span>{day.weekday}</span><strong>{day.dayNumber}</strong></div>
            <div className="agenda-event"><strong>{isDayOff ? label : shift ? "Turno asignado" : "Sin turno asignado"}</strong><span>{label}</span></div>
            <span className={`agenda-status ${isDayOff ? "rest-status" : ""}`}>{isDayOff ? label : shift ? "Turno" : "Pendiente"}</span>
          </article>
        })}
      </div>
    );
  }

  if (!hasSupabaseConfig) {
    return <AuthScreen mode={authMode} loading={false} busy={false} configured={false} error="" notice="" onModeChange={setAuthMode} onSubmit={handleAuthSubmit} />;
  }

  if (!session) {
    return <AuthScreen mode={authMode} loading={authLoading} busy={authBusy} configured error={authError} notice={authNotice} onModeChange={(mode) => { setAuthMode(mode); setAuthError(""); setAuthNotice(""); }} onSubmit={handleAuthSubmit} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Turno, inicio">
          <span className="brand-mark">T</span>
          <span className="brand-copy"><strong>turno</strong><small>CONTROL DE HORARIOS</small></span>
        </a>

        <div className="nav-caption">MENÚ PRINCIPAL</div>
        <nav className="sidebar-nav" aria-label="Menú principal">
          <a className="nav-link active" href="#horario"><Icon name="grid" /> Horario semanal</a>
          <a className="nav-link" href="#personal"><Icon name="users" /> Personal <span className="nav-count">{employees.length}</span></a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><Icon name="calendar" size={17} /></span>
            <strong>¿Un horario nuevo?</strong>
            <p>La carga y extracción de PDF todavía está pendiente.</p>
            <button type="button" className="help-action" onClick={() => { setShowUploader(true); setUploadNotice(""); }}>Cargar PDF <Icon name="arrow" size={14} /></button>
          </div>
          <a className="nav-link settings-link" href="#configuracion"><Icon name="settings" /> Configuración</a>
          <div className="profile">
            <div className="profile-avatar">{getInitials(session.user.email ?? "U")}</div>
            <div className="profile-copy"><strong>{session.user.email}</strong><small>Cuenta registrada</small></div>
            <button className="profile-menu" aria-label="Cerrar sesión" type="button" onClick={() => void handleSignOut()}>Salir</button>
          </div>
        </div>
      </aside>

      <section className="main-panel" id="horario">
        <header className="topbar">
          <div className="breadcrumb"><span>Panel</span><Icon name="chevron" size={14} /><strong>Horario semanal</strong></div>
          <div className="topbar-right">
            <span className="store-status"><span className="status-dot" /> {session.user.email}</span>
            <div className="top-avatar">{getInitials(session.user.email ?? "U")}</div>
          </div>
        </header>

        <div className="content desktop-content">
          {authError && <p className="auth-feedback auth-feedback-error" role="alert">{authError}</p>}
          <div className="intro-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> SEMANA ACTUAL</div>
              <h1>Horario semanal</h1>
              <p className="subtitle">Consulta los turnos de tu equipo en un solo lugar.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => { setShowUploader(true); setUploadNotice(""); }}><Icon name="upload" size={17} /> Cargar horario PDF</button>
          </div>

          {scheduleError && <p className="auth-feedback auth-feedback-error" role="alert">No se pudieron cargar los datos de Supabase: {scheduleError}</p>}
          {uploadNotice && <p className="auth-feedback auth-feedback-success" role="status">{uploadNotice}</p>}

          <section className="my-schedule-card">
            <div className="personal-card-heading"><span className="personal-icon"><Icon name="user" size={17} /></span><div><h2>Mi horario</h2><p>Escribe tu nombre para encontrar tus turnos.</p></div></div>
            {savedName ? <div className="saved-profile"><div className="person-avatar">{employee?.initials ?? getInitials(savedName)}</div><div className="person-copy"><strong>{savedName}</strong><span>{employee?.role ?? "Sin registro de personal"} · {formatScheduleRange(schedule)}</span></div><button className="change-person-button" type="button" onClick={handleChangePerson}>Cambiar nombre</button></div> : renderNameForm("desktop-name-form")}
            {savedName && <div className="desktop-personal-agenda">{scheduleLoading ? <p className="no-schedule-message">Cargando horario…</p> : employee && schedule ? renderAgenda(employee) : <p className="no-schedule-message">{schedule ? `No hay un horario registrado para ${savedName} en esta semana.` : "Todavía no hay una semana publicada en Supabase."}</p>}</div>}
            <div className="privacy-hint"><Icon name="lock" size={13} /> La selección de nombre se guarda en este navegador; los turnos se consultan desde Supabase.</div>
          </section>

          <section className="summary-grid" aria-label="Resumen de la semana">
            <article className="summary-card">
              <div className="summary-top"><span className="summary-label">SEMANA DEL</span><span className="summary-icon calendar-bg"><Icon name="calendar" size={18} /></span></div>
              <strong className="summary-value">{formatScheduleRange(schedule)}</strong>
              <span className="summary-note">{schedule ? <><span className="live-dot" /> Horario publicado</> : "Sin semana publicada"}</span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-label">PERSONAL</span><span className="summary-icon people-bg"><Icon name="users" size={18} /></span></div>
              <strong className="summary-value">{employees.length} <small>personas</small></strong>
              <span className="summary-note">Personal registrado</span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-label">TURNOS ASIGNADOS</span><span className="summary-icon shift-bg"><Icon name="clock" size={18} /></span></div>
              <strong className="summary-value">{employees.reduce((total, person) => total + Object.values(person.shifts).filter((shift) => !shift.isDayOff).length, 0)} <small>turnos</small></strong>
              <span className="summary-note">En la semana publicada</span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-label">ÚLTIMA ACTUALIZACIÓN</span><span className="summary-icon update-bg"><Icon name="check" size={18} /></span></div>
              <strong className="summary-value date-value">{formatDateTime(schedule?.created_at ?? null)}</strong>
              <span className="summary-note">{schedule?.original_filename ?? "Última actualización"}</span>
            </article>
          </section>

          <section className="schedule-card" id="personal">
            <div className="schedule-heading">
              <div>
                <h2>Turnos del equipo</h2>
                <p>{schedule ? `${formatScheduleRange(schedule)} · ${schedule.branch_name}` : "Todavía no hay una semana publicada"}</p>
              </div>
              <div className="schedule-actions">
                <label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona..." aria-label="Buscar persona" /></label>
                <span className="week-select"><Icon name="calendar" size={16} /><span>{schedule ? "Última semana" : "Sin semana"}</span></span>
              </div>
            </div>

            <div className="table-scroll">
              <table className="schedule-table">
                <thead><tr><th className="person-column">PERSONA</th>{days.map((day) => <th key={day.key}>{day.weekday}<span>{day.dayNumber}</span></th>)}</tr></thead>
                <tbody>
                  {scheduleLoading && <tr><td className="empty-row" colSpan={days.length + 1}>Cargando horarios desde Supabase…</td></tr>}
                  {!scheduleLoading && schedule && filteredEmployees.map((person) => (
                    <tr key={person.id}>
                      <td className="person-cell"><div className="person-avatar">{person.initials}</div><div className="person-copy"><strong>{person.name}</strong><span>{person.role}</span></div></td>
                      {days.map((day) => {
                        const shift = person.shifts[day.key];
                        const label = !shift ? "Sin turno" : shift.isDayOff ? shift.dayLabel ?? "Descanso" : formatShiftTime(shift);
                        return <td key={`${person.id}-${day.key}`}><span className={`shift-pill ${shift?.isDayOff ? "day-off" : ""}`}>{label}</span></td>;
                      })}
                    </tr>
                  ))}
                  {!scheduleLoading && filteredEmployees.length === 0 && <tr><td className="empty-row" colSpan={days.length + 1}>{query ? `No encontramos personas con “${query}”.` : schedule ? "No hay personas registradas para mostrar." : "No hay horarios publicados en Supabase."}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Mostrando <strong>{filteredEmployees.length}</strong> de {employees.length} personas</span><button type="button" className="view-all" onClick={() => setQuery("")}>Ver todo el equipo <Icon name="arrow" size={14} /></button></div>
          </section>

          <footer className="page-footer"><span>Los horarios se renuevan cada semana.</span><span>Consulta de datos desde Supabase</span></footer>
        </div>

        <div className="mobile-content">
          {authError && <p className="auth-feedback auth-feedback-error mobile-auth-error" role="alert">{authError}</p>}
          {scheduleError && <p className="auth-feedback auth-feedback-error mobile-auth-error" role="alert">No se pudieron cargar los datos de Supabase: {scheduleError}</p>}
          <header className="mobile-header">
            <a className="brand mobile-brand" href="#" aria-label="Turno, inicio"><span className="brand-mark">T</span><span className="brand-copy"><strong>turno</strong><small>MI HORARIO</small></span></a>
            <div className="mobile-header-actions">{savedName && <div className="mobile-user-avatar">{employee?.initials ?? getInitials(savedName)}</div>}<button type="button" className="mobile-signout" onClick={() => void handleSignOut()}>Salir</button></div>
          </header>
          <div className="mobile-page">
            <div className="eyebrow"><span className="eyebrow-dot" /> TU AGENDA SEMANAL</div>
            <h1>{savedName ? `Hola, ${savedName.split(" ")[0]}` : "Encuentra tu horario"}</h1>
            <p className="mobile-subtitle">Consulta tus turnos sin abrir el PDF.</p>

            {savedName ? (
              <>
                <section className="mobile-week-card">
                  <div className="mobile-week-top"><span className="summary-icon calendar-bg"><Icon name="calendar" size={17} /></span><span className="week-live">{schedule ? <><span className="live-dot" /> SEMANA PUBLICADA</> : "SIN SEMANA PUBLICADA"}</span></div>
                  <strong>{formatScheduleRange(schedule)}</strong>
                  <span>{schedule ? `${schedule.branch_name} · ${employee?.role ?? "Personal"}` : "Tu horario está por publicarse"}</span>
                </section>
                <section className="mobile-agenda-section" id="mobile-my-schedule">
                  <div className="mobile-section-heading"><div><h2>Mi agenda</h2><p>Turnos y descansos de la semana</p></div><button type="button" className="text-button" onClick={handleChangePerson}>Cambiar</button></div>
                  {scheduleLoading ? <p className="no-schedule-message">Cargando horario…</p> : employee && schedule ? renderAgenda(employee) : <p className="no-schedule-message">{schedule ? `No hay un horario registrado para ${savedName} en esta semana.` : "Todavía no hay una semana publicada en Supabase."}</p>}
                </section>
                <section className="mobile-search-card" id="mobile-other-search">
                  <span className="search-card-icon"><Icon name="search" size={17} /></span>
                  <h2>¿Buscas a alguien más?</h2>
                  <p>Consulta el horario de otra persona del equipo.</p>
                  <form className="lookup-form" onSubmit={handleLookupSubmit}>
                    <label className="lookup-input"><Icon name="search" size={17} /><input value={lookupInput} onChange={(event) => setLookupInput(event.target.value)} placeholder="Nombre de la persona" aria-label="Buscar horario de otra persona" required /></label>
                    <button className="primary-button" type="submit" disabled={scheduleLoading || !schedule}>Buscar</button>
                  </form>
                  {lookupMessage && <p className="form-message lookup-message" role="alert">{lookupMessage}</p>}
                  {otherEmployee && <div className="other-person-result"><div className="other-result-heading"><span className="person-avatar">{otherEmployee.initials}</span><div className="person-copy"><strong>{otherEmployee.name}</strong><span>{otherEmployee.role} · Su agenda semanal</span></div><button type="button" aria-label="Cerrar horario de otra persona" onClick={() => { setOtherEmployee(null); setLookupInput(""); }}><Icon name="close" size={16} /></button></div>{schedule && renderAgenda(otherEmployee, true)}</div>}
                </section>
                <p className="mobile-data-note"><Icon name="lock" size={13} /> Aquí solo se muestran los turnos consultados; el PDF original no se abre en esta vista.</p>
              </>
            ) : (
              <section className="mobile-welcome-card">
                <span className="welcome-icon"><Icon name="user" size={21} /></span>
                <h2>¿Cómo apareces en el horario?</h2>
                <p>Escribe tu nombre para ver tu agenda semanal. No necesitas abrir ni descargar el PDF.</p>
                {renderNameForm("mobile-name-form")}
                <div className="mobile-welcome-lock"><Icon name="lock" size={13} /> Los turnos se consultan desde Supabase al iniciar sesión.</div>
              </section>
            )}
          </div>
          <nav className="mobile-tab-bar" aria-label="Navegación"><button type="button" className="mobile-tab active" onClick={() => document.getElementById("mobile-my-schedule")?.scrollIntoView({ behavior: "smooth" })}><Icon name="calendar" size={18} />Mi horario</button><button type="button" className="mobile-tab" onClick={() => document.getElementById("mobile-other-search")?.scrollIntoView({ behavior: "smooth" })}><Icon name="search" size={18} />Buscar persona</button></nav>
        </div>
      </section>

      {showUploader && <div className="modal-backdrop">
        <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
          <button type="button" className="modal-close" aria-label="Cerrar" disabled={uploading} onClick={closeUploader}><Icon name="close" size={18} /></button>
          <span className="modal-icon"><Icon name="upload" size={21} /></span>
          <h2 id="upload-title">Subir horario semanal</h2>
          <p>El PDF se analizará aquí y solo se publicará después de que revises la vista previa.</p>

          <input ref={fileInput} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={handlePdfSelection} />
          <button type="button" className="drop-zone" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <span className="drop-icon"><Icon name="file" size={21} /></span>
            <strong>{selectedPdf?.name ?? "Elegir PDF semanal"}</strong>
            <span>{selectedPdf ? `${(selectedPdf.size / 1024 / 1024).toFixed(2)} MB` : "Formato PDF · Máximo 4 MB"}</span>
          </button>

          {uploadPreview && <div className="schedule-preview">
            <div className="preview-summary">
              <strong>{uploadPreview.branchName}</strong>
              <span>{formatDateRange(uploadPreview.weekStartDate, uploadPreview.weekEndDate)} · {uploadPreview.employees.length} personas · {uploadPreview.dates.length} días</span>
              <span>El PDF se guardará en el bucket privado schedules.</span>
            </div>
            {uploadPreview.alreadyPublished && <p className="preview-warning" role="alert">Ya hay un horario para esta sucursal y semana. Publicar reemplazará sus turnos actuales.</p>}
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead><tr><th>PERSONA</th>{uploadPreview.dates.map((date) => <th key={date}>{formatPreviewDay(date)}</th>)}</tr></thead>
                <tbody>{uploadPreview.employees.map((person) => <tr key={person.fullName}>
                  <td>{person.fullName}</td>
                  {person.shifts.map((shift) => <td key={`${person.fullName}-${shift.workDate}`}>{shift.isDayOff ? shift.dayLabel ?? "Descanso" : `${shift.startTime} – ${shift.endTime}`}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </div>}

          {uploadMessage && <p className="upload-error" role="alert">{uploadMessage}</p>}
          <p className="upload-admin-note">Solo la cuenta cuyo correo esté configurado como administrador puede publicar. El archivo y los turnos no se guardan si el análisis falla.</p>
          <div className="modal-actions">
            <button type="button" className="cancel-button" disabled={uploading} onClick={closeUploader}>Cancelar</button>
            {!uploadPreview
              ? <button type="button" className="primary-button" disabled={!selectedPdf || uploading} onClick={() => void handlePreviewSchedule()}>{uploading ? "Analizando…" : "Analizar PDF"}</button>
              : <>
                <button type="button" className="cancel-button" disabled={uploading} onClick={() => { setUploadPreview(null); setUploadMessage(""); }}>Cambiar PDF</button>
                <button type="button" className="primary-button" disabled={uploading} onClick={() => void handlePublishSchedule()}>{uploading ? "Publicando…" : uploadPreview.alreadyPublished ? "Reemplazar semana" : "Publicar horario"}</button>
              </>}
          </div>
        </section>
      </div>}

    </main>
  );
}
