import type {
  CambioEstado,
  ClasificadoPor,
  EstadoIncidencia,
  Incidencia,
  IncidenciaDetalle,
  Prioridad,
  TipoIncidencia,
  UsuarioResumen,
} from '../../types/models.js'

const RESUMEN_USUARIO = { select: { id: true, nombre: true } } as const

/** Relaciones que se leen para armar una Incidencia del contrato. */
export const INCLUDE_INCIDENCIA = {
  residente: RESUMEN_USUARIO,
  asignadoA: RESUMEN_USUARIO,
} as const

export const INCLUDE_INCIDENCIA_DETALLE = {
  ...INCLUDE_INCIDENCIA,
  historial: { orderBy: { fecha: 'asc' }, include: { usuario: RESUMEN_USUARIO } },
} as const

interface IncidenciaBD {
  id: string
  edificioId: string
  residente: UsuarioResumen
  descripcion: string
  fotoPath: string | null
  tipo: TipoIncidencia
  prioridad: Prioridad
  clasificadoPor: ClasificadoPor
  estado: EstadoIncidencia
  asignadoA: UsuarioResumen | null
  fechaCreacion: Date
  fechaInicioProceso: Date | null
  fechaResolucion: Date | null
}

interface HistorialBD {
  id: string
  estadoAnterior: EstadoIncidencia | null
  estadoNuevo: EstadoIncidencia
  usuario: UsuarioResumen
  fecha: Date
}

export function aIncidencia(i: IncidenciaBD, fotoUrl: string | null): Incidencia {
  return {
    id: i.id,
    edificioId: i.edificioId,
    residente: { id: i.residente.id, nombre: i.residente.nombre },
    descripcion: i.descripcion,
    fotoUrl,
    tipo: i.tipo,
    prioridad: i.prioridad,
    clasificadoPor: i.clasificadoPor,
    estado: i.estado,
    asignadoA: i.asignadoA ? { id: i.asignadoA.id, nombre: i.asignadoA.nombre } : null,
    fechaCreacion: i.fechaCreacion.toISOString(),
    fechaInicioProceso: i.fechaInicioProceso?.toISOString() ?? null,
    fechaResolucion: i.fechaResolucion?.toISOString() ?? null,
  }
}

export function aCambioEstado(h: HistorialBD): CambioEstado {
  return {
    id: h.id,
    estadoAnterior: h.estadoAnterior,
    estadoNuevo: h.estadoNuevo,
    usuario: { id: h.usuario.id, nombre: h.usuario.nombre },
    fecha: h.fecha.toISOString(),
  }
}

export function aIncidenciaDetalle(i: IncidenciaBD & { historial: HistorialBD[] }, fotoUrl: string | null): IncidenciaDetalle {
  return { ...aIncidencia(i, fotoUrl), historial: i.historial.map(aCambioEstado) }
}
