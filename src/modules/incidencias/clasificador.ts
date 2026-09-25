import { env } from '../../config/env.js'
import {
  CLASIFICACION_FALLBACK,
  construirPrompt,
  parsearRespuestaIA,
  SCHEMA_RESPUESTA_IA,
  type Clasificacion,
} from '../../domain/clasificacion.js'
import { GeminiError, generarJson } from '../../lib/gemini.js'

/** Tiempo máximo TOTAL para clasificar (incluye el reintento con el modelo de respaldo). */
export const TIMEOUT_CLASIFICACION_MS = 8000
/** Si queda menos que esto, no vale la pena intentar con el modelo de respaldo. */
const TIEMPO_MINIMO_REINTENTO_MS = 1500

export interface ResultadoClasificacion extends Clasificacion {
  modelo: string | null
  ms: number
}

/**
 * Clasifica una incidencia con Gemini. NUNCA lanza error:
 * 1. Prueba con el modelo principal (GEMINI_MODEL).
 * 2. Si falla por saturación/cuota/timeout o responde algo inválido, prueba con el de respaldo (GEMINI_MODEL_RESPALDO).
 * 3. Si todo falla o se acaba el tiempo → fallback (otros/media).
 */
export async function clasificar(
  descripcion: string,
  opciones: { timeoutMs?: number } = {},
): Promise<ResultadoClasificacion> {
  const inicio = Date.now()
  const limite = inicio + (opciones.timeoutMs ?? TIMEOUT_CLASIFICACION_MS)
  const modelos = [env.GEMINI_MODEL, env.GEMINI_MODEL_RESPALDO].filter((m): m is string => Boolean(m))
  const prompt = construirPrompt(descripcion)

  if (!env.GEMINI_API_KEY) {
    console.warn('Clasificación IA desactivada: falta GEMINI_API_KEY. Se usa el fallback.')
    return { ...CLASIFICACION_FALLBACK, modelo: null, ms: 0 }
  }

  for (const [i, modelo] of modelos.entries()) {
    const restante = limite - Date.now()
    if (i > 0 && restante < TIEMPO_MINIMO_REINTENTO_MS) break

    try {
      const texto = await generarJson({ modelo, prompt, schema: SCHEMA_RESPUESTA_IA, timeoutMs: restante })
      const resultado = parsearRespuestaIA(texto)
      if (resultado) {
        const ms = Date.now() - inicio
        console.info(JSON.stringify({ evento: 'clasificacion_ia', modelo, ms, ...resultado }))
        return { ...resultado, clasificadoPor: 'ia', modelo, ms }
      }
      console.warn(`Gemini (${modelo}) respondió algo inválido: ${texto.slice(0, 200)}`)
    } catch (error) {
      const detalle = error instanceof GeminiError ? `[${error.status}] ${error.message}` : String(error)
      console.warn(`Gemini (${modelo}) falló: ${detalle}`)
      // Un error no reintentable (ej. API key inválida) afectaría igual al otro modelo
      if (error instanceof GeminiError && !error.esReintentable) break
    }
  }

  const ms = Date.now() - inicio
  console.warn(JSON.stringify({ evento: 'clasificacion_fallback', ms }))
  return { ...CLASIFICACION_FALLBACK, modelo: null, ms }
}
