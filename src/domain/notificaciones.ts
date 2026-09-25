// Textos de las notificaciones y reglas de seguridad de Web Push (funciones puras).
import type { EstadoIncidencia } from '../types/models.js'

const LARGO_MAXIMO_RESUMEN = 40

/** Recorta la descripción para que quepa en una notificación del celular. */
export function resumir(descripcion: string): string {
  const limpia = descripcion.replace(/\s+/g, ' ').trim()
  return limpia.length <= LARGO_MAXIMO_RESUMEN ? limpia : `${limpia.slice(0, LARGO_MAXIMO_RESUMEN - 1).trimEnd()}…`
}

export function mensajeCambioEstado(descripcion: string, estadoNuevo: EstadoIncidencia): string {
  const resumen = resumir(descripcion)
  switch (estadoNuevo) {
    case 'en_proceso':
      return `Tu incidencia "${resumen}" está En proceso: un técnico ya la está atendiendo.`
    case 'resuelto':
      return `Tu incidencia "${resumen}" fue resuelta.`
    case 'pendiente':
      return `Tu incidencia "${resumen}" está Pendiente.`
  }
}

export function mensajeAsignacion(descripcion: string): string {
  return `Te asignaron la incidencia "${resumir(descripcion)}".`
}

// Solo se envían push a los servicios oficiales de los navegadores.
// Si se aceptara cualquier URL, alguien podría usar el servidor para hacer peticiones a donde quisiera (SSRF).
const SERVICIOS_PUSH = [
  'fcm.googleapis.com', // Chrome, Edge en Android, Opera
  'updates.push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari (web.push.apple.com y subdominios)
  'notify.windows.com', // Edge en Windows
]

export function esServicioPushPermitido(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '') return false
  const host = url.hostname.toLowerCase()
  return SERVICIOS_PUSH.some((servicio) => host === servicio || host.endsWith(`.${servicio}`))
}
