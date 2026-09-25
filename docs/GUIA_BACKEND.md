# Guía de desarrollo — Backend de FixIt

Guía técnica del repositorio [FixIt-BackEnd](https://github.com/Los-mas-agiles/FixIt-BackEnd). Responsable: Edery Abanto.
Plan general: [`PLAN_FASES.md`](PLAN_FASES.md) · Contrato con el frontend: [`CONTRATO_API.md`](CONTRATO_API.md).

## 0. Qué hace el backend

El backend es **el único que toma decisiones de negocio** y el único que toca la base de datos:

1. Autentica usuarios y **aísla los datos por edificio** (nadie ve lo de otro edificio).
2. Recibe incidencias con foto, guarda la foto en Supabase Storage y **clasifica con IA** (tipo + prioridad) en el mismo request.
3. Valida los **cambios de estado** (solo hacia adelante, límite de WIP por técnico) y guarda las fechas con la **hora del servidor**.
4. Registra cada cambio en `historial_estados` y **notifica** al residente (en la app + Web Push).
5. Calcula los **KPIs** (cycle time, lead time, WIP, throughput, precisión de la IA) y el **CFD**.

## 1. Stack

| Herramienta | Uso |
|---|---|
| Node.js 24 (LTS) + TypeScript | Runtime y lenguaje |
| Express 5 | Framework HTTP |
| Prisma | ORM + migraciones sobre PostgreSQL |
| Zod | Validación de bodies y query params |
| jsonwebtoken + bcryptjs | Login con JWT y hash de contraseñas |
| multer | Recibir la foto (`multipart/form-data`) en memoria |
| @supabase/supabase-js | Subir fotos y generar URLs firmadas (con la *secret key*, solo en el servidor) |
| `fetch` nativo (APIs REST de Groq y Gemini) | Clasificación con IA, sin SDK ni dependencias extra |
| web-push | Notificaciones push (VAPID) |
| Vitest + Supertest | Tests |
| tsx | Correr TS en desarrollo |

Infraestructura: **Vercel** (la API se despliega como proyecto Express sin configuración extra) + **Supabase Free** (PostgreSQL + Storage).

## 2. Estructura de carpetas

```
src/
  index.ts              # crea la app Express y la exporta por defecto (entrypoint de Vercel)
  dev.ts                # solo local: importa la app y hace app.listen(3000)
  config/env.ts         # lee y valida variables de entorno con Zod (falla al arrancar si falta algo)
  lib/
    prisma.ts           # instancia única de PrismaClient
    supabase.ts         # cliente de Supabase Storage
    gemini.ts           # llamada a Gemini con timeout
    push.ts             # envío de Web Push
    errors.ts           # clase ApiError + códigos del contrato
  middleware/
    auth.ts             # verifica el JWT y pone req.usuario
    requireRol.ts       # requireRol('administrador', ...)
    errorHandler.ts     # convierte cualquier error al formato { error: { code, message } }
  modules/
    auth/               # routes.ts, service.ts, schemas.ts
    usuarios/
    incidencias/
    kpis/
    notificaciones/
  domain/               # LÓGICA PURA, sin Express ni Prisma → fácil de testear
    transiciones.ts     # ¿esta transición es válida? ¿quién puede hacerla?
    kpis.ts             # cálculo de cycle time, lead time, throughput, CFD
    clasificacion.ts    # parseo y validación de la respuesta de la IA + fallback
  types/models.ts       # mismos tipos que CONTRATO_API.md
prisma/
  schema.prisma
  seed.ts
tests/
docs/
  CONTRATO_API.md       # contrato con el frontend (fuente de verdad)
```

**Regla práctica:** las rutas (`routes.ts`) solo validan la entrada y llaman al `service.ts`. Las reglas de negocio viven en `domain/` como funciones puras. Así los tests más importantes no necesitan base de datos.

## 3. Modelo de datos (Prisma)

```prisma
enum Rol { residente mantenimiento administrador }
enum TipoIncidencia { plomeria electricidad ascensor limpieza seguridad otros }
enum Prioridad { alta media baja }
enum EstadoIncidencia { pendiente en_proceso resuelto }
enum ClasificadoPor { ia fallback manual }

model Edificio {
  id          String       @id @default(uuid())
  nombre      String
  direccion   String?
  usuarios    Usuario[]
  incidencias Incidencia[]
  creadoEn    DateTime     @default(now())
}

model Usuario {
  id            String    @id @default(uuid())
  nombre        String
  email         String    @unique
  passwordHash  String
  rol           Rol
  edificioId    String
  edificio      Edificio  @relation(fields: [edificioId], references: [id])
  activo        Boolean   @default(true)
  reportadas    Incidencia[] @relation("Residente")
  asignadas     Incidencia[] @relation("Tecnico")
  cambios       HistorialEstado[]
  notificaciones Notificacion[]
  suscripciones SuscripcionPush[]
  creadoEn      DateTime  @default(now())
}

model Incidencia {
  id                 String           @id @default(uuid())
  edificioId         String
  edificio           Edificio         @relation(fields: [edificioId], references: [id])
  residenteId        String
  residente          Usuario          @relation("Residente", fields: [residenteId], references: [id])
  descripcion        String
  fotoPath           String?          // ruta dentro del bucket, NO la URL
  tipo               TipoIncidencia
  prioridad          Prioridad
  clasificadoPor     ClasificadoPor
  tipoIA             TipoIncidencia?  // lo que dijo la IA originalmente (para medir precisión)
  prioridadIA        Prioridad?
  estado             EstadoIncidencia @default(pendiente)
  asignadoAId        String?
  asignadoA          Usuario?         @relation("Tecnico", fields: [asignadoAId], references: [id])
  fechaCreacion      DateTime         @default(now())
  fechaInicioProceso DateTime?
  fechaResolucion    DateTime?
  historial          HistorialEstado[]
  notificaciones     Notificacion[]

  @@index([edificioId, estado])
  @@index([residenteId])
  @@index([asignadoAId, estado])
}

model HistorialEstado {
  id             String            @id @default(uuid())
  incidenciaId   String
  incidencia     Incidencia        @relation(fields: [incidenciaId], references: [id], onDelete: Cascade)
  estadoAnterior EstadoIncidencia?
  estadoNuevo    EstadoIncidencia
  usuarioId      String
  usuario        Usuario           @relation(fields: [usuarioId], references: [id])
  fecha          DateTime          @default(now())

  @@index([incidenciaId])
  @@index([fecha])
}

model Notificacion {
  id           String     @id @default(uuid())
  usuarioId    String
  usuario      Usuario    @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  incidenciaId String
  incidencia   Incidencia @relation(fields: [incidenciaId], references: [id], onDelete: Cascade)
  mensaje      String
  leida        Boolean    @default(false)
  fecha        DateTime   @default(now())

  @@index([usuarioId, leida])
}

model SuscripcionPush {
  id        String   @id @default(uuid())
  usuarioId String
  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  creadoEn  DateTime @default(now())
}
```

**Conexión a Supabase desde Vercel (serverless):**
- `DATABASE_URL` → la cadena del **pooler de Supabase en modo transacción** (puerto 6543). Es la que usa la app en producción.
- `DIRECT_URL` → el **session pooler** (puerto 5432). Solo para `prisma migrate`. No usar la "Direct connection": solo funciona por IPv6 y muchas redes de casa no lo tienen.
- La forma exacta de declararlas depende de la versión de Prisma instalada (en Prisma 7 van en `prisma.config.ts` con el adapter de `pg`). Seguir la guía oficial "Prisma + Supabase" de la versión que se instale en la Fase 0.

## 4. Reglas de negocio (van en `src/domain/`)

### 4.1 Aislamiento por edificio
- El JWT lleva `{ sub: usuarioId, rol, edificioId }`.
- **Toda** consulta de Prisma filtra por `edificioId: req.usuario.edificioId`. Nunca se toma el edificio del body ni de la URL.
- Pedir una incidencia de otro edificio responde `404 NO_ENCONTRADO` (no `403`, para no revelar que existe).
- El residente, además, solo ve las suyas (`residenteId = req.usuario.id`).

### 4.2 Transiciones de estado

```ts
// src/domain/transiciones.ts
const SIGUIENTE: Record<EstadoIncidencia, EstadoIncidencia | null> = {
  pendiente: 'en_proceso',
  en_proceso: 'resuelto',
  resuelto: null,
}
```

| De → A | Quién | Efectos |
|---|---|---|
| `pendiente → en_proceso` | M (si no hay técnico se autoasigna) o A (la incidencia debe tener técnico) | `fechaInicioProceso = now()` del servidor |
| `en_proceso → resuelto` | El técnico asignado o A | `fechaResolucion = now()` del servidor |
| Cualquier otra | — | `409 TRANSICION_INVALIDA` |

- **Límite de WIP:** antes de pasar a `en_proceso`, contar las `en_proceso` del técnico. Si ya tiene `WIP_LIMITE_TECNICO` (por defecto 3) → `409 LIMITE_WIP`.
- El cambio de estado, la fila de `historial_estados` y la `notificacion` se guardan en **una sola transacción** (`prisma.$transaction`). El push se envía **después** del commit y, si falla, solo se registra en el log (nunca rompe el request).
- Al **crear** la incidencia también se inserta un historial con `estadoAnterior: null, estadoNuevo: 'pendiente'` (lo necesita el CFD).

### 4.3 Clasificación con IA

- Se ejecuta **dentro** de `POST /incidencias`, antes de guardar. Timeout **total** de **8 segundos** (`AbortSignal.timeout`).
- **Cadena de modelos** (`IA_MODELOS`, formato `proveedor:modelo`): se prueban en orden; si uno falla por saturación (503), cuota (429), timeout o respuesta inválida y quedan ≥ 1.5 s, se prueba el siguiente. Un error no reintentable (ej. API key inválida) descarta solo los modelos de ese proveedor. Se saltan los proveedores sin API key.
- **Groq** (`openai/gpt-oss-*`) se usa con JSON estricto (`response_format: json_schema, strict: true`) y `reasoning_effort: low`.
- Se usa la salida estructurada de Gemini (`responseMimeType: 'application/json'` + `responseSchema` con los enums) para que la respuesta sea un JSON válido.
- Aun así se valida con Zod. Si la respuesta no calza, hay timeout o cualquier error → **fallback**: `tipo: 'otros'`, `prioridad: 'media'`, `clasificadoPor: 'fallback'`. Una incidencia **nunca** queda sin clasificar (Objetivo 4).
- Se guardan también `tipoIA` / `prioridadIA` para calcular después la precisión.
- Los modelos van en variables para cambiarlos sin tocar código. Medición del 2026-09-25 (nivel gratuito): `gemini-3.5-flash-lite` respondió en ~0.8 s; `gemini-3.8-flash` estaba saturado (503) y sin cuota (429); los `gemini-2.5-*` ya fueron retirados. Por eso: principal `gemini-3.5-flash-lite`, respaldo `gemini-3.1-flash-lite`.
- **Precisión medida:** `npm run ia:evaluar` clasifica 30 descripciones etiquetadas a mano (`scripts/dataset-clasificacion.json`) y escribe el reporte en `docs/EVALUACION_IA.md`.

Prompt base:

```
Eres un clasificador de incidencias de mantenimiento para edificios residenciales en Lima.
Clasifica la descripción del residente.
- tipo: plomeria | electricidad | ascensor | limpieza | seguridad | otros
- prioridad:
  - alta: riesgo para personas o corte de un servicio esencial (agua, luz, gas, ascensor único), fuga activa, cortocircuito, puerta de acceso rota.
  - media: afecta el uso normal pero sin riesgo inmediato.
  - baja: estético o menor.
Descripción: """{descripcion}"""
```

### 4.4 KPIs (`src/domain/kpis.ts`)

Todos se calculan sobre las incidencias del edificio del admin:

| KPI | Fórmula | Sobre qué incidencias |
|---|---|---|
| **Cycle time** (h) | promedio de `fechaResolucion − fechaInicioProceso` | resueltas con `fechaResolucion` dentro de `[desde, hasta]` y filtro de prioridad |
| **Lead time** (h) | promedio de `fechaResolucion − fechaCreacion` | las mismas |
| **Throughput** | cantidad | las mismas |
| **WIP** | cantidad | `estado = en_proceso` **ahora** |
| **Precisión IA** (%) | `(clasificadas por IA − corregidas manualmente) / clasificadas por IA × 100` | creadas en el periodo con `tipoIA` no nulo |
| **CFD** | por cada día: cuántas incidencias estaban en cada estado al final del día | reconstruido desde `historial_estados` |

Si no hay resueltas en el periodo, `cycleTimeHoras` y `leadTimeHoras` son `null` (no `0`).

> Nota para el TF: **cycle time** mide el tiempo de trabajo (desde que alguien la toma) y **lead time** el tiempo que espera el residente (desde que reporta). El Objetivo 2 usa el cycle time de prioridad alta.

### 4.5 Fotos
- Bucket **privado** `fotos` en Supabase. Ruta: `<edificioId>/<incidenciaId>.<ext>`.
- `multer` en memoria con límite de 4 MB y solo `image/jpeg`, `image/png`, `image/webp`.
- Al responder, se genera una URL firmada de 1 hora (`createSignedUrl`) y se devuelve como `fotoUrl`.

## 5. Manejo de errores

- Toda respuesta de error usa el formato del contrato: `{ error: { code, message, details? } }`.
- Se lanza `new ApiError(409, 'LIMITE_WIP', 'Ya tienes 3 incidencias en proceso...')` y el `errorHandler` lo formatea.
- Errores de Zod → `400 VALIDACION` con los campos en `details`.
- Errores inesperados → `500 INTERNO` con mensaje genérico; el detalle solo va al log (nunca stack traces al cliente).

## 6. Variables de entorno

`.env.example` (el `.env` real nunca se sube a git):

```
# Base de datos (Supabase)
DATABASE_URL=            # pooler, modo transacción (puerto 6543)
DIRECT_URL=              # session pooler (puerto 5432), solo migraciones

# Supabase Storage
SUPABASE_URL=
SUPABASE_SECRET_KEY=         # sb_secret_... SECRETA: solo backend
SUPABASE_BUCKET=fotos

# Auth
JWT_SECRET=              # cadena larga aleatoria
JWT_EXPIRES_IN=7d

# IA
GEMINI_API_KEY=
GROQ_API_KEY=
IA_MODELOS=gemini:gemini-3.5-flash-lite,groq:openai/gpt-oss-20b,gemini:gemini-3.1-flash-lite

# Web Push (generar con: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:equipo@fixit.demo

# Reglas
WIP_LIMITE_TECNICO=3
CORS_ORIGINS=http://localhost:5173,https://fixit-web.vercel.app
```

En Vercel se cargan en *Settings → Environment Variables* (o con `vercel env add`).

## 7. Tests

- **Unitarios (`domain/`)**, sin base de datos — los más importantes:
  - todas las transiciones válidas e inválidas, por rol;
  - límite de WIP;
  - cálculo de KPIs con un set de incidencias con fechas conocidas;
  - parseo de la IA: JSON válido, JSON inválido, valores fuera del enum, timeout → fallback.
- **De integración (Supertest)** para las rutas críticas: login, aislamiento entre edificios, crear incidencia, cambiar estado.
- La llamada a Gemini **siempre se simula** en los tests (no gastar cuota).

## 8. Cómo correr en local

```bash
npm install
cp .env.example .env        # completar valores
npx prisma migrate dev      # crea las tablas
npx prisma db seed          # edificios y cuentas de demo
npm run dev                 # http://localhost:3000/api/health
```

## 9. Definition of Done (backend)

Un endpoint está terminado cuando:
1. Valida la entrada con Zod y responde errores con el formato del contrato.
2. Aplica rol y aislamiento por edificio.
3. Tiene tests de su lógica (unitarios en `domain/`) y pasa CI.
4. Está desplegado en preview y probado con una request real.
5. `docs/CONTRATO_API.md` refleja exactamente su comportamiento, y el frontend fue avisado si algo cambió.
