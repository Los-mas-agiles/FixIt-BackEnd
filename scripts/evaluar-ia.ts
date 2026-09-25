// Mide la precisión de la clasificación con Gemini sobre un set de descripciones etiquetadas a mano.
// Uso:  npm run ia:evaluar                                  (evalúa todos los modelos de IA_MODELOS con API key)
//       npm run ia:evaluar -- groq:openai/gpt-oss-20b          (solo ese modelo; formato proveedor:modelo)
// Escribe el reporte en docs/EVALUACION_IA.md (evidencia para el Objetivo 4 del TF).
import { readFileSync, writeFileSync } from 'node:fs'
import { env } from '../src/config/env.js'
import { construirPrompt, parsearRespuestaIA } from '../src/domain/clasificacion.js'
import { ErrorProveedorIA } from '../src/lib/ia/errores.js'
import { llamarModelo, parsearModelos, TIMEOUT_CLASIFICACION_MS, type ModeloIA } from '../src/modules/incidencias/clasificador.js'
import type { Prioridad, TipoIncidencia } from '../src/types/models.js'

interface Caso {
  descripcion: string
  tipo: TipoIncidencia
  prioridad: Prioridad
}

interface Resultado {
  caso: Caso
  tipo: TipoIncidencia | null
  prioridad: Prioridad | null
  ms: number
  error: string | null
}

const PAUSA_ENTRE_LLAMADAS_MS = 4500 // el nivel gratuito limita las llamadas por minuto (con 2 s aparecían errores 429)
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

const casos = JSON.parse(readFileSync(new URL('./dataset-clasificacion.json', import.meta.url), 'utf8')) as Caso[]
const argumentos = process.argv.slice(2)
const tieneKey = (m: ModeloIA) => Boolean(m.proveedor === 'gemini' ? env.GEMINI_API_KEY : env.GROQ_API_KEY)
const modelos = parsearModelos(argumentos.length > 0 ? argumentos.join(',') : env.IA_MODELOS).filter(tieneKey)
if (modelos.length === 0) throw new Error('No hay modelos para evaluar (¿falta la API key del proveedor en el .env?)')

async function evaluar(modelo: ModeloIA): Promise<Resultado[]> {
  const resultados: Resultado[] = []
  for (const [i, caso] of casos.entries()) {
    const inicio = Date.now()
    let resultado: Resultado
    try {
      const texto = await llamarModelo(modelo, construirPrompt(caso.descripcion), TIMEOUT_CLASIFICACION_MS)
      const r = parsearRespuestaIA(texto)
      resultado = { caso, tipo: r?.tipo ?? null, prioridad: r?.prioridad ?? null, ms: Date.now() - inicio, error: r ? null : 'respuesta inválida' }
    } catch (error) {
      const detalle = error instanceof ErrorProveedorIA ? `${error.status || 'timeout'}` : 'error'
      resultado = { caso, tipo: null, prioridad: null, ms: Date.now() - inicio, error: detalle }
    }
    resultados.push(resultado)
    const ok = resultado.tipo === caso.tipo && resultado.prioridad === caso.prioridad
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${casos.length}] ${ok ? '✓' : resultado.error ? '!' : '✗'} ${resultado.ms}ms\n`)
    await dormir(PAUSA_ENTRE_LLAMADAS_MS)
  }
  return resultados
}

const pct = (n: number, total: number) => (total === 0 ? '—' : `${((n / total) * 100).toFixed(0)} %`)
function percentil(valores: number[], p: number) {
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))] ?? 0
}

const secciones: string[] = []
const filasResumen: string[] = []

for (const modelo of modelos) {
  const etiqueta = `${modelo.proveedor}:${modelo.modelo}`
  console.log(`\nEvaluando ${etiqueta} (${casos.length} casos)...`)
  const resultados = await evaluar(modelo)
  const respondidos = resultados.filter((r) => !r.error)
  const tipoOk = respondidos.filter((r) => r.tipo === r.caso.tipo).length
  const prioridadOk = respondidos.filter((r) => r.prioridad === r.caso.prioridad).length
  const ambosOk = respondidos.filter((r) => r.tipo === r.caso.tipo && r.prioridad === r.caso.prioridad).length
  const altaReales = resultados.filter((r) => r.caso.prioridad === 'alta')
  const altaDetectadas = altaReales.filter((r) => r.prioridad === 'alta').length
  const latencias = respondidos.map((r) => r.ms)

  filasResumen.push(
    `| \`${etiqueta}\` | ${pct(respondidos.length, casos.length)} | ${pct(tipoOk, respondidos.length)} | ${pct(prioridadOk, respondidos.length)} | ${pct(ambosOk, respondidos.length)} | ${pct(altaDetectadas, altaReales.length)} | ${percentil(latencias, 50)} ms | ${percentil(latencias, 95)} ms |`,
  )

  const errores = resultados.filter((r) => r.error || r.tipo !== r.caso.tipo || r.prioridad !== r.caso.prioridad)
  secciones.push(
    `### \`${etiqueta}\` — casos con diferencias (${errores.length})\n\n` +
      (errores.length === 0
        ? '_Todos los casos coinciden con la etiqueta esperada._\n'
        : '| Descripción | Esperado | IA |\n|---|---|---|\n' +
          errores
            .map((r) => `| ${r.caso.descripcion} | ${r.caso.tipo} / ${r.caso.prioridad} | ${r.error ? `error (${r.error})` : `${r.tipo} / ${r.prioridad}`} |`)
            .join('\n') +
          '\n'),
  )
  console.log(`  → tipo ${pct(tipoOk, respondidos.length)} · prioridad ${pct(prioridadOk, respondidos.length)} · ambos ${pct(ambosOk, respondidos.length)} · respondió ${respondidos.length}/${casos.length}`)
}

const reporte = `# Evaluación de la clasificación con IA

Generado con \`npm run ia:evaluar\` el ${new Date().toISOString().slice(0, 10)} sobre ${casos.length} descripciones etiquetadas a mano (\`scripts/dataset-clasificacion.json\`), con el mismo prompt, esquema y timeout (${TIMEOUT_CLASIFICACION_MS / 1000} s) que usa la API.

| Modelo | Respondió | Tipo correcto | Prioridad correcta | Ambos correctos | Detecta prioridad alta | Latencia p50 | Latencia p95 |
|---|---|---|---|---|---|---|---|
${filasResumen.join('\n')}

- **Respondió:** llamadas que devolvieron una clasificación válida dentro del timeout (el resto caería al modelo de respaldo o al fallback).
- **Detecta prioridad alta:** de las incidencias que realmente son de prioridad alta, cuántas marcó como alta (lo más importante para el Objetivo 2).
- La prioridad tiene una parte subjetiva: parte de las diferencias son casos límite, no errores claros.

${secciones.join('\n')}
## Cómo se protege el Objetivo 4 (100 % clasificado sin intervención manual)

La **disponibilidad** de los niveles gratuitos varía según la hora (el 2026-09-25 Gemini llegó a responder 503 en todos sus modelos a la vez). Para que eso no afecte al Objetivo 4, la API tiene tres capas:

1. **Cadena de modelos** (\`IA_MODELOS\`, en orden): si uno está saturado (503), sin cuota (429), no responde a tiempo o responde algo inválido, se prueba el siguiente, dentro de un máximo total de 8 s.
2. **Proveedores independientes** (Groq y Gemini): la caída de uno no afecta al otro; una API key inválida solo descarta los modelos de ese proveedor.
3. **Reclasificación automática en segundo plano**: si ninguno respondió, la incidencia se guarda con el fallback (\`otros\` / \`media\`, \`clasificadoPor: fallback\`) para no hacer esperar al residente, y la API la vuelve a enviar a la IA automáticamente (al crear otras incidencias o al consultar el tablero, como mucho una vez por minuto). Las que un admin corrigió a mano nunca se tocan.

Para medir el Objetivo 4 en el piloto: \`% clasificado por IA = incidencias con tipoIA registrado / total de incidencias\`.
`

writeFileSync(new URL('../docs/EVALUACION_IA.md', import.meta.url), reporte)
console.log('\nReporte escrito en docs/EVALUACION_IA.md')
