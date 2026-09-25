// Cliente mínimo de Groq (API compatible con OpenAI, REST con fetch).
import { env } from '../../config/env.js'
import { ErrorProveedorIA, fetchIA } from './errores.js'

const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

interface RespuestaGroq {
  choices?: { message?: { content?: string | null } }[]
  error?: { message?: string }
}

/** Los modelos gpt-oss de Groq admiten JSON estricto (la respuesta SIEMPRE cumple el esquema) y razonamiento ajustable. */
const esGptOss = (modelo: string) => modelo.startsWith('openai/gpt-oss')

/**
 * Pide a Groq una respuesta JSON que cumpla `schema` (JSON Schema estándar) y devuelve el texto crudo.
 * Lanza ErrorProveedorIA si hay error HTTP, timeout o respuesta vacía.
 */
export async function generarJsonGroq(opciones: { modelo: string; prompt: string; schema: object; timeoutMs: number }): Promise<string> {
  if (!env.GROQ_API_KEY) throw new ErrorProveedorIA('GROQ_API_KEY no configurada', 401, 'groq')

  const gptOss = esGptOss(opciones.modelo)
  const res = await fetchIA(
    'groq',
    API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: opciones.modelo,
        messages: [{ role: 'user', content: opciones.prompt }],
        temperature: 0,
        max_completion_tokens: 400,
        response_format: gptOss
          ? { type: 'json_schema', json_schema: { name: 'clasificacion', strict: true, schema: opciones.schema } }
          : { type: 'json_object' },
        // Clasificar no necesita pensar mucho: razonamiento bajo = respuesta más rápida
        ...(gptOss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
      }),
    },
    opciones.timeoutMs,
  )

  const cuerpo = (await res.json().catch(() => ({}))) as RespuestaGroq
  if (!res.ok) throw new ErrorProveedorIA(cuerpo.error?.message ?? `HTTP ${res.status}`, res.status, 'groq')

  const texto = cuerpo.choices?.[0]?.message?.content
  if (!texto) throw new ErrorProveedorIA('Respuesta vacía', res.status, 'groq')
  return texto
}
