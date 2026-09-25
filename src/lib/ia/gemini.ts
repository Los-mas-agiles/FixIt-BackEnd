// Cliente mínimo de la API de Gemini (REST con fetch: sin SDK ni dependencias extra).
import { env } from '../../config/env.js'
import { ErrorProveedorIA, fetchIA } from './errores.js'

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface RespuestaGemini {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

/**
 * Pide a Gemini una respuesta JSON que cumpla `schema` (formato de esquema de Gemini) y devuelve el texto crudo.
 * Lanza ErrorProveedorIA si hay error HTTP, timeout o respuesta vacía.
 */
export async function generarJsonGemini(opciones: { modelo: string; prompt: string; schema: object; timeoutMs: number }): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new ErrorProveedorIA('GEMINI_API_KEY no configurada', 401, 'gemini')

  const res = await fetchIA(
    'gemini',
    `${API_URL}/${opciones.modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: opciones.prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: opciones.schema, temperature: 0 },
      }),
    },
    opciones.timeoutMs,
  )

  const cuerpo = (await res.json().catch(() => ({}))) as RespuestaGemini
  if (!res.ok) throw new ErrorProveedorIA(cuerpo.error?.message ?? `HTTP ${res.status}`, res.status, 'gemini')

  const texto = cuerpo.candidates?.[0]?.content?.parts?.map((parte) => parte.text ?? '').join('')
  if (!texto) throw new ErrorProveedorIA('Respuesta vacía', res.status, 'gemini')
  return texto
}
