// Especificación OpenAPI 3.1 de la API (se sirve en /api/openapi.json y se ve en /api/docs con Swagger UI).
// Los cuerpos y los query params se generan desde los MISMOS esquemas Zod que validan cada request, así la
// documentación no se desincroniza. Las respuestas siguen los tipos de src/types/models.ts (CONTRATO_API.md).
import { z } from 'zod'
import { cambiarPasswordSchema, loginSchema } from '../modules/auth/schemas.js'
import {
  asignarSchema,
  cambiarEstadoSchema,
  corregirClasificacionSchema,
  estadoSchema,
  listarIncidenciasSchema,
  prioridadSchema,
  tipoSchema,
} from '../modules/incidencias/schemas.js'
import { cfdSchema, kpisSchema } from '../modules/kpis/schemas.js'
import { borrarSuscripcionSchema, suscripcionSchema } from '../modules/notificaciones/service.js'
import { actualizarUsuarioSchema, crearUsuarioSchema, listarUsuariosSchema, rolSchema } from '../modules/usuarios/schemas.js'

type Json = Record<string, unknown>

/** JSON Schema de un esquema Zod (lo que se ENVÍA), sin los regex larguísimos de los formatos email/fecha. */
function esquema(schema: z.ZodType): Json {
  const limpiar = (valor: unknown): unknown => {
    if (Array.isArray(valor)) return valor.map(limpiar)
    if (!valor || typeof valor !== 'object') return valor
    const { pattern, ...resto } = valor as Json
    const limpio: Json = Object.fromEntries(Object.entries(resto).filter(([k]) => k !== '$schema').map(([k, v]) => [k, limpiar(v)]))
    if (pattern && !limpio.format) limpio.pattern = pattern
    return limpio
  }
  return limpiar(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Json
}

/** Query params a partir de un z.object(). */
function parametrosQuery(schema: z.ZodObject): Json[] {
  const json = esquema(schema) as { properties: Record<string, Json>; required?: string[] }
  return Object.entries(json.properties).map(([name, schema]) => ({ name, in: 'query', required: json.required?.includes(name) ?? false, schema }))
}

const ref = (nombre: string) => ({ $ref: `#/components/schemas/${nombre}` })
const lista = (nombre: string) => ({ type: 'array', items: ref(nombre) })
const idPath = (descripcion: string) => ({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: descripcion })

type Rol = 'R' | 'M' | 'A'
const NOMBRE_ROL: Record<Rol, string> = { R: 'residente', M: 'mantenimiento', A: 'administrador' }

interface Operacion {
  tag: string
  resumen: string
  descripcion?: string
  /** Roles que pueden llamarla; sin roles = pública (sin token) */
  roles?: Rol[]
  query?: z.ZodObject
  path?: Json[]
  body?: z.ZodType
  multipart?: Json
  respuesta: Json
  estado?: 200 | 201
  errores?: (400 | 404 | 409)[]
}

function op({ tag, resumen, descripcion, roles, query, path, body, multipart, respuesta, estado = 200, errores = [] }: Operacion): Json {
  const publica = !roles
  const soloAlgunos = roles && roles.length < 3
  const partes = [descripcion, publica ? 'Pública: no necesita token.' : `**Roles:** ${roles.map((r) => NOMBRE_ROL[r]).join(', ')}.`].filter(Boolean)
  const responses: Json = { [estado]: { description: 'OK', content: { 'application/json': { schema: respuesta } } } }
  for (const codigo of errores) responses[codigo] = { $ref: `#/components/responses/Error${codigo}` }
  if (!publica) responses[401] = { $ref: '#/components/responses/Error401' }
  if (soloAlgunos) responses[403] = { $ref: '#/components/responses/Error403' }
  return {
    tags: [tag],
    summary: resumen,
    description: partes.join('\n\n'),
    ...(publica ? { security: [] } : {}),
    ...(query || path ? { parameters: [...(path ?? []), ...(query ? parametrosQuery(query) : [])] } : {}),
    ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: esquema(body) } } } } : {}),
    ...(multipart ? { requestBody: { required: true, content: { 'multipart/form-data': { schema: multipart } } } } : {}),
    responses,
  }
}

const fecha = { type: 'string', format: 'date-time' }
const fechaNula = { type: ['string', 'null'], format: 'date-time' }
const ok = { type: 'object', properties: { ok: { type: 'boolean', const: true } }, required: ['ok'] }

const SCHEMAS: Record<string, Json> = {
  RolUsuario: esquema(rolSchema),
  TipoIncidencia: esquema(tipoSchema),
  Prioridad: esquema(prioridadSchema),
  EstadoIncidencia: esquema(estadoSchema),
  ClasificadoPor: { type: 'string', enum: ['ia', 'fallback', 'manual'], description: "'ia' = la clasificó la IA · 'fallback' = la IA no respondió y quedó provisional (otros/media), se reclasifica sola · 'manual' = la corrigió un admin" },
  UsuarioResumen: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, nombre: { type: 'string' } }, required: ['id', 'nombre'] },
  Usuario: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      nombre: { type: 'string' },
      email: { type: 'string', format: 'email' },
      rol: ref('RolUsuario'),
      edificioId: { type: 'string', format: 'uuid' },
      edificioNombre: { type: 'string' },
    },
    required: ['id', 'nombre', 'email', 'rol', 'edificioId', 'edificioNombre'],
  },
  Incidencia: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      edificioId: { type: 'string', format: 'uuid' },
      residente: ref('UsuarioResumen'),
      descripcion: { type: 'string' },
      fotoUrl: { type: ['string', 'null'], format: 'uri', description: 'URL firmada, válida ~1 hora. No guardarla.' },
      tipo: ref('TipoIncidencia'),
      prioridad: ref('Prioridad'),
      clasificadoPor: ref('ClasificadoPor'),
      estado: ref('EstadoIncidencia'),
      asignadoA: { anyOf: [ref('UsuarioResumen'), { type: 'null' }] },
      fechaCreacion: fecha,
      fechaInicioProceso: fechaNula,
      fechaResolucion: fechaNula,
    },
    required: ['id', 'edificioId', 'residente', 'descripcion', 'fotoUrl', 'tipo', 'prioridad', 'clasificadoPor', 'estado', 'asignadoA', 'fechaCreacion', 'fechaInicioProceso', 'fechaResolucion'],
  },
  CambioEstado: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      estadoAnterior: { anyOf: [ref('EstadoIncidencia'), { type: 'null' }], description: 'null = creación' },
      estadoNuevo: ref('EstadoIncidencia'),
      usuario: ref('UsuarioResumen'),
      fecha,
    },
    required: ['id', 'estadoAnterior', 'estadoNuevo', 'usuario', 'fecha'],
  },
  IncidenciaDetalle: { allOf: [ref('Incidencia'), { type: 'object', properties: { historial: lista('CambioEstado') }, required: ['historial'] }] },
  KPIs: {
    type: 'object',
    properties: {
      desde: fecha,
      hasta: fecha,
      prioridad: { anyOf: [ref('Prioridad'), { type: 'null' }], description: 'null = todas' },
      cycleTimeHoras: { type: ['number', 'null'], description: 'Promedio de fechaResolucion − fechaInicioProceso de las resueltas en el periodo' },
      leadTimeHoras: { type: ['number', 'null'], description: 'Promedio de fechaResolucion − fechaCreacion de las resueltas en el periodo' },
      wip: { type: 'integer', description: "Incidencias en 'en_proceso' ahora" },
      throughput: { type: 'integer', description: 'Resueltas en el periodo' },
      totalReportadas: { type: 'integer', description: 'Creadas en el periodo' },
      precisionIA: { type: ['number', 'null'], description: '% de las clasificadas por la IA cuyo tipo y prioridad no fueron corregidos' },
      clasificadasPorIA: { type: ['number', 'null'], description: '% de las reportadas que la IA clasificó sola (Objetivo 4)' },
    },
    required: ['desde', 'hasta', 'prioridad', 'cycleTimeHoras', 'leadTimeHoras', 'wip', 'throughput', 'totalReportadas', 'precisionIA', 'clasificadasPorIA'],
  },
  PuntoCFD: {
    type: 'object',
    properties: { fecha: { type: 'string', format: 'date', description: 'Día de Lima' }, pendiente: { type: 'integer' }, en_proceso: { type: 'integer' }, resuelto: { type: 'integer' } },
    required: ['fecha', 'pendiente', 'en_proceso', 'resuelto'],
  },
  Notificacion: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' }, incidenciaId: { type: 'string', format: 'uuid' }, mensaje: { type: 'string' }, leida: { type: 'boolean' }, fecha },
    required: ['id', 'incidenciaId', 'mensaje', 'leida', 'fecha'],
  },
  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', enum: ['VALIDACION', 'NO_AUTENTICADO', 'PROHIBIDO', 'NO_ENCONTRADO', 'TRANSICION_INVALIDA', 'LIMITE_WIP', 'INTERNO'] },
          message: { type: 'string', description: 'Legible, en español: se puede mostrar al usuario' },
          details: { description: 'En errores de validación: los campos con problemas' },
        },
        required: ['code', 'message'],
      },
    },
    required: ['error'],
  },
}

const error = (descripcion: string, code: string, message: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: ref('Error'), example: { error: { code, message } } } },
})

/** operationId legible a partir del método y la ruta: PATCH /incidencias/{id}/estado → patchIncidenciasIdEstado */
function conOperationIds(paths: Record<string, Record<string, Json>>) {
  const camel = (texto: string) => texto.replace(/[{}]/g, '').split(/[/-]/).filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
  for (const [ruta, operaciones] of Object.entries(paths)) {
    for (const [metodo, operacion] of Object.entries(operaciones)) operacion.operationId = metodo + camel(ruta)
  }
  return paths
}

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'FixIt API',
    version: '1.0.0',
    description: [
      'API de **FixIt**: gestión de incidencias de mantenimiento en edificios residenciales (curso de Ágiles 1ASI570, UPC).',
      '**Cómo probarla:** ejecuta `POST /auth/login` con una cuenta de demo, copia el `token` de la respuesta, pulsa **Authorize** y pégalo. Contraseña de todas las cuentas de demo: `FixIt2026!`',
      '| Rol | Cuenta |\n|---|---|\n| Administrador | `admin@olivos.demo` |\n| Mantenimiento | `tecnico1@olivos.demo`, `tecnico2@olivos.demo` |\n| Residente | `residente1@olivos.demo`, `residente2@olivos.demo` |\n| Otro edificio (aislamiento) | `admin@sanborja.demo`, `residente1@sanborja.demo` |',
      'Cada usuario solo accede a los datos de **su edificio**: un recurso de otro edificio responde `404`. El contrato completo está en `docs/CONTRATO_API.md` del repositorio.',
    ].join('\n\n'),
  },
  servers: [{ url: '/api', description: 'Este servidor' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Salud', description: 'Estado de la API y de la base de datos' },
    { name: 'Autenticación', description: 'HU6: inicio de sesión con roles' },
    { name: 'Usuarios', description: 'Administración de cuentas del edificio' },
    { name: 'Incidencias', description: 'HU1 reporte con foto, HU2 clasificación con IA, HU3 tablero Kanban' },
    { name: 'KPIs', description: 'HU5: panel de indicadores y CFD' },
    { name: 'Notificaciones', description: 'HU4: avisos en la app' },
    { name: 'Push', description: 'HU4: notificaciones push del navegador' },
  ],
  paths: conOperationIds({
    '/health': { get: op({ tag: 'Salud', resumen: 'La API está arriba', respuesta: ok }) },
    '/health/db': {
      get: op({ tag: 'Salud', resumen: 'La API llega a la base de datos', respuesta: { type: 'object', properties: { ok: { type: 'boolean' }, db: { type: 'string', const: 'up' } } } }),
    },
    '/auth/login': {
      post: op({
        tag: 'Autenticación',
        resumen: 'Iniciar sesión',
        descripcion: 'Devuelve un JWT válido por 7 días. Credenciales incorrectas → `401` "Correo o contraseña incorrectos".',
        body: loginSchema,
        respuesta: { type: 'object', properties: { token: { type: 'string' }, usuario: ref('Usuario') }, required: ['token', 'usuario'] },
        errores: [400],
      }),
    },
    '/auth/me': { get: op({ tag: 'Autenticación', resumen: 'Usuario de la sesión', roles: ['R', 'M', 'A'], respuesta: ref('Usuario') }) },
    '/auth/password': {
      patch: op({
        tag: 'Autenticación',
        resumen: 'Cambiar la contraseña propia',
        descripcion: 'Si la contraseña actual no coincide → `400` (no `401`, para no cerrar la sesión). La nueva debe ser distinta de la actual.',
        roles: ['R', 'M', 'A'],
        body: cambiarPasswordSchema,
        respuesta: ok,
        errores: [400],
      }),
    },
    '/usuarios': {
      get: op({ tag: 'Usuarios', resumen: 'Usuarios del edificio', descripcion: 'Solo los activos; con `inactivos=true`, solo los desactivados.', roles: ['A'], query: listarUsuariosSchema, respuesta: lista('Usuario'), errores: [400] }),
      post: op({ tag: 'Usuarios', resumen: 'Crear usuario', descripcion: 'Se crea en el edificio del admin. Email duplicado → `400`.', roles: ['A'], body: crearUsuarioSchema, respuesta: ref('Usuario'), estado: 201, errores: [400] }),
    },
    '/usuarios/{id}': {
      patch: op({
        tag: 'Usuarios',
        resumen: 'Desactivar, reactivar o asignar contraseña temporal',
        descripcion: '`activo: false` cierra su sesión al instante y borra sus suscripciones push. El admin no puede desactivarse a sí mismo.',
        roles: ['A'],
        path: [idPath('Id del usuario')],
        body: actualizarUsuarioSchema,
        respuesta: ref('Usuario'),
        errores: [400, 404],
      }),
    },
    '/incidencias': {
      post: op({
        tag: 'Incidencias',
        resumen: 'Reportar incidencia',
        descripcion: 'La IA clasifica tipo y prioridad en el mismo request (1–8 s). Si no responde, queda como `fallback` (otros/media) y se reclasifica sola después.',
        roles: ['R'],
        multipart: {
          type: 'object',
          properties: {
            descripcion: { type: 'string', minLength: 10, maxLength: 1000 },
            foto: { type: 'string', format: 'binary', description: 'Opcional: JPG, PNG o WebP de hasta 4 MB' },
          },
          required: ['descripcion'],
        },
        respuesta: ref('Incidencia'),
        estado: 201,
        errores: [400],
      }),
      get: op({
        tag: 'Incidencias',
        resumen: 'Listar incidencias',
        descripcion: 'Las más recientes primero. El residente solo ve las suyas. `asignadoA=me` filtra las del técnico de la sesión.',
        roles: ['R', 'M', 'A'],
        query: listarIncidenciasSchema,
        respuesta: lista('Incidencia'),
        errores: [400],
      }),
    },
    '/incidencias/{id}': {
      get: op({ tag: 'Incidencias', resumen: 'Detalle con historial', roles: ['R', 'M', 'A'], path: [idPath('Id de la incidencia')], respuesta: ref('IncidenciaDetalle'), errores: [404] }),
    },
    '/incidencias/{id}/estado': {
      patch: op({
        tag: 'Incidencias',
        resumen: 'Mover en el tablero',
        descripcion:
          'Solo hacia adelante: pendiente → en_proceso → resuelto. Un técnico que toma una pendiente sin técnico queda asignado. Límite de 3 en proceso por técnico (`409 LIMITE_WIP`). Saltar o retroceder, o que otra persona la haya movido antes → `409 TRANSICION_INVALIDA`. El residente recibe un aviso.',
        roles: ['M', 'A'],
        path: [idPath('Id de la incidencia')],
        body: cambiarEstadoSchema,
        respuesta: ref('Incidencia'),
        errores: [400, 404, 409],
      }),
    },
    '/incidencias/{id}/asignacion': {
      patch: op({
        tag: 'Incidencias',
        resumen: 'Asignar o quitar técnico',
        descripcion: 'El técnico debe ser de mantenimiento, activo y del mismo edificio. `null` quita el técnico (solo si está pendiente). El técnico recibe un aviso.',
        roles: ['A'],
        path: [idPath('Id de la incidencia')],
        body: asignarSchema,
        respuesta: ref('Incidencia'),
        errores: [400, 404, 409],
      }),
    },
    '/incidencias/{id}/clasificacion': {
      patch: op({
        tag: 'Incidencias',
        resumen: 'Corregir la clasificación de la IA',
        descripcion: "Cambia `clasificadoPor` a 'manual'. Cuenta para la precisión de la IA en los KPIs.",
        roles: ['A'],
        path: [idPath('Id de la incidencia')],
        body: corregirClasificacionSchema,
        respuesta: ref('Incidencia'),
        errores: [400, 404],
      }),
    },
    '/kpis': {
      get: op({
        tag: 'KPIs',
        resumen: 'Indicadores del edificio',
        descripcion: 'Por defecto, los últimos 7 días y todas las prioridades. El Objetivo 2 se mide con `prioridad=alta` → `cycleTimeHoras < 48`. Periodo máximo: 366 días.',
        roles: ['A'],
        query: kpisSchema,
        respuesta: ref('KPIs'),
        errores: [400],
      }),
    },
    '/kpis/cfd': {
      get: op({ tag: 'KPIs', resumen: 'Diagrama de flujo acumulado', descripcion: 'Un punto por día de Lima (por defecto, los últimos 14 días).', roles: ['A'], query: cfdSchema, respuesta: lista('PuntoCFD'), errores: [400] }),
    },
    '/notificaciones': {
      get: op({ tag: 'Notificaciones', resumen: 'Mis avisos', descripcion: 'Los últimos 50, del más nuevo al más viejo.', roles: ['R', 'M', 'A'], respuesta: lista('Notificacion') }),
    },
    '/notificaciones/{id}/leida': {
      patch: op({ tag: 'Notificaciones', resumen: 'Marcar un aviso como leído', roles: ['R', 'M', 'A'], path: [idPath('Id del aviso')], respuesta: ref('Notificacion'), errores: [404] }),
    },
    '/notificaciones/leer-todas': {
      post: op({ tag: 'Notificaciones', resumen: 'Marcar todos como leídos', roles: ['R', 'M', 'A'], respuesta: ok }),
    },
    '/push/vapid-public-key': {
      get: op({ tag: 'Push', resumen: 'Clave pública VAPID', descripcion: 'Para `pushManager.subscribe()` en el navegador.', roles: ['R', 'M', 'A'], respuesta: { type: 'object', properties: { publicKey: { type: ['string', 'null'] } }, required: ['publicKey'] } }),
    },
    '/push/suscripciones': {
      post: op({
        tag: 'Push',
        resumen: 'Guardar la suscripción del navegador',
        descripcion: 'Lo que devuelve `subscription.toJSON()`. Solo se aceptan los servicios oficiales de push (Google, Mozilla, Apple, Microsoft).',
        roles: ['R', 'M', 'A'],
        body: suscripcionSchema,
        respuesta: ok,
        estado: 201,
        errores: [400],
      }),
      delete: op({ tag: 'Push', resumen: 'Borrar la suscripción del navegador', roles: ['R', 'M', 'A'], body: borrarSuscripcionSchema, respuesta: ok, errores: [400] }),
    },
   }),
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'El `token` que devuelve POST /auth/login' } },
    schemas: SCHEMAS,
    responses: {
      Error400: error('Datos inválidos', 'VALIDACION', 'La descripción debe tener al menos 10 caracteres'),
      Error401: error('Sin sesión o token vencido', 'NO_AUTENTICADO', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.'),
      Error403: error('El rol no tiene permiso', 'PROHIBIDO', 'No tienes permiso para realizar esta acción'),
      Error404: error('No existe o es de otro edificio', 'NO_ENCONTRADO', 'Incidencia no encontrada'),
      Error409: error('Conflicto con el estado del tablero (TRANSICION_INVALIDA o LIMITE_WIP)', 'LIMITE_WIP', 'Ya tienes 3 incidencias en proceso. Resuelve una antes de tomar otra.'),
    },
  },
}
