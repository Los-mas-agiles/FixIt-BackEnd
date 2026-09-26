import { describe, expect, it } from 'vitest'
import { calcularCfd, calcularKpis, diaLima, type IncidenciaKpi } from '../src/domain/kpis.js'

const HASTA = new Date('2026-09-25T17:00:00Z') // mediodía en Lima
const DESDE = new Date(HASTA.getTime() - 7 * 86_400_000)
const hace = (horas: number) => new Date(HASTA.getTime() - horas * 3_600_000)

function incidencia(datos: Partial<IncidenciaKpi>): IncidenciaKpi {
  return {
    prioridad: 'media',
    estado: 'pendiente',
    tipo: 'plomeria',
    tipoIA: 'plomeria',
    prioridadIA: datos.prioridad ?? 'media',
    fechaCreacion: hace(1),
    fechaInicioProceso: null,
    fechaResolucion: null,
    ...datos,
  }
}

// Datos conocidos para comprobar los KPIs "a mano"
const DATOS = [
  // A: alta, resuelta en el periodo → cycle 40 h, lead 42 h; la IA acertó
  incidencia({ prioridad: 'alta', prioridadIA: 'alta', estado: 'resuelto', fechaCreacion: hace(50), fechaInicioProceso: hace(48), fechaResolucion: hace(8) }),
  // B: media, resuelta → cycle 10 h, lead 20 h; el admin corrigió el tipo (la IA falló)
  incidencia({ tipo: 'limpieza', tipoIA: 'otros', estado: 'resuelto', fechaCreacion: hace(30), fechaInicioProceso: hace(20), fechaResolucion: hace(10) }),
  // C: baja, en proceso; la IA no respondió (fallback pendiente de reclasificar)
  incidencia({ prioridad: 'baja', tipo: 'otros', tipoIA: null, prioridadIA: null, estado: 'en_proceso', fechaCreacion: hace(5), fechaInicioProceso: hace(2) }),
  // D: alta, pendiente; la IA acertó
  incidencia({ prioridad: 'alta', prioridadIA: 'alta', fechaCreacion: hace(1) }),
  // E: resuelta ANTES del periodo: no cuenta para throughput, cycle time ni reportadas
  incidencia({ estado: 'resuelto', fechaCreacion: hace(300), fechaInicioProceso: hace(290), fechaResolucion: hace(200) }),
]

describe('calcularKpis', () => {
  it('todas las prioridades: coincide con el cálculo manual', () => {
    expect(calcularKpis(DATOS, { desde: DESDE, hasta: HASTA }, null)).toEqual({
      desde: DESDE.toISOString(),
      hasta: HASTA.toISOString(),
      prioridad: null,
      cycleTimeHoras: 25, // (40 + 10) / 2
      leadTimeHoras: 31, // (42 + 20) / 2
      wip: 1, // C
      throughput: 2, // A y B
      totalReportadas: 4, // A, B, C y D
      precisionIA: 66.7, // A y D de 3 clasificadas por la IA (A, B y D)
      clasificadasPorIA: 75, // 3 de 4 reportadas
    })
  })

  it('filtrando prioridad alta (Objetivo 2)', () => {
    expect(calcularKpis(DATOS, { desde: DESDE, hasta: HASTA }, 'alta')).toMatchObject({
      prioridad: 'alta',
      cycleTimeHoras: 40,
      leadTimeHoras: 42,
      wip: 0,
      throughput: 1,
      totalReportadas: 2,
      precisionIA: 100,
      clasificadasPorIA: 100,
    })
  })

  it('sin datos en el periodo: los promedios y porcentajes quedan en null (no en 0)', () => {
    expect(calcularKpis([], { desde: DESDE, hasta: HASTA }, null)).toMatchObject({
      cycleTimeHoras: null,
      leadTimeHoras: null,
      wip: 0,
      throughput: 0,
      totalReportadas: 0,
      precisionIA: null,
      clasificadasPorIA: null,
    })
  })

  it('una corrección que deja los mismos valores de la IA sigue contando como acierto', () => {
    // El admin "corrigió" a plomería / media, que es justo lo que había dicho la IA
    const kpis = calcularKpis([incidencia({ tipo: 'plomeria', tipoIA: 'plomeria', prioridadIA: 'media' })], { desde: DESDE, hasta: HASTA }, null)
    expect(kpis.precisionIA).toBe(100)
  })

  it('redondea a 1 decimal', () => {
    const datos = [
      incidencia({ estado: 'resuelto', fechaCreacion: hace(3), fechaInicioProceso: hace(3), fechaResolucion: hace(2) }), // 1 h
      incidencia({ estado: 'resuelto', fechaCreacion: hace(3), fechaInicioProceso: hace(3), fechaResolucion: hace(2.5) }), // 0,5 h
      incidencia({ estado: 'resuelto', fechaCreacion: hace(3), fechaInicioProceso: hace(3), fechaResolucion: hace(2.5) }), // 0,5 h
    ]
    expect(calcularKpis(datos, { desde: DESDE, hasta: HASTA }, null).cycleTimeHoras).toBe(0.7) // 2 / 3 = 0,666…
  })
})

describe('diaLima', () => {
  it('corta el día a medianoche de Lima (UTC−5)', () => {
    expect(diaLima(new Date('2026-09-25T04:59:59Z'))).toBe('2026-09-24')
    expect(diaLima(new Date('2026-09-25T05:00:00Z'))).toBe('2026-09-25')
  })
})

describe('calcularCfd', () => {
  const X = incidencia({
    fechaCreacion: new Date('2026-09-23T15:00:00Z'), // 23 set, 10:00 en Lima
    fechaInicioProceso: new Date('2026-09-24T03:00:00Z'), // 23 set, 22:00 en Lima
    fechaResolucion: new Date('2026-09-25T04:30:00Z'), // 24 set, 23:30 en Lima
  })
  const Y = incidencia({ fechaCreacion: new Date('2026-09-24T06:00:00Z') }) // 24 set, 01:00 en Lima
  const Z = incidencia({ fechaCreacion: new Date('2026-09-25T16:00:00Z') }) // hoy, antes de 'hasta'
  const W = incidencia({ fechaCreacion: new Date('2026-09-25T18:00:00Z') }) // después de 'hasta'

  it('un punto por día con el estado de cada incidencia al cierre del día (hora de Lima)', () => {
    const periodo = { desde: new Date('2026-09-23T05:00:00Z'), hasta: HASTA }
    expect(calcularCfd([X, Y, Z, W], periodo)).toEqual([
      { fecha: '2026-09-23', pendiente: 0, en_proceso: 1, resuelto: 0 },
      { fecha: '2026-09-24', pendiente: 1, en_proceso: 0, resuelto: 1 },
      { fecha: '2026-09-25', pendiente: 2, en_proceso: 0, resuelto: 1 },
    ])
  })

  it('las resueltas se acumulan: la banda de resueltas nunca baja', () => {
    const puntos = calcularCfd(DATOS, { desde: new Date(HASTA.getTime() - 13 * 86_400_000), hasta: HASTA })
    expect(puntos).toHaveLength(14)
    for (let k = 1; k < puntos.length; k++) expect(puntos[k]!.resuelto).toBeGreaterThanOrEqual(puntos[k - 1]!.resuelto)
    expect(puntos.at(-1)).toMatchObject({ pendiente: 1, en_proceso: 1, resuelto: 3 })
  })
})
