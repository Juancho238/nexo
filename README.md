# NEXO — Portal de Selección · v2.0

Aplicación de gestión B2B hecha con **Vite + React + TypeScript**, Supabase Auth, PostgreSQL, RLS y una Edge Function de invitación. Diseño oscuro, responsive y violeta. La vista entregada empieza en login; el botón **Explorar demostración** permite recorrer datos ficticios sin Supabase.

## Inicio local

Requisitos: Node.js 22 LTS o posterior, npm y un proyecto Supabase. Para una instalación nueva usar una base vacía; para actualizar usar la sección v2.

```bash
npm ci
cp .env.example .env
npm run dev
```

Sin `.env`, la aplicación ofrece únicamente la demostración. Sus cambios se guardan en `sessionStorage` de esa pestaña, no en Supabase; se pueden restablecer desde Configuración. Nunca se usan datos ficticios como reemplazo silencioso de una conexión real que falla.

## Conectar tu Supabase

1. Ejecutar **`supabase/migrations/001_nexo.sql`** en el SQL Editor de un proyecto **nuevo y vacío**. La migración crea las tablas, índices, políticas y operaciones transaccionales. No ejecutarla sobre una base ya utilizada por otra aplicación.
2. En **Authentication → Providers / Sign In**, deshabilitar **Allow new users to sign up**. El portal no ofrece registro, pero también hay que deshabilitarlo en Supabase.
3. Crear el primer usuario en **Authentication → Users** desde el Dashboard. Copiar su UUID real. Ejecutar, reemplazando los tres valores:

```sql
insert into public.profiles (id, name, email, role, client_id)
values (
  'UUID_REAL_DEL_USUARIO_DE_AUTH',
  'Micaela',
  'EMAIL_REAL_DE_ESE_USUARIO',
  'super_admin',
  null
);
```

No usar el UUID de demostración. El UUID debe corresponder a la cuenta creada en Auth; los perfiles no se generan desde metadatos que el usuario pueda modificar.

4. Configurar `.env`:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

La clave publicable, o la antigua `anon`, puede estar en el navegador. **Nunca colocar `service_role`, `sb_secret_*` ni claves de correo en variables `VITE_`.** Las variables Vite se incorporan al compilar: hay que reconstruir y publicar después de modificarlas.

5. En Auth → URL Configuration, configurar Site URL con el origen real del portal. Agregar ese origen y `http://localhost:5173` como Redirect URLs, incluyendo `/?setup=1` para las invitaciones. Configurar el SMTP de Supabase antes de invitar usuarios reales.
6. Compilar con `npm run build` y servir `dist`. La navegación del MVP usa estado interno, por lo que no necesita reglas de reescritura de rutas. Cualquier proveedor compatible con sitios estáticos puede alojarlo.
7. Para el alta por invitación, instalar la CLI de Supabase y desplegar:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set NEXO_APP_URL=https://TU_DOMINIO
supabase functions deploy invite-user
```

Mantener `verify_jwt = true`. La función valida el JWT y el rol, reserva la solicitud contra aprobaciones simultáneas, envía una invitación oficial con Auth, crea el perfil y asigna las unidades. La service-role se obtiene solo del entorno protegido de Supabase. La invitación lleva a `/?setup=1`, donde el usuario define su contraseña. Nunca se envían contraseñas por email.

Si falla la creación del perfil después de invitar, la función intenta eliminar la cuenta creada y devuelve la solicitud a pendiente. Si la compensación falla, conserva el estado `Invitando` para revisión administrativa: no se vuelve a invitar automáticamente. Si una ejecución se interrumpe en ese punto, revisar Auth y la solicitud antes de reintentar.

## Flujo funcional

1. Selectora crea cliente, razón social y unidades.
2. Gerente con unidades asignadas envía un requerimiento o solicita una unidad/usuario.
3. Selectora aprueba o rechaza desde Solicitudes. El rechazo exige motivo.
4. Aprobar un requerimiento crea, en una misma transacción, el requerimiento y su búsqueda. Aprobar una unidad la crea y asigna al gerente solicitante.
5. Selectora registra candidatos, o asocia una ficha existente por DNI/CUIL a otra búsqueda. La base impide duplicaciones y asociaciones repetidas.
6. Cambios de etapa guardan fecha, usuario, estado anterior, nuevo estado y observación. Se pueden registrar entrevistas y resultados.
7. Se confirman ingresos sin superar las vacantes. Una búsqueda se marca cubierta solo cuando tiene todos los ingresos confirmados.
8. Reportes muestran métricas, filtro por cliente y fechas, y exportación CSV. La ficha del candidato reúne los procesos y las entrevistas que ese usuario puede ver.

## Roles y límites del MVP

| Rol | Acceso |
|---|---|
| Super admin / selectora | Clientes, estructuras, usuarios, permisos, solicitudes, candidatos, etapas, entrevistas, reportes y actividad global |
| Admin cliente | Consulta de los procesos de las unidades asignadas dentro de su cliente |
| Gerente | Consultas de unidades asignadas, requerimientos propios, envío de requerimientos y solicitudes de unidad/usuario |
| Líder | Consulta de los procesos de las unidades asignadas |

El aislamiento se hace en PostgreSQL mediante RLS y en cada RPC; ocultar botones no es la medida de seguridad. Un candidato puede participar en varias empresas; cada cliente ve solo el historial de sus procesos autorizados. La ficha personal compartida es visible para las unidades que tienen un proceso asociado. Un perfil inactivo no puede leer los datos. Actividad e historial no admiten escrituras directas desde el navegador.

La asignación de unidades se administra desde **Usuarios → Permisos**. El alta inicial solicita una unidad; después se pueden asignar varias. El cliente de un perfil no se cambia desde el navegador. Las cuentas adicionales de selectora se crean desde Auth y se habilitan manualmente por un administrador del proyecto.

## Datos de demostración

5 clientes, 8 razones sociales, 15 unidades, 20 usuarios ficticios, 20 búsquedas y 100 candidatos ficticios. Los emails utilizan `example.com`. Los nombres, documentos y CUIT son de prueba y no se deben importar a producción. El selector superior permite revisar las distintas vistas por rol.

## Emails y notificaciones

- Notificaciones internas: funcionan en la aplicación y quedan guardadas en Supabase. La migración incorpora `notifications` a la publicación Realtime si existe.
- Invitaciones y recuperación: usan Supabase Auth; requieren URLs y SMTP correctamente configurados.
- Emails de negocio: las solicitudes y los estados relevantes generan registros en `email_outbox`, con identidad visual preparada en `supabase/email-templates.ts`. **No se envían hasta conectar un proveedor y un worker de entrega.** No se informa un email como enviado mientras siga en cola. Los avisos de feedback por vencimiento requieren una futura tarea programada.
- Las plantillas incluyen un enlace a la solicitud; `?request=UUID` abre su detalle después de iniciar sesión si el usuario tiene permiso.

## Actualizar desde el MVP a v2

Conservá tu `.env` local y las variables de entorno de Vercel. El ZIP no incluye credenciales, dependencias instaladas ni compilados. La conexión se mantiene mediante las mismas variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

1. En una base donde ya ejecutaste 001, aplicar en orden **002_nexo_v2.sql → 003_private_cv.sql → 004_candidate_portal.sql**. No repetir 001. Las migraciones son adicionales: no borran ni reemplazan los registros existentes. Crear una copia de seguridad antes de actualizar una base en uso. Ejecutar cada migración una sola vez; no son scripts para repetir sin control de versiones.
2. Para una instalación nueva, ejecutar 001 primero y luego 002, 003 y 004. Los pasos de Auth y primer administrador anteriores siguen vigentes.
3. Desplegar la función de candidatos además de la función de usuarios existente:

```bash
supabase functions deploy invite-candidate
supabase secrets set NEXO_APP_URL=https://TU-DOMINIO.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY` son secretos del entorno de Edge Functions, jamás variables Vite. La función autentica el token y vuelve a verificar el perfil activo super_admin. El gateway usa `verify_jwt=true`; para claves publicables nuevas verificar la compatibilidad JWT de tu proyecto antes de producción, sin quitar la comprobación explícita de `auth.getUser()`.
4. En Auth agregar los Redirect URLs exactos `https://TU-DOMINIO.vercel.app/?portal=1&setup=1` y `https://TU-DOMINIO.vercel.app/?setup=1`, y sus equivalentes locales si se usan. Configurar SMTP. **Invitar al portal** envía un email real al pulsarlo; no ocurre automáticamente al crear una ficha.
5. Ejecutar `npm ci`, `npm test` y `npm run build`; subir el código a tu repositorio y generar un nuevo despliegue en Vercel. La carpeta de salida continúa siendo `dist`.

## Funciones de v2

| Función | Estado y uso |
|---|---|
| CV privados | Bucket `nexo-cv`, PDF hasta 5 MB. Cargar, descargar y eliminar desde la ficha. Selectora escribe; usuarios con proceso autorizado consultan. No hay URLs públicas. |
| Lectura de CV | Extrae texto PDF localmente al pulsar **Leer texto del CV**. Carga diferida de PDF.js, límite 40 páginas / 60.000 caracteres. No tiene OCR ni interpreta imágenes. No completa ni cambia una ficha sin intervención humana. |
| Agenda | Crear citas en la ficha, consultar en Agenda y marcar Programada / Realizada / Cancelada. Solo la selectora escribe. Marcar una cita realizada no crea un resultado de entrevista: éste se registra por separado. |
| WhatsApp | Enlace manual desde la ficha con borrador. Requiere teléfono internacional, por ejemplo 549…; el usuario confirma el envío en WhatsApp. No hay API ni envíos automáticos. |
| Portal de candidatos | Acceso por invitación en `/?portal=1`. Cada cuenta ve sus procesos con estados resumidos y CV propios; puede actualizar teléfono/localidad con confirmación registrada. No ve notas internas, DNI, historia de etapas, feedback ni fichas ajenas. No hay registro público ni carga de CV por candidato. |
| Edición | Editar ficha y cliente desde su detalle. RPCs administrativas conservan relaciones e identificadores. |
| Feedback gerencial | Gerente, admin cliente y selectora pueden recomendar Aprobar / Rechazar / Solicitar entrevista solamente en Presentado a gerencia o Entrevista gerencial, dentro de los procesos autorizados. Se registra actor/fecha y se notifica a la selectora. No cambia etapas automáticamente. Líder consulta. |
| Reportes | Filtros cliente, razón social, unidad, gerente solicitante, puesto, estado y período; 7/30 días y CSV. El período corresponde a apertura de búsquedas y muestra sus resultados actuales, no movimientos ocurridos dentro del período. Cobertura media excluye cancelaciones. Gerente solicitante es quien creó el requerimiento, no un responsable asignado diferente. |
| Consulta por pantalla | RPC `nexo_workspace`: páginas de 25 filas, detalle de búsqueda de 100 postulaciones por página; búsqueda global de servidor y conteos SQL completos. No carga todas las tablas al iniciar. |
| Auditoría de lectura | Registra consultas de pantallas/fichas/reportes y descarga o lectura de CV desde el portal B2B. No representa todas las lecturas SQL/API ni las descargas desde el portal de candidatos. Los candidatos registran su confirmación de actualización en candidate_consents. |
| Retención | Configuración de plazos en Configuración. No realiza borrados automáticos: quedan pendientes aprobación de la política, excepciones, procedimiento de purga y recuperación. |

Los archivos reales y las funciones de invitación requieren Supabase. La demostración usa datos explícitamente ficticios, guarda agenda/feedback en la pestaña y no almacena ni invita candidatos reales.

### Límites y conexiones pendientes

- Identificación: se conserva el contrato de `src/integrations/identity.ts`. No hay conexión a ARCA, API inventada ni resultados simulados. La edad se calcula con la fecha de nacimiento registrada.
- **Firma electrónica, IA y WhatsApp Business API** necesitan selección de proveedor, credenciales y definición de documentos/consentimientos. No están activados ni implementados como integraciones reales en esta entrega. El enlace manual de WhatsApp y la extracción de texto PDF funcionan sin estos proveedores.
- Los selectores de configuración tienen un límite explícito de 200 registros visibles por tabla. Si se supera, la RPC informa el problema en vez de truncar silenciosamente. Para miles de clientes/unidades/usuarios hacen falta selectores remotos paginados; esta v2 resuelve paginación de listas operativas y agregaciones, no todas las necesidades de escala.
- Las listas operativas incluyen relaciones acotadas: hasta 100 postulaciones y 500 registros de entrevistas/historial para las previsualizaciones. El detalle de candidato consulta su historial autorizado bajo demanda. Los conteos de Dashboard y Reportes se calculan por SQL; el número de entrevistas mostrado en cada búsqueda también es SQL. No exporta millones de filas ni garantiza latencia sin medir la base real.
- El buscador de candidatos/puestos usa índices trigram de PostgreSQL. Los filtros genéricos de otras tablas consultan texto JSON y pueden requerir índices específicos según el volumen.
- La revocación de una cuenta de candidato se hace mediante `candidate_accounts.active=false` por un administrador de base. No concede un rol empresarial al candidato.
- Antes de uso masivo siguen pendientes revisión de privacidad, consentimiento para selección/almacenamiento, proceso de bajas y conservación. La confirmación del portal documenta una actualización de contacto; no reemplaza una política de privacidad completa.

## Comprobaciones

```bash
npm test
npm run build
```

`tests/database.mjs` ejecuta las cuatro migraciones (con esquemas Auth/Storage de prueba) en PostgreSQL embebido (PGlite) con un esquema Auth de prueba. Verifica aislamiento por cliente/unidad, bloqueo de elevación de rol, aprobación atómica, protección del historial, duplicados, capacidad de vacantes, usuarios inactivos y anonimato. **No sustituye la validación en tu proyecto Supabase real.**

`tests/ui.tsx` recorre el flujo de requerimiento → aprobación → búsqueda → candidato → historial, detecta DNI duplicado y verifica la vista del gerente en un DOM de prueba. No es una prueba visual de navegador. Las invitaciones externas, SMTP, Realtime y tu conexión remota solo pueden verificarse después de configurar Supabase.

## Estructura

- `src/App.tsx`: pantallas, formularios y flujos del portal.
- `src/styles.css`: sistema visual responsive.
- `src/model.ts`: entidades y alcance de demostración por rol.
- `src/repository.ts`: operaciones de Supabase y aprobación de demostración.
- `src/supabase.ts`: cliente configurado por variables de entorno.
- `src/demo.ts`: dataset ficticio.
- `supabase/migrations/001_nexo.sql`: esquema, RLS, auditoría, RPC y cola de emails.
- `supabase/functions/invite-user/index.ts`: invitación protegida.
- `supabase/email-templates.ts`: emails preparados para un futuro worker.

Documentación oficial de referencia: [Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

Referencia de lectura PDF: [PDF.js](https://mozilla.github.io/pdf.js/). Para activar el portal: [Supabase inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
