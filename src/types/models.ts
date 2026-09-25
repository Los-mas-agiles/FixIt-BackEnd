// Tipos compartidos con el frontend. COPIA EXACTA de docs/CONTRATO_API.md (sección 1).
// Si cambias algo aquí, cambia primero el contrato y avisa al equipo de frontend.

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
