// Arma el reporte de resultados del piloto (evidencia para el TF: Objetivos 2, 3 y 4 e hipótesis de la sección 2.5).
// Función pura: recibe los datos ya leídos de la BD y devuelve el Markdown y los puntos del CFD.
import { calcularCfd, calcularKpis, diaLima, type IncidenciaKpi, type Periodo } from '../../src/domain/kpis.js'
import type { KPIs, PuntoCFD, RolUsuario } from '../../src/types/models.js'

export interface IncidenciaPiloto extends IncidenciaKpi {
  residenteId: string
  clasificadoPor: 'ia' | 'fallback' | 'manual'
}

export interface DatosPiloto {
  edificio: string
  periodo: Periodo
  incidencias: IncidenciaPiloto[]
  /** Cuentas activas por rol */
  participantes: Record<RolUsuario, number>
  /** Avisos (notificaciones) generados en el periodo */
  avisos: number
  /** Usuarios con al menos un dispositivo suscrito a notificaciones push */
  usuariosConPush: number
  /** Reclamos que siguieron llegando por WhatsApp en el periodo (lo cuenta el administrador) */
  reportesWhatsapp?: number
  generado: Date
}

export const META_CYCLE_TIME_ALTA_H = 48
export const META_ADOPCION = 70
const DIA_MS = 86_400_000

const num = (n: number | null, sufijo = '') => (n === null ? '—' : `${(Math.round(n * 10) / 10).toString().replace('.', ',')}${sufijo}`)
const fechaCorta = (d: Date) => {
  const [a, m, dd] = diaLima(d).split('-')
  return `${dd}/${m}/${a}`
}
const estado = (cumple: boolean | null) => (cumple === null ? 'Sin datos' : cumple ? '✅ Cumple' : '❌ No cumple')

function filaKpis(etiqueta: string, k: KPIs) {
  return `| ${etiqueta} | ${k.totalReportadas} | ${k.throughput} | ${num(k.cycleTimeHoras, ' h')} | ${num(k.leadTimeHoras, ' h')} | ${num(k.precisionIA, ' %')} | ${num(k.clasificadasPorIA, ' %')} |`
}

export function armarReportePiloto(d: DatosPiloto): { markdown: string; cfd: PuntoCFD[] } {
  const { periodo } = d
  const todas = calcularKpis(d.incidencias, periodo, null)
  const alta = calcularKpis(d.incidencias, periodo, 'alta')
  const media = calcularKpis(d.incidencias, periodo, 'media')
  const baja = calcularKpis(d.incidencias, periodo, 'baja')

  const reportadas = d.incidencias.filter((i) => i.fechaCreacion >= periodo.desde && i.fechaCreacion <= periodo.hasta)
  const porResidente = new Map<string, number>()
  for (const i of reportadas) porResidente.set(i.residenteId, (porResidente.get(i.residenteId) ?? 0) + 1)
  const residentesQueReportaron = porResidente.size
  const residentesQueVolvieron = [...porResidente.values()].filter((n) => n >= 2).length
  const clasificacion = { ia: 0, fallback: 0, manual: 0 }
  for (const i of reportadas) clasificacion[i.clasificadoPor]++

  const adopcion = d.reportesWhatsapp === undefined ? null : reportadas.length + d.reportesWhatsapp === 0 ? null : (reportadas.length / (reportadas.length + d.reportesWhatsapp)) * 100
  const totalParticipantes = d.participantes.residente + d.participantes.mantenimiento + d.participantes.administrador
  const objetivo3 = d.participantes.residente > 0 && d.participantes.mantenimiento > 0 && d.participantes.administrador > 0 && totalParticipantes >= 3

  // Semana a semana desde el inicio del piloto
  const semanas: string[] = []
  for (let desde = periodo.desde.getTime(), n = 1; desde < periodo.hasta.getTime(); desde += 7 * DIA_MS, n++) {
    const tramo = { desde: new Date(desde), hasta: new Date(Math.min(desde + 7 * DIA_MS - 1, periodo.hasta.getTime())) }
    const k = calcularKpis(d.incidencias, tramo, null)
    const ka = calcularKpis(d.incidencias, tramo, 'alta')
    semanas.push(`| Semana ${n} (${fechaCorta(tramo.desde)} – ${fechaCorta(tramo.hasta)}) | ${k.totalReportadas} | ${k.throughput} | ${num(k.cycleTimeHoras, ' h')} | ${num(ka.cycleTimeHoras, ' h')} | ${num(k.leadTimeHoras, ' h')} |`)
  }

  const conteo = <T extends string>(valores: T[]) => {
    const mapa = new Map<T, number>()
    for (const v of valores) mapa.set(v, (mapa.get(v) ?? 0) + 1)
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}: ${n}`).join(' · ') || '—'
  }

  const cfd = calcularCfd(d.incidencias, periodo)
  const markdown = `# Resultados del piloto — ${d.edificio}

Generado con \`npm run piloto:reporte\` el ${fechaCorta(d.generado)}. Periodo: **${fechaCorta(periodo.desde)} al ${fechaCorta(periodo.hasta)}** (${num((periodo.hasta.getTime() - periodo.desde.getTime()) / DIA_MS)} días). Los KPIs se calculan con las mismas funciones que el panel del administrador.

## Objetivos del TF

| Objetivo | Meta | Resultado | Estado |
|---|---|---|---|
| **Objetivo 2:** cycle time de prioridad alta | < ${META_CYCLE_TIME_ALTA_H} h | ${num(alta.cycleTimeHoras, ' h')} (${alta.throughput} resueltas) | ${estado(alta.cycleTimeHoras === null ? null : alta.cycleTimeHoras < META_CYCLE_TIME_ALTA_H)} |
| **Objetivo 3:** validar con usuarios de los 3 roles | ≥ 3 usuarios, al menos 1 por rol | ${d.participantes.residente} residentes, ${d.participantes.mantenimiento} de mantenimiento, ${d.participantes.administrador} administrador(es) | ${estado(objetivo3)} |
| **Objetivo 4:** incidencias clasificadas por la IA sin intervención | 100 % | ${num(todas.clasificadasPorIA, ' %')} (${clasificacion.fallback} quedaron con clasificación provisional) | ${estado(todas.clasificadasPorIA === null ? null : todas.clasificadasPorIA >= 100)} |
| **Hipótesis de valor (2.5):** reportes que llegan por FixIt y no por WhatsApp | ≥ ${META_ADOPCION} % | ${adopcion === null ? 'Falta el conteo de WhatsApp (usa --whatsapp N)' : `${num(adopcion, ' %')} (${reportadas.length} por FixIt, ${d.reportesWhatsapp} por WhatsApp)`} | ${estado(adopcion === null ? null : adopcion >= META_ADOPCION)} |

## KPIs del periodo

| Prioridad | Reportadas | Resueltas | Cycle time | Lead time | Precisión IA | Clasificadas por IA |
|---|---|---|---|---|---|---|
${filaKpis('Todas', todas)}
${filaKpis('Alta', alta)}
${filaKpis('Media', media)}
${filaKpis('Baja', baja)}

- **WIP al cierre:** ${todas.wip} incidencias en proceso.
- **Throughput:** ${num(todas.throughput / Math.max((periodo.hasta.getTime() - periodo.desde.getTime()) / DIA_MS, 1))} resueltas por día.

## Semana a semana

| Semana | Reportadas | Resueltas | Cycle time | Cycle time alta | Lead time |
|---|---|---|---|---|---|
${semanas.join('\n')}

## Uso y adopción

- **Residentes que reportaron:** ${residentesQueReportaron} de ${d.participantes.residente} · **volvieron a reportar (2 o más veces):** ${residentesQueVolvieron}${residentesQueReportaron ? ` (${num((residentesQueVolvieron / residentesQueReportaron) * 100, ' %')})` : ''}
- **Por tipo:** ${conteo(reportadas.map((i) => i.tipo))}
- **Por prioridad:** ${conteo(reportadas.map((i) => i.prioridad))}
- **Clasificación:** ${clasificacion.ia} por la IA · ${clasificacion.manual} corregidas por el administrador · ${clasificacion.fallback} provisionales
- **Avisos enviados:** ${d.avisos} · **usuarios con notificaciones push activas:** ${d.usuariosConPush} de ${totalParticipantes}

## Flujo acumulado (CFD)

![CFD del piloto](piloto/cfd-piloto.svg)
`
  return { markdown, cfd }
}
