// Genera los números de las 3 situaciones críticas del TF (5.2 y 5.3) simulando el flujo del tablero.
// Uso:  npm run escenarios            (200 simulaciones por escenario)
//       npm run escenarios -- 50      (otra cantidad de simulaciones)
// Escribe docs/ESCENARIOS_CRITICOS.md y un CFD por escenario en docs/escenarios/*.svg.
// Usa las mismas funciones de KPIs y CFD que el panel del administrador (src/domain/kpis.ts).
import { mkdirSync, writeFileSync } from 'node:fs'
import { calcularCfd, calcularKpis, diaLima, type IncidenciaKpi } from '../src/domain/kpis.js'
import { cfdSvg } from './lib/cfd-svg.js'
import { ESCENARIOS, HORAS, INICIO_CRISIS, type Escenario } from './escenarios/escenarios.js'
import { crearAzar, LIMITE_WIP, PASO_H, simular, type IncidenciaSimulada, type ResultadoSimulacion } from './escenarios/simulador.js'

const SIMULACIONES = Number(process.argv[2] ?? 200)
/** Fecha ficticia de inicio (00:00 de Lima de un lunes): solo sirve para convertir horas en fechas. */
const BASE = Date.parse('2026-10-05T05:00:00Z')
const fecha = (h: number) => new Date(BASE + h * 3_600_000)
const PERIODO = { desde: fecha(INICIO_CRISIS), hasta: fecha(HORAS) }
const DIAS_PERIODO = (HORAS - INICIO_CRISIS) / 24

function aKpi(i: IncidenciaSimulada): IncidenciaKpi {
  return {
    prioridad: i.prioridad,
    estado: i.fin !== null ? 'resuelto' : i.inicio !== null ? 'en_proceso' : 'pendiente',
    tipo: i.tipo,
    tipoIA: i.tipo,
    prioridadIA: i.prioridad,
    fechaCreacion: fecha(i.t),
    fechaInicioProceso: i.inicio === null ? null : fecha(i.inicio),
    fechaResolucion: i.fin === null ? null : fecha(i.fin),
  }
}

interface Metricas {
  cycleTime: number | null
  cycleTimeAlta: number | null
  leadTime: number | null
  leadTimeAlta: number | null
  wipPromedio: number
  wipPico: number
  throughputDia: number
  reportadas: number
  pendientesAlCierre: number
}

function medir(r: ResultadoSimulacion): Metricas {
  const incidencias = r.incidencias.map(aKpi)
  const todas = calcularKpis(incidencias, PERIODO, null)
  const alta = calcularKpis(incidencias, PERIODO, 'alta')
  const wip = r.wip.slice(INICIO_CRISIS / PASO_H)
  return {
    cycleTime: todas.cycleTimeHoras,
    cycleTimeAlta: alta.cycleTimeHoras,
    leadTime: todas.leadTimeHoras,
    leadTimeAlta: alta.leadTimeHoras,
    wipPromedio: wip.reduce((a, b) => a + b, 0) / wip.length,
    wipPico: Math.max(...wip),
    throughputDia: todas.throughput / DIAS_PERIODO,
    reportadas: todas.totalReportadas,
    pendientesAlCierre: incidencias.filter((i) => i.estado === 'pendiente').length,
  }
}

function promedio(lista: Metricas[]): Metricas {
  const prom = (f: (m: Metricas) => number | null) => {
    const v = lista.map(f).filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  return {
    cycleTime: prom((m) => m.cycleTime),
    cycleTimeAlta: prom((m) => m.cycleTimeAlta),
    leadTime: prom((m) => m.leadTime),
    leadTimeAlta: prom((m) => m.leadTimeAlta),
    wipPromedio: prom((m) => m.wipPromedio)!,
    wipPico: prom((m) => m.wipPico)!,
    throughputDia: prom((m) => m.throughputDia)!,
    reportadas: prom((m) => m.reportadas)!,
    pendientesAlCierre: prom((m) => m.pendientesAlCierre)!,
  }
}

function correr(escenario: Escenario, semilla: number) {
  const { llegadas, tecnicos } = escenario.generar(crearAzar(semilla))
  return simular(llegadas, tecnicos, HORAS)
}

// ---------- Reporte ----------
const f1 = (n: number | null) => (n === null ? '—' : n.toFixed(1).replace('.', ','))
const h1 = (n: number | null) => (n === null ? '—' : `${f1(n)} h`)

const resultados = ESCENARIOS.map((escenario) => {
  const metricas = promedio(Array.from({ length: SIMULACIONES }, (_, k) => medir(correr(escenario, k + 1))))
  const muestra = correr(escenario, 1)
  const cfd = calcularCfd(muestra.incidencias.map(aKpi), { desde: fecha(0), hasta: fecha(HORAS - 0.01) })
  return { escenario, metricas, cfd }
})

mkdirSync(new URL('../docs/escenarios/', import.meta.url), { recursive: true })
for (const { escenario, cfd } of resultados) {
  writeFileSync(
    new URL(`../docs/escenarios/cfd-${escenario.id}.svg`, import.meta.url),
    cfdSvg(cfd, { titulo: escenario.nombre, sombrearDesde: INICIO_CRISIS / 24, pieEje: 'Día (la zona sombreada es la semana de la crisis)' }),
  )
}

const fila = ({ escenario: e, metricas: m }: (typeof resultados)[number]) => {
  const little = (m.throughputDia / 24) * (m.cycleTime ?? 0)
  return `| ${e.nombre} | ${h1(m.cycleTime)} · alta ${h1(m.cycleTimeAlta)} | ${f1(m.wipPromedio)} promedio · pico ${f1(m.wipPico)} | ${f1(m.throughputDia)} / día | ${f1(little)} | ${h1(m.leadTime)} · alta ${h1(m.leadTimeAlta)} | ${f1(m.pendientesAlCierre)} |`
}
const encabezado = `| Situación | Cycle time (todas · alta) | WIP medido | Throughput | WIP por Little (TH × CT) | Lead time (todas · alta) | Pendientes al cierre |
|---|---|---|---|---|---|---|`
const de = (situacion: Escenario['situacion'], conSolucion: boolean) => resultados.find((r) => r.escenario.situacion === situacion && r.escenario.conSolucion === conSolucion)!
const normal = de('normal', false)

const md = `# Situaciones críticas: cycle time, WIP y throughput

Generado con \`npm run escenarios\` el ${diaLima(new Date())}. Cada fila es el **promedio de ${SIMULACIONES} simulaciones** con distintas semillas (el mismo escenario con y sin solución usa exactamente los mismos reportes, para que la comparación sea justa). Los KPIs se calculan con las mismas funciones que el panel del administrador (\`src/domain/kpis.ts\`), sobre la **semana de la crisis** (días 8 a 14).

## Modelo

- Edificio de ~80 departamentos: unos **3 reportes al día** (85 % entre las 7:00 y las 22:00), 20 % de prioridad alta, 50 % media y 30 % baja.
- **2 técnicos por turnos:** mañana (7:00–15:00) y tarde/guardia (14:00–22:00). Límite de WIP de **${LIMITE_WIP} por técnico**, como en el tablero.
- La cola se atiende por prioridad y luego por antigüedad (el orden del tablero). Una incidencia en proceso primero **espera** (coordinar con el vecino, repuestos o que vuelva la luz) sin ocupar al técnico, y luego necesita **trabajo**: el técnico atiende una a la vez.
- **Cycle time** = fecha de resolución − fecha de inicio; **lead time** = fecha de resolución − fecha de reporte (promedios de las resueltas en la semana). **Throughput** = resueltas por día. **WIP** = incidencias en proceso, promediado en el tiempo.
- **Ley de Little:** WIP = throughput × cycle time (con el throughput en incidencias por hora). Si el WIP calculado así se parece al medido, el sistema está estable; si no, se está acumulando trabajo.

## Resultados (TF 5.2)

${encabezado}
${[normal, de('lluvia', false), de('ausente', false), de('falla', false)].map(fila).join('\n')}

## Con la solución propuesta (TF 5.3)

${encabezado}
${(['lluvia', 'ausente', 'falla'] as const).flatMap((s) => [fila(de(s, false)), fila(de(s, true))]).join('\n')}

## Detalle de cada escenario

${resultados
  .map(
    ({ escenario: e, metricas: m }) => `### ${e.nombre}

${e.contexto}${e.solucion ? `\n\n**Solución:** ${e.solucion}` : ''}

- Reportes en la semana: ${f1(m.reportadas)} · resueltas por día: ${f1(m.throughputDia)} · pendientes al cierre: ${f1(m.pendientesAlCierre)}
- Cycle time: ${h1(m.cycleTime)} (alta: ${h1(m.cycleTimeAlta)}, meta del Objetivo 2: < 48 h) · lead time: ${h1(m.leadTime)} (alta: ${h1(m.leadTimeAlta)})
- WIP: ${f1(m.wipPromedio)} en promedio, pico de ${f1(m.wipPico)} (tope del tablero: ${LIMITE_WIP} por técnico)

![CFD ${e.nombre}](escenarios/cfd-${e.id}.svg)
`,
  )
  .join('\n')}
`
writeFileSync(new URL('../docs/ESCENARIOS_CRITICOS.md', import.meta.url), md)
console.log(`Listo: docs/ESCENARIOS_CRITICOS.md y ${resultados.length} CFD en docs/escenarios/ (${SIMULACIONES} simulaciones por escenario)`)
for (const { escenario: e, metricas: m } of resultados) {
  console.log(`${e.id.padEnd(17)} CT ${h1(m.cycleTime).padStart(7)}  CT alta ${h1(m.cycleTimeAlta).padStart(7)}  WIP ${f1(m.wipPromedio)}/${f1(m.wipPico)}  TH ${f1(m.throughputDia)}/d  LT ${h1(m.leadTime).padStart(7)}  LT alta ${h1(m.leadTimeAlta).padStart(7)}  pend ${f1(m.pendientesAlCierre)}`)
}
