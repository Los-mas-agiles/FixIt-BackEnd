import { env } from '../../config/env.js'
import {
  CLASIFICACION_FALLBACK,
  construirPrompt,
  parsearRespuestaIA,
  SCHEMA_RESPUESTA_GEMINI,
  SCHEMA_RESPUESTA_JSON,
  type Clasificacion,
} from '../../domain/clasificacion.js'
import { ErrorProveedorIA, type ProveedorIA } from '../../lib/ia/errores.js'
import { generarJsonGemini } from '../../lib/ia/gemini.js'
import { generarJsonGroq } from '../../lib/ia/groq.js'

/** Tiempo máximo TOTAL para clasificar (incluye los reintentos con otros modelos). */
export const TIMEOUT_CLASIFICACION_MS = 8000
/** Máximo por modelo: si uno se cuelga, deja tiempo para que responda el siguiente de la cadena. */
export const TIMEOUT_POR_MODELO_MS = 4000
/** Si queda menos que esto, no vale la pena intentar con el siguiente modelo. */
const TIEMPO_MINIMO_REINTENTO_MS = 1500

export interface ModeloIA {
  proveedor: ProveedorIA
  modelo: string
}

export interface ResultadoClasificacion extends Clasificacion {
  /** "proveedor:modelo" que respondió, o null si se usó el fallback */
  modelo: string | null
  ms: number
}

const PROVEEDORES: ProveedorIA[] = ['gemini', 'groq']

/** "groq:openai/gpt-oss-20b,gemini:gemini-3.5-flash-lite" → [{ proveedor, modelo }, ...] (ignora entradas inválidas) */
export function parsearModelos(texto: string): ModeloIA[] {
  return texto
    .split(',')
    .map((entrada) => entrada.trim())
    .flatMap((entrada) => {
      const separador = entrada.indexOf(':')
      const proveedor = entrada.slice(0, separador) as ProveedorIA
      const modelo = entrada.slice(separador + 1).trim()
      return separador > 0 && modelo && PROVEEDORES.includes(proveedor) ? [{ proveedor, modelo }] : []
    })
}

const tieneKey = (proveedor: ProveedorIA) => Boolean(proveedor === 'gemini' ? env.GEMINI_API_KEY : env.GROQ_API_KEY)
const nombre = (m: ModeloIA) => `${m.proveedor}:${m.modelo}`

/** Llama a un modelo concreto y devuelve el texto crudo de su respuesta. */
export function llamarModelo(m: ModeloIA, prompt: string, timeoutMs: number): Promise<string> {
  return m.proveedor === 'gemini'
    ? generarJsonGemini({ modelo: m.modelo, prompt, schema: SCHEMA_RESPUESTA_GEMINI, timeoutMs })
    : generarJsonGroq({ modelo: m.modelo, prompt, schema: SCHEMA_RESPUESTA_JSON, timeoutMs })
}

/**
 * Clasifica una incidencia con IA. NUNCA lanza error:
 * prueba en orden los modelos de IA_MODELOS (saltando los proveedores sin API key) hasta que uno
 * responda algo válido dentro del tiempo total. Si ninguno lo logra → fallback (otros / media).
 */
export async function clasificar(
  descripcion: string,
  opciones: { timeoutMs?: number; timeoutPorModeloMs?: number } = {},
): Promise<ResultadoClasificacion> {
  const inicio = Date.now()
  const limite = inicio + (opciones.timeoutMs ?? TIMEOUT_CLASIFICACION_MS)
  const maximoPorModelo = opciones.timeoutPorModeloMs ?? TIMEOUT_POR_MODELO_MS
  const modelos = parsearModelos(env.IA_MODELOS).filter((m) => tieneKey(m.proveedor))
  const prompt = construirPrompt(descripcion)
  const proveedoresDescartados = new Set<ProveedorIA>()

  if (modelos.length === 0) {
    console.warn('Clasificación IA desactivada: no hay API key de ningún proveedor de IA_MODELOS. Se usa el fallback.')
    return { ...CLASIFICACION_FALLBACK, modelo: null, ms: 0 }
  }

  for (const [i, m] of modelos.entries()) {
    if (proveedoresDescartados.has(m.proveedor)) continue
    const restante = limite - Date.now()
    if (restante <= 0 || (i > 0 && restante < TIEMPO_MINIMO_REINTENTO_MS)) break

    try {
      // El último modelo puede usar todo el tiempo que queda; los anteriores, como mucho maximoPorModelo
      const esUltimo = modelos.slice(i + 1).every((sig) => proveedoresDescartados.has(sig.proveedor))
      const texto = await llamarModelo(m, prompt, esUltimo ? restante : Math.min(restante, maximoPorModelo))
      const resultado = parsearRespuestaIA(texto)
      if (resultado) {
        const ms = Date.now() - inicio
        console.info(JSON.stringify({ evento: 'clasificacion_ia', modelo: nombre(m), ms, ...resultado }))
        return { ...resultado, clasificadoPor: 'ia', modelo: nombre(m), ms }
      }
      console.warn(`IA (${nombre(m)}) respondió algo inválido: ${texto.slice(0, 200)}`)
    } catch (error) {
      const detalle = error instanceof ErrorProveedorIA ? `[${error.status}] ${error.message}` : String(error)
      console.warn(`IA (${nombre(m)}) falló: ${detalle}`)
      // Un error no reintentable (ej. API key inválida) afecta a todos los modelos de ESE proveedor, no a los demás
      if (error instanceof ErrorProveedorIA && !error.esReintentable) proveedoresDescartados.add(m.proveedor)
    }
  }

  const ms = Date.now() - inicio
  console.warn(JSON.stringify({ evento: 'clasificacion_fallback', ms }))
  return { ...CLASIFICACION_FALLBACK, modelo: null, ms }
}
