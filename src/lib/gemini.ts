// Cliente mínimo de la API de Gemini (REST con fetch: sin SDK ni dependencias extra).
import { env } from '../config/env.js'

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiError extends Error {
  constructor(
    message: string,
    /** Código HTTP de Gemini (0 = error de red o timeout) */
    public readonly status: number,
  ) {
    super(message)
    this.name = 'GeminiError'
  }

  /** Saturación, cuota, error del servidor o timeout: vale la pena probar con otro modelo */
  get esReintentable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

interface RespuestaGemini {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

/**
 * Pide a Gemini una respuesta JSON que cumpla `schema` y devuelve el texto crudo.
 * Lanza GeminiError si hay error HTTP, timeout o respuesta vacía.
 */
export async function generarJson(opciones: {
  modelo: string
  prompt: string
  schema: object
  timeoutMs: number
}): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new GeminiError('GEMINI_API_KEY no configurada', 0)

  let res: Response
  try {
    res = await fetch(`${API_URL}/${opciones.modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(opciones.timeoutMs),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: opciones.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: opciones.schema,
          temperature: 0,
        },
      }),
    })
  } catch (error) {
    const esTimeout = error instanceof Error && error.name === 'TimeoutError'
    throw new GeminiError(esTimeout ? `Timeout de ${opciones.timeoutMs} ms` : 'Error de red al llamar a Gemini', 0)
  }

  const cuerpo = (await res.json().catch(() => ({}))) as RespuestaGemini
  if (!res.ok) throw new GeminiError(cuerpo.error?.message ?? `HTTP ${res.status}`, res.status)

  const texto = cuerpo.candidates?.[0]?.content?.parts?.map((parte) => parte.text ?? '').join('')
  if (!texto) throw new GeminiError('Respuesta vacía', res.status)
  return texto
}
