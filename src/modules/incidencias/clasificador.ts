import { CLASIFICACION_FALLBACK, type Clasificacion } from '../../domain/clasificacion.js'

/**
 * Clasifica una incidencia a partir de su descripción.
 * Fase 2: siempre devuelve el fallback. En la Fase 4 (HU2) aquí se llama a Gemini,
 * manteniendo el fallback ante timeout o respuesta inválida.
 */
export async function clasificar(_descripcion: string): Promise<Clasificacion> {
  return CLASIFICACION_FALLBACK
}
