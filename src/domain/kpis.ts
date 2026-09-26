// Cálculo de los KPIs del panel (HU5) y del CFD. Funciones puras: reciben las incidencias ya leídas de la BD.
// Las fechas de cada incidencia son las mismas que se guardan en historial_estados (el servidor escribe
// el mismo timestamp en ambos lados) y el flujo solo avanza, así que el estado de una incidencia en
// cualquier momento se deduce de sus tres fechas.
import type { EstadoIncidencia, KPIs, Prioridad, PuntoCFD } from '../types/models.js'

export interface IncidenciaKpi {
  prioridad: string
  estado: string
  tipo: string
  tipoIA: string | null
  prioridadIA: string | null
  fechaCreacion: Date
  fechaInicioProceso: Date | null
  fechaResolucion: Date | null
}

export interface Periodo {
  desde: Date
  hasta: Date
}

const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS
/** Lima está en UTC−5 todo el año (sin horario de verano): los días del CFD se cortan a medianoche de Lima. */
const DESFASE_LIMA_MS = -5 * HORA_MS

const redondear1 = (n: number) => Math.round(n * 10) / 10
const promedio = (valores: number[]) => (valores.length ? redondear1(valores.reduce((a, b) => a + b, 0) / valores.length) : null)
const porcentaje = (parte: number, total: number) => (total ? redondear1((parte / total) * 100) : null)
const enPeriodo = (fecha: Date | null, { desde, hasta }: Periodo): fecha is Date => fecha !== null && fecha >= desde && fecha <= hasta

/**
 * - cycle time: fechaResolucion − fechaInicioProceso (lo que tarda mantenimiento desde que empieza)
 * - lead time: fechaResolucion − fechaCreacion (lo que espera el residente)
 * Ambos se promedian sobre las incidencias resueltas dentro del periodo.
 */
export function calcularKpis(incidencias: IncidenciaKpi[], periodo: Periodo, prioridad: Prioridad | null): KPIs {
  const lista = prioridad ? incidencias.filter((i) => i.prioridad === prioridad) : incidencias
  const resueltas = lista.filter((i) => enPeriodo(i.fechaResolucion, periodo))
  const reportadas = lista.filter((i) => enPeriodo(i.fechaCreacion, periodo))
  // Las que la IA llegó a clasificar (las de fallback todavía no tienen tipoIA)
  const clasificadasIA = reportadas.filter((i) => i.tipoIA !== null)
  const aciertosIA = clasificadasIA.filter((i) => i.tipo === i.tipoIA && i.prioridad === i.prioridadIA)

  return {
    desde: periodo.desde.toISOString(),
    hasta: periodo.hasta.toISOString(),
    prioridad,
    cycleTimeHoras: promedio(
      resueltas.filter((i) => i.fechaInicioProceso).map((i) => (i.fechaResolucion!.getTime() - i.fechaInicioProceso!.getTime()) / HORA_MS),
    ),
    leadTimeHoras: promedio(resueltas.map((i) => (i.fechaResolucion!.getTime() - i.fechaCreacion.getTime()) / HORA_MS)),
    wip: lista.filter((i) => i.estado === 'en_proceso').length,
    throughput: resueltas.length,
    totalReportadas: reportadas.length,
    precisionIA: porcentaje(aciertosIA.length, clasificadasIA.length),
    clasificadasPorIA: porcentaje(clasificadasIA.length, reportadas.length),
  }
}

/** Día calendario de Lima ('YYYY-MM-DD') al que pertenece un instante. */
export function diaLima(fecha: Date): string {
  return new Date(fecha.getTime() + DESFASE_LIMA_MS).toISOString().slice(0, 10)
}

/** Último milisegundo del día de Lima indicado. */
function finDelDiaLima(dia: string): number {
  return Date.parse(`${dia}T00:00:00.000Z`) - DESFASE_LIMA_MS + DIA_MS - 1
}

function estadoEn(i: IncidenciaKpi, instante: number): EstadoIncidencia | null {
  if (i.fechaResolucion && i.fechaResolucion.getTime() <= instante) return 'resuelto'
  if (i.fechaInicioProceso && i.fechaInicioProceso.getTime() <= instante) return 'en_proceso'
  if (i.fechaCreacion.getTime() <= instante) return 'pendiente'
  return null // todavía no existía
}

/**
 * Diagrama de flujo acumulado: un punto por día (de Lima) con cuántas incidencias había en cada estado
 * al cierre de ese día. El último día se corta en 'hasta' (para hoy, es el estado actual).
 */
export function calcularCfd(incidencias: IncidenciaKpi[], periodo: Periodo): PuntoCFD[] {
  const puntos: PuntoCFD[] = []
  const ultimo = diaLima(periodo.hasta)
  for (let dia = diaLima(periodo.desde); dia <= ultimo; dia = diaLima(new Date(finDelDiaLima(dia) + 1))) {
    const corte = Math.min(finDelDiaLima(dia), periodo.hasta.getTime())
    const punto: PuntoCFD = { fecha: dia, pendiente: 0, en_proceso: 0, resuelto: 0 }
    for (const i of incidencias) {
      const estado = estadoEn(i, corte)
      if (estado) punto[estado]++
    }
    puntos.push(punto)
  }
  return puntos
}
