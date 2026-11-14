# Turno — horarios semanales

Aplicación Next.js con acceso por correo y contraseña. Los empleados consultan el horario más reciente de Supabase; el administrador carga un PDF, revisa los datos extraídos y confirma su publicación.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Las consultas requieren una sesión iniciada. Si todavía no hay una semana publicada, la aplicación mostrará un estado vacío.

## Supabase

1. En Supabase, abre **SQL Editor**, copia [`supabase/schema.sql`](./supabase/schema.sql) y pulsa **Run**. Si ya ejecutaste una versión anterior, vuelve a ejecutarlo para agregar las columnas, permisos del servidor y la función de publicación.
2. En **Authentication → Providers**, habilita Email. En **Authentication → URL Configuration**, configura `http://localhost:3000` y agrega el dominio de Vercel como URL de redirección.
3. En **Storage**, crea o conserva el bucket `schedules` como **privado**.
4. Copia las variables de [`.env.example`](./.env.example) a `.env.local` (o al `.env` local que ya use el proyecto). Obtén la URL y la clave publicable en **Project Settings → API Keys**. La clave secreta de servidor también está en esa sección; nunca la pongas en una variable `NEXT_PUBLIC_`, en el navegador ni en Git.
5. En `SCHEDULE_ADMIN_EMAILS`, escribe el correo verificado de la cuenta que podrá publicar. Se pueden separar varios correos con comas. Reinicia `npm run dev` después de cambiar `.env`.
6. Inicia sesión con esa cuenta, pulsa **Cargar horario PDF**, analiza el archivo y revisa la vista previa. Al confirmar, el PDF se sube al bucket privado y los empleados, turnos y descansos se publican en las tablas. Si ya existe la misma sucursal y fecha inicial, la pantalla avisa que se reemplazará.

La carga acepta PDFs de hasta 4 MB, con texto seleccionable, en el formato **Horario por trabajador** con periodo, fechas en columnas y códigos de turno. Si el PDF no coincide o no puede leerse, se muestra un error y no se publican datos. La extracción todavía no incluye OCR.

Las políticas RLS permiten leer horarios a usuarios autenticados para la búsqueda de compañeros. El esquema concede a `service_role` lectura en `schedules` para que el servidor pueda revisar si una semana ya existe; la escritura usa una función de base de datos invocable solo con la clave secreta de servidor. El endpoint también verifica la sesión y el correo administrador.

## Vercel

En **Project → Settings → Environment Variables**, agrega las cuatro variables de [`.env.example`](./.env.example) a los entornos necesarios y vuelve a desplegar. Configura Node.js **22.13 o superior** para PDF.js. No subas `.env` al repositorio.

## Pendiente

- Asociar cada cuenta autenticada con su persona de `employees`; por ahora, la selección de nombre se guarda en el navegador.
- Permitir corregir celdas detectadas antes de confirmar y añadir OCR si llegan PDFs escaneados.
- Añadir selector e historial de semanas. El panel actualmente muestra la última semana publicada.
- Probar en producción el correo administrador, la clave secreta del servidor, el bucket privado y las redirecciones de autenticación.

La clave secreta de servidor nunca debe exponerse al cliente.
