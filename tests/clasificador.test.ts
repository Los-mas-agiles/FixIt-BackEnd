// Tests del clasificador con Gemini y Groq SIMULADOS (fetch falso): nunca se gasta cuota real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RespuestaFalsa = { status: number; cuerpo: unknown } | 'colgar'

const respuestaOk = (tipo: string, prioridad: string) => ({
  status: 200,
  cuerpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ tipo, prioridad }) }] } }] },
})
const respuestaGroqOk = (tipo: string, prioridad: string) => ({
  status: 200,
  cuerpo: { choices: [{ message: { content: JSON.stringify({ tipo, prioridad }) } }] },
})
const errorHttp = (status: number, message = 'error') => ({ status, cuerpo: { error: { message } } })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cuerpo = Record<string, any>
let llamadas: { proveedor: 'gemini' | 'groq'; modelo: string; url: string; body: Cuerpo; headers: Record<string, string> }[]

/** Configura qué responde la IA (Gemini o Groq) en cada llamada, en orden. */
function simularGemini(...respuestas: RespuestaFalsa[]) {
  const cola = [...respuestas]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Cuerpo
      const esGroq = url.includes('api.groq.com')
      llamadas.push({
        proveedor: esGroq ? 'groq' : 'gemini',
        modelo: esGroq ? body['model'] : url.split('/models/')[1]!.split(':')[0]!,
        url,
        body,
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
  vi.stubEnv('GROQ_API_KEY', '')
  vi.stubEnv('IA_MODELOS', 'gemini:modelo-principal,gemini:modelo-respaldo')
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
    expect(r).toMatchObject({ tipo: 'electricidad', prioridad: 'alta', clasificadoPor: 'ia', modelo: 'gemini:modelo-principal' })
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
    expect(r).toMatchObject({ tipo: 'ascensor', clasificadoPor: 'ia', modelo: 'gemini:modelo-respaldo' })
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

describe('cadena de proveedores (Groq + Gemini)', () => {
  const conGroq = (modelos: string) => ({ GROQ_API_KEY: 'groq-key-de-prueba', IA_MODELOS: modelos })

  it('Groq: pide JSON estricto con el esquema, razonamiento bajo y la key como Bearer', async () => {
    simularGemini(respuestaGroqOk('seguridad', 'alta'))
    const clasificar = await cargarClasificador(conGroq('groq:openai/gpt-oss-20b'))

    const r = await clasificar('La puerta principal no cierra')
    expect(r).toMatchObject({ tipo: 'seguridad', prioridad: 'alta', clasificadoPor: 'ia', modelo: 'groq:openai/gpt-oss-20b' })

    const [llamada] = llamadas
    expect(llamada!.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(llamada!.headers['Authorization']).toBe('Bearer groq-key-de-prueba')
    expect(llamada!.body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      reasoning_effort: 'low',
      include_reasoning: false,
      response_format: { type: 'json_schema', json_schema: { name: 'clasificacion', strict: true } },
    })
    expect(llamada!.body['response_format'].json_schema.schema).toMatchObject({ additionalProperties: false, required: ['tipo', 'prioridad'] })
    expect(llamada!.body['messages'][0].content).toContain('La puerta principal no cierra')
  })

  it('Groq con un modelo que no es gpt-oss: usa json_object y no manda parámetros de razonamiento', async () => {
    simularGemini(respuestaGroqOk('limpieza', 'baja'))
    const clasificar = await cargarClasificador(conGroq('groq:llama-3.1-8b-instant'))
    await clasificar('Hay polvo en el lobby')
    expect(llamadas[0]!.body['response_format']).toEqual({ type: 'json_object' })
    expect(llamadas[0]!.body).not.toHaveProperty('reasoning_effort')
  })

  it('si Groq está saturado, pasa a Gemini (otro proveedor)', async () => {
    simularGemini(errorHttp(503), respuestaOk('plomeria', 'alta'))
    const clasificar = await cargarClasificador(conGroq('groq:openai/gpt-oss-20b,gemini:gemini-3.5-flash-lite'))

    const r = await clasificar('Fuga de agua en el pasillo')
    expect(r).toMatchObject({ clasificadoPor: 'ia', modelo: 'gemini:gemini-3.5-flash-lite' })
    expect(llamadas.map((l) => l.proveedor)).toEqual(['groq', 'gemini'])
  })

  it('key de Gemini inválida: se salta el OTRO modelo de Gemini pero sí prueba Groq', async () => {
    simularGemini(errorHttp(400, 'API key not valid'), respuestaGroqOk('ascensor', 'media'))
    const clasificar = await cargarClasificador(conGroq('gemini:modelo-a,gemini:modelo-b,groq:openai/gpt-oss-20b'))

    const r = await clasificar('El ascensor hace ruido')
    expect(r).toMatchObject({ clasificadoPor: 'ia', modelo: 'groq:openai/gpt-oss-20b' })
    expect(llamadas.map((l) => `${l.proveedor}:${l.modelo}`)).toEqual(['gemini:modelo-a', 'groq:openai/gpt-oss-20b'])
  })

  it('se saltan los proveedores sin API key (Groq sin key → directo a Gemini)', async () => {
    simularGemini(respuestaOk('electricidad', 'baja'))
    const clasificar = await cargarClasificador({ IA_MODELOS: 'groq:openai/gpt-oss-20b,gemini:gemini-3.5-flash-lite' })
    const r = await clasificar('Foco quemado')
    expect(r.modelo).toBe('gemini:gemini-3.5-flash-lite')
    expect(llamadas.map((l) => l.proveedor)).toEqual(['gemini'])
  })
})

describe('parsearModelos', () => {
  it('lee "proveedor:modelo" separados por comas e ignora entradas inválidas', async () => {
    const { parsearModelos } = await import('../src/modules/incidencias/clasificador.js')
    expect(parsearModelos(' groq:openai/gpt-oss-20b , gemini:gemini-3.5-flash-lite,openai:gpt-9,sin-proveedor,groq:')).toEqual([
      { proveedor: 'groq', modelo: 'openai/gpt-oss-20b' },
      { proveedor: 'gemini', modelo: 'gemini-3.5-flash-lite' },
    ])
  })
})

describe('límite de tiempo por modelo', () => {
  it('si el primer modelo se cuelga, se corta a los N ms y el siguiente alcanza a responder', async () => {
    simularGemini('colgar', respuestaGroqOk('plomeria', 'alta'))
    vi.resetModules()
    vi.stubEnv('GEMINI_API_KEY', 'key-de-prueba')
    vi.stubEnv('GROQ_API_KEY', 'groq-key-de-prueba')
    vi.stubEnv('IA_MODELOS', 'gemini:gemini-3.5-flash-lite,groq:openai/gpt-oss-20b')
    const { clasificar } = await import('../src/modules/incidencias/clasificador.js')

    const inicio = Date.now()
    const r = await clasificar('Fuga de agua', { timeoutMs: 5000, timeoutPorModeloMs: 300 })
    expect(r).toMatchObject({ clasificadoPor: 'ia', modelo: 'groq:openai/gpt-oss-20b' })
    expect(Date.now() - inicio).toBeLessThan(2000) // no esperó los 5 s completos por Gemini
  })
})
