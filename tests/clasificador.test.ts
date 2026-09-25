// Tests del clasificador con Gemini SIMULADO (fetch falso): nunca se gasta cuota real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RespuestaFalsa = { status: number; cuerpo: unknown } | 'colgar'

const respuestaOk = (tipo: string, prioridad: string) => ({
  status: 200,
  cuerpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ tipo, prioridad }) }] } }] },
})
const errorHttp = (status: number, message = 'error') => ({ status, cuerpo: { error: { message } } })

let llamadas: { modelo: string; body: { contents: { parts: { text: string }[] }[]; generationConfig: Record<string, unknown> }; headers: Record<string, string> }[]

/** Configura qué responde "Gemini" en cada llamada, en orden. */
function simularGemini(...respuestas: RespuestaFalsa[]) {
  const cola = [...respuestas]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({
        modelo: url.split('/models/')[1]!.split(':')[0]!,
        body: JSON.parse(init.body as string),
        headers: init.headers as Record<string, string>,
      })
      const respuesta = cola.shift() ?? errorHttp(500)
      if (respuesta === 'colgar') {
        // Nunca responde: solo termina cuando el AbortSignal del timeout lo corta
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))
        })
      }
      return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status })
    }),
  )
}

async function cargarClasificador(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.stubEnv('GEMINI_API_KEY', 'key-de-prueba')
  vi.stubEnv('GEMINI_MODEL', 'modelo-principal')
  vi.stubEnv('GEMINI_MODEL_RESPALDO', 'modelo-respaldo')
  for (const [clave, valor] of Object.entries(env)) vi.stubEnv(clave, valor)
  return (await import('../src/modules/incidencias/clasificador.js')).clasificar
}

beforeEach(() => {
  llamadas = []
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('clasificar (Gemini simulado)', () => {
  it('respuesta válida del modelo principal → clasificadoPor "ia"', async () => {
    simularGemini(respuestaOk('electricidad', 'alta'))
    const clasificar = await cargarClasificador()

    const r = await clasificar('Hay chispas en el tablero del piso 3')
    expect(r).toMatchObject({ tipo: 'electricidad', prioridad: 'alta', clasificadoPor: 'ia', modelo: 'modelo-principal' })
    expect(llamadas).toHaveLength(1)
  })

  it('envía la key en el header (no en la URL), pide JSON con esquema y temperatura 0', async () => {
    simularGemini(respuestaOk('plomeria', 'media'))
    const clasificar = await cargarClasificador()
    await clasificar('Gotea el caño de la cocina')

    const [llamada] = llamadas
    expect(llamada!.headers['x-goog-api-key']).toBe('key-de-prueba')
    expect(llamada!.body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0 })
    expect(llamada!.body.generationConfig['responseSchema']).toBeDefined()
    expect(llamada!.body.contents[0]!.parts[0]!.text).toContain('Gotea el caño de la cocina')
  })

  it.each([
    ['saturado (503)', errorHttp(503, 'high demand')],
    ['sin cuota (429)', errorHttp(429, 'quota')],
    ['respuesta inválida', { status: 200, cuerpo: { candidates: [{ content: { parts: [{ text: '{"tipo":"jardin"}' }] } }] } }],
  ])('principal %s → usa el modelo de respaldo', async (_caso, fallo) => {
    simularGemini(fallo, respuestaOk('ascensor', 'alta'))
    const clasificar = await cargarClasificador()

    const r = await clasificar('El ascensor está detenido entre pisos')
    expect(r).toMatchObject({ tipo: 'ascensor', clasificadoPor: 'ia', modelo: 'modelo-respaldo' })
    expect(llamadas.map((l) => l.modelo)).toEqual(['modelo-principal', 'modelo-respaldo'])
  })

  it('los dos modelos fallan → fallback (otros / media), nunca lanza error', async () => {
    simularGemini(errorHttp(503), errorHttp(500))
    const clasificar = await cargarClasificador()

    const r = await clasificar('Algo pasó en el edificio')
    expect(r).toMatchObject({ tipo: 'otros', prioridad: 'media', clasificadoPor: 'fallback', modelo: null })
  })

  it('error NO reintentable (ej. API key inválida, 400) → fallback directo, sin gastar otra llamada', async () => {
    simularGemini(errorHttp(400, 'API key not valid'))
    const clasificar = await cargarClasificador()

    const r = await clasificar('Fuga de agua en el sótano')
    expect(r.clasificadoPor).toBe('fallback')
    expect(llamadas).toHaveLength(1)
  })

  it('Gemini no responde → corta en el timeout y usa el fallback (no bloquea la creación)', async () => {
    simularGemini('colgar', 'colgar')
    const clasificar = await cargarClasificador()

    const inicio = Date.now()
    const r = await clasificar('Se inundó el estacionamiento', { timeoutMs: 300 })
    expect(r.clasificadoPor).toBe('fallback')
    expect(Date.now() - inicio).toBeLessThan(1500)
    // Con 300 ms no queda tiempo para el respaldo (mínimo 1.5 s): solo se intentó el principal
    expect(llamadas).toHaveLength(1)
  })

  it('sin GEMINI_API_KEY → fallback sin llamar a la API', async () => {
    simularGemini(respuestaOk('plomeria', 'alta'))
    const clasificar = await cargarClasificador({ GEMINI_API_KEY: '' })

    const r = await clasificar('Fuga en el baño')
    expect(r.clasificadoPor).toBe('fallback')
    expect(llamadas).toHaveLength(0)
  })
})
