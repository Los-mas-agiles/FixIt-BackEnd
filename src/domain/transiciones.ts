// Reglas del flujo Kanban: Pendiente → En proceso → Resuelto (solo hacia adelante).
// Funciones puras (sin BD ni Express) para poder testear cada caso.
import type { EstadoIncidencia, RolUsuario } from '../types/models.js'

export const SIGUIENTE_ESTADO: Record<EstadoIncidencia, EstadoIncidencia | null> = {
  pendiente: 'en_proceso',
  en_proceso: 'resuelto',
  resuelto: null,
}

export const ETIQUETA_ESTADO: Record<EstadoIncidencia, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
}

export interface Actor {
  id: string
  rol: RolUsuario
}

export interface SolicitudTransicion {
  estadoActual: EstadoIncidencia
  estadoNuevo: EstadoIncidencia
  asignadoAId: string | null
  actor: Actor
}

export type ResultadoTransicion =
  | {
      ok: true
      /** Técnico que queda a cargo (puede ser el actor, si se autoasigna al tomarla) */
      tecnicoId: string
      /** Fecha que se marca con la hora del servidor */
      campoFecha: 'fechaInicioProceso' | 'fechaResolucion'
    }
  | { ok: false; status: 403 | 409; code: 'PROHIBIDO' | 'TRANSICION_INVALIDA'; mensaje: string }

const prohibido = (mensaje: string): ResultadoTransicion => ({ ok: false, status: 403, code: 'PROHIBIDO', mensaje })
const invalida = (mensaje: string): ResultadoTransicion => ({ ok: false, status: 409, code: 'TRANSICION_INVALIDA', mensaje })

export function evaluarTransicion({ estadoActual, estadoNuevo, asignadoAId, actor }: SolicitudTransicion): ResultadoTransicion {
  if (actor.rol === 'residente') return prohibido('No tienes permiso para cambiar el estado de una incidencia')

  if (SIGUIENTE_ESTADO[estadoActual] !== estadoNuevo) {
    if (estadoActual === estadoNuevo) return invalida(`La incidencia ya está en "${ETIQUETA_ESTADO[estadoActual]}"`)
    if (estadoActual === 'resuelto') return invalida('La incidencia ya está resuelta')
    return invalida(`No se puede pasar de "${ETIQUETA_ESTADO[estadoActual]}" a "${ETIQUETA_ESTADO[estadoNuevo]}"`)
  }

  if (estadoNuevo === 'en_proceso') {
    if (actor.rol === 'mantenimiento') {
      if (asignadoAId && asignadoAId !== actor.id) return prohibido('Esta incidencia está asignada a otro técnico')
      return { ok: true, tecnicoId: asignadoAId ?? actor.id, campoFecha: 'fechaInicioProceso' }
    }
    // administrador
    if (!asignadoAId) return invalida('Asigna un técnico antes de pasarla a "En proceso"')
    return { ok: true, tecnicoId: asignadoAId, campoFecha: 'fechaInicioProceso' }
  }

  // en_proceso → resuelto (siempre tiene técnico asignado)
  if (!asignadoAId) return invalida('La incidencia no tiene un técnico asignado')
  if (actor.rol === 'mantenimiento' && asignadoAId !== actor.id) {
    return prohibido('Solo el técnico asignado puede marcarla como resuelta')
  }
  return { ok: true, tecnicoId: asignadoAId, campoFecha: 'fechaResolucion' }
}

/** ¿Tomar una incidencia más haría que el técnico supere su límite de WIP? */
export function superaLimiteWip(enProcesoActuales: number, limite: number): boolean {
  return enProcesoActuales >= limite
}
