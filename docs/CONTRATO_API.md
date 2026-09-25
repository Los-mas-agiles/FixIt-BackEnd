# Contrato de API — FixIt

Este documento es el **acuerdo entre frontend y backend**. El frontend programa contra esto; el backend lo cumple.
Si algo tiene que cambiar, **primero se cambia aquí** (con PR en el repo de backend) y se avisa al equipo de frontend. Nunca al revés.

- **Base URL:** `VITE_API_URL` → producción: **`https://fix-it-back-end.vercel.app/api`** · local (si corres el backend): `http://localhost:3000/api`
- **CORS:** la API acepta peticiones desde `http://localhost:5173` (`npm run dev`), `http://localhost:4173` (`npm run preview`) y `https://fix-it-front-end*.vercel.app` (producción y previews del frontend en Vercel). Si el proyecto del frontend en Vercel tiene otro nombre, avisar para agregarlo.
- **Formato:** JSON (salvo la creación de incidencias, que es `multipart/form-data`)
- **Fechas:** siempre strings ISO 8601 en UTC (`"2026-10-05T14:30:00.000Z"`). El frontend las formatea a hora de Lima.
- **IDs:** strings UUID.
- **Autenticación:** header `Authorization: Bearer <token>` en todas las rutas excepto `POST /auth/login` y `GET /health`.

---

## 1. Tipos compartidos

Copiar tal cual en `src/types/models.ts` del frontend. El backend tiene los mismos tipos en `src/types/models.ts`.

```ts
export type RolUsuario = 'residente' | 'mantenimiento' | 'administrador'
export type TipoIncidencia = 'plomeria' | 'electricidad' | 'ascensor' | 'limpieza' | 'seguridad' | 'otros'
export type Prioridad = 'alta' | 'media' | 'baja'
export type EstadoIncidencia = 'pendiente' | 'en_proceso' | 'resuelto'
export type ClasificadoPor = 'ia' | 'fallback' | 'manual'

export interface UsuarioResumen {
  id: string
  nombre: string
}

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: RolUsuario
  edificioId: string
  edificioNombre: string
}

export interface Incidencia {
  id: string
  edificioId: string
  residente: UsuarioResumen
  descripcion: string
  fotoUrl: string | null          // URL firmada, válida ~1 hora. No guardarla.
  tipo: TipoIncidencia            // nunca null: la IA clasifica al crear (o cae al fallback)
  prioridad: Prioridad            // nunca null
  clasificadoPor: ClasificadoPor
  estado: EstadoIncidencia
  asignadoA: UsuarioResumen | null
  fechaCreacion: string
  fechaInicioProceso: string | null
  fechaResolucion: string | null
}

export interface CambioEstado {
  id: string
  estadoAnterior: EstadoIncidencia | null   // null = creación
  estadoNuevo: EstadoIncidencia
  usuario: UsuarioResumen
  fecha: string
}

export interface IncidenciaDetalle extends Incidencia {
  historial: CambioEstado[]
}

export interface KPIs {
  desde: string
  hasta: string
  prioridad: Prioridad | null     // null = todas
  cycleTimeHoras: number | null   // promedio (fechaResolucion − fechaInicioProceso) de resueltas en el periodo
  leadTimeHoras: number | null    // promedio (fechaResolucion − fechaCreacion) de resueltas en el periodo
  wip: number                     // incidencias en 'en_proceso' AHORA
  throughput: number              // incidencias resueltas en el periodo
  totalReportadas: number         // creadas en el periodo
  precisionIA: number | null      // % de clasificaciones IA que el admin NO corrigió (0–100)
}

export interface PuntoCFD {
  fecha: string                   // 'YYYY-MM-DD'
  pendiente: number
  en_proceso: number
  resuelto: number
}

export interface Notificacion {
  id: string
  incidenciaId: string
  mensaje: string
  leida: boolean
  fecha: string
}

export interface ApiError {
  error: {
    code: CodigoError
    message: string               // legible, en español, se puede mostrar al usuario
    details?: unknown
  }
}

export type CodigoError =
  | 'VALIDACION'          // 400
  | 'NO_AUTENTICADO'      // 401 → el frontend cierra sesión y manda al login
  | 'PROHIBIDO'           // 403
  | 'NO_ENCONTRADO'       // 404
  | 'TRANSICION_INVALIDA' // 409
  | 'LIMITE_WIP'          // 409
  | 'INTERNO'             // 500
```

---

## 2. Endpoints

Leyenda de roles: **R** = residente, **M** = mantenimiento, **A** = administrador.
Toda consulta queda **limitada automáticamente al edificio del usuario** (sale del token). El frontend nunca manda `edificioId`.

### Salud

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| GET | `/health` | público | `{ ok: true }` |
| GET | `/health/db` | público | `{ ok: true, db: 'up' }` — diagnóstico: confirma que la API llega a la base de datos |

### Autenticación (HU6)

| Método | Ruta | Roles | Body | Respuesta |
|---|---|---|---|---|
| POST | `/auth/login` | público | `{ email, password }` | `{ token: string, usuario: Usuario }` |
| GET | `/auth/me` | R M A | — | `Usuario` |

- Credenciales incorrectas → `401 NO_AUTENTICADO` con mensaje "Correo o contraseña incorrectos".
- El token dura 7 días. No hay refresh: al vencer, `401` y se vuelve a loguear.

### Usuarios (administración)

| Método | Ruta | Roles | Body / Query | Respuesta |
|---|---|---|---|---|
| GET | `/usuarios` | A | `?rol=mantenimiento` (opcional) | `Usuario[]` |
| POST | `/usuarios` | A | `{ nombre, email, password, rol }` | `Usuario` (201) |

- `password` mínimo 8 caracteres. Email duplicado → `400 VALIDACION`.
- El usuario se crea en el mismo edificio que el admin.

### Incidencias (HU1, HU2, HU3)

| Método | Ruta | Roles | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/incidencias` | R | `multipart/form-data`: `descripcion` (texto, 10–1000 caracteres), `foto` (archivo opcional, jpg/png/webp, máx. 4 MB) | `Incidencia` (201) |
| GET | `/incidencias` | R M A | `?estado=` `?asignadoA=me` `?prioridad=` (todos opcionales) | `Incidencia[]` (más recientes primero) |
| GET | `/incidencias/:id` | R M A | — | `IncidenciaDetalle` |
| PATCH | `/incidencias/:id/estado` | M A | `{ estado: EstadoIncidencia }` | `Incidencia` |
| PATCH | `/incidencias/:id/asignacion` | A | `{ tecnicoId: string \| null }` | `Incidencia` |
| PATCH | `/incidencias/:id/clasificacion` | A | `{ tipo?: TipoIncidencia, prioridad?: Prioridad }` | `Incidencia` |

Reglas que aplica el backend (el frontend solo muestra el error si ocurre):

- **Residente** solo ve sus propias incidencias en `GET /incidencias` y `GET /incidencias/:id`.
- **Clasificación:** `POST /incidencias` tarda 1–8 segundos porque la IA clasifica en el mismo request. Mostrar un estado "Enviando y clasificando…". La respuesta ya trae `tipo` y `prioridad`.
- **Foto:** el frontend la comprime antes de enviarla (máx. ~1 MB recomendado). Vercel rechaza bodies > 4.5 MB.
- **Transiciones permitidas** (solo hacia adelante):
  - `pendiente → en_proceso`:
    - Si la mueve **M** y no tiene técnico, se le asigna automáticamente. Si está asignada a **otro** técnico → `403 PROHIBIDO` ("Esta incidencia está asignada a otro técnico").
    - Si la mueve **A**, la incidencia debe tener técnico asignado; si no → `409 TRANSICION_INVALIDA` ("Asigna un técnico antes de pasarla a "En proceso"").
  - `en_proceso → resuelto`: solo el técnico asignado o un A. Otro técnico → `403 PROHIBIDO`.
  - Cualquier otra (saltarse un paso, retroceder, repetir el mismo estado) → `409 TRANSICION_INVALIDA`.
- **Concurrencia:** si dos personas mueven la misma tarjeta a la vez, solo una lo logra; la otra recibe `409 TRANSICION_INVALIDA` ("Otra persona actualizó esta incidencia hace un momento. Recarga el tablero."). El frontend debe recargar la lista al recibir cualquier `409`.
- **Asignación** (`PATCH /incidencias/:id/asignacion`, solo A):
  - El técnico debe ser `mantenimiento`, estar activo y ser del mismo edificio; si no → `400 VALIDACION`.
  - `tecnicoId: null` quita el técnico, solo si la incidencia está `pendiente`.
  - Reasignar una `en_proceso` a otro técnico respeta el límite de WIP del nuevo técnico (`409 LIMITE_WIP`).
  - Una incidencia `resuelto` no se puede reasignar → `409 TRANSICION_INVALIDA`.
- **Límite de WIP:** un técnico no puede tener más de **3** incidencias en `en_proceso` (configurable en el backend). Si se excede → `409 LIMITE_WIP` con mensaje "Ya tienes 3 incidencias en proceso. Resuelve una antes de tomar otra." (o, si la mueve un admin, "El técnico ya tiene 3 incidencias en proceso. Espera a que resuelva una o asigna otro técnico.").
- **Fechas** (`fechaInicioProceso`, `fechaResolucion`) las pone el servidor. El frontend nunca las envía.
- **Clasificación manual** (`PATCH /incidencias/:id/clasificacion`, solo A): envía `tipo`, `prioridad` o ambos (si no envía ninguno → `400 VALIDACION`). Cambia `clasificadoPor` a `'manual'`. Se permite en cualquier estado.
- **`clasificadoPor`:** `'ia'` = lo decidió Gemini · `'fallback'` = la IA no respondió a tiempo y se usó `otros`/`media` (conviene que el admin la revise) · `'manual'` = la corrigió un admin. El frontend puede mostrar un indicador discreto para cada caso.

### KPIs (HU5)

| Método | Ruta | Roles | Query | Respuesta |
|---|---|---|---|---|
| GET | `/kpis` | A | `?desde=ISO&hasta=ISO&prioridad=alta` (todos opcionales; por defecto últimos 7 días, todas las prioridades) | `KPIs` |
| GET | `/kpis/cfd` | A | `?desde=ISO&hasta=ISO` (por defecto últimos 14 días) | `PuntoCFD[]` (un punto por día) |

- El **Objetivo 2** del TF se mide con `GET /kpis?prioridad=alta` → `cycleTimeHoras < 48`.

### Notificaciones (HU4)

| Método | Ruta | Roles | Body | Respuesta |
|---|---|---|---|---|
| GET | `/notificaciones` | R M A | — | `Notificacion[]` (últimas 50) |
| PATCH | `/notificaciones/:id/leida` | R M A | — | `Notificacion` |
| POST | `/notificaciones/leer-todas` | R M A | — | `{ ok: true }` |
| GET | `/push/vapid-public-key` | R M A | — | `{ publicKey: string }` |
| POST | `/push/suscripciones` | R M A | `PushSubscriptionJSON` (lo que devuelve `subscription.toJSON()`) | `{ ok: true }` (201) |
| DELETE | `/push/suscripciones` | R M A | `{ endpoint: string }` | `{ ok: true }` |

- **Cuándo se generan avisos** (se guardan como `Notificacion` y además se envía un Web Push a todos los dispositivos suscritos del usuario):
  - Al **residente**, cada vez que su incidencia cambia de estado ("…está En proceso…", "…fue resuelta.").
  - Al **técnico**, cuando un admin se la asigna ("Te asignaron la incidencia…"). Reasignar al mismo técnico o quitar el técnico no genera aviso.
- `POST /push/suscripciones` solo acepta endpoints `https` de los servicios oficiales de push (Google FCM, Mozilla, Apple, Microsoft); cualquier otro → `400 VALIDACION`. Registrar el mismo navegador dos veces no duplica; si otro usuario inicia sesión en ese navegador, la suscripción pasa a ser suya.
- Las suscripciones vencidas (el usuario desinstaló la app o quitó el permiso) se borran solas.
- Payload del Web Push:
  ```json
  { "titulo": "FixIt", "mensaje": "Tu incidencia pasó a En proceso", "url": "/incidencias/<id>" }
  ```
- El frontend actualiza la campanita con polling cada 30 segundos (`GET /notificaciones`).

---

## 3. Cuentas de demo (las crea el seed del backend)

Contraseña de todas: `FixIt2026!`

| Edificio | Rol | Email |
|---|---|---|
| Residencial Los Olivos | administrador | `admin@olivos.demo` |
| Residencial Los Olivos | mantenimiento | `tecnico1@olivos.demo`, `tecnico2@olivos.demo` |
| Residencial Los Olivos | residente | `residente1@olivos.demo`, `residente2@olivos.demo` |
| Torre San Borja | administrador | `admin@sanborja.demo` |
| Torre San Borja | residente | `residente1@sanborja.demo` |

El segundo edificio sirve para probar el aislamiento: un usuario de San Borja **nunca** debe ver incidencias de Los Olivos.

**Datos de demo:** el seed crea 12 incidencias en Los Olivos (7 resueltas, 2 en proceso, 3 pendientes, con fechas de los últimos 13 días, historial y avisos) y 1 en San Borja. Así el tablero, el detalle y la campanita tienen datos desde el primer día.

---

## 4. Historial de cambios de este contrato

| Fecha | Cambio |
|---|---|
| 2026-09-24 | Versión inicial |
| 2026-09-25 | `GET /health/db`. Reglas detalladas de transición, concurrencia y asignación (Fase 3) |
| 2026-09-25 | Detalle de la corrección manual y significado de `clasificadoPor` (Fase 4) |
| 2026-09-25 | Avisos al técnico al ser asignado, reglas de suscripción push (Fase 5) |
| 2026-09-26 | URL real de producción, orígenes CORS permitidos y datos de demo |
