import type { ClasificadoPor, Prioridad, TipoIncidencia } from '../types/models.js'

export interface Clasificacion {
  tipo: TipoIncidencia
  prioridad: Prioridad
  clasificadoPor: ClasificadoPor
}

/** Se usa cuando la IA falla o no está disponible: una incidencia NUNCA queda sin clasificar (Objetivo 4). */
export const CLASIFICACION_FALLBACK: Clasificacion = {
  tipo: 'otros',
  prioridad: 'media',
  clasificadoPor: 'fallback',
}
