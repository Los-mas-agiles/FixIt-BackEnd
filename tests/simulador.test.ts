import { describe, expect, it } from 'vitest'
import { ESCENARIOS, HORAS } from '../scripts/escenarios/escenarios.js'
import { crearAzar, LIMITE_WIP, simular, turno, type Llegada, type Tecnico } from '../scripts/escenarios/simulador.js'

const siempre = () => true
const llegada = (datos: Partial<Llegada>): Llegada => ({ t: 0, prioridad: 'media', tipo: 'otros', descripcion: 'x', espera: 0, trabajo: 1, ...datos })
const correr = (id: string, semilla = 1) => {
  const { llegadas, tecnicos } = ESCENARIOS.find((e) => e.id === id)!.generar(crearAzar(semilla))
  return { resultado: simular(llegadas, tecnicos, HORAS), llegadas, tecnicos }
}

describe('simulador de escenarios', () => {
  it('es reproducible: la misma semilla da el mismo resultado', () => {
    expect(correr('lluvia', 7).resultado).toEqual(correr('lluvia', 7).resultado)
    expect(correr('lluvia', 7).resultado).not.toEqual(correr('lluvia', 8).resultado)
  })

  it.each(ESCENARIOS.map((e) => e.id))('%s: ningún técnico supera el límite de WIP y las fechas son coherentes', (id) => {
    const { resultado, llegadas, tecnicos } = correr(id)
    expect(resultado.incidencias).toHaveLength(llegadas.length)
    for (const i of resultado.incidencias) {
      if (i.inicio !== null) expect(i.inicio).toBeGreaterThanOrEqual(i.t)
      if (i.fin !== null) expect(i.fin).toBeGreaterThanOrEqual(i.inicio!)
    }
    // El WIP en cada instante nunca supera el tope de cada técnico (los reportes agrupados no ocupan a nadie)
    for (const tecnico of tecnicos) {
      const suyas = resultado.incidencias.filter((i) => i.tecnico === tecnico.nombre && i.agrupadaEn === undefined && i.inicio !== null)
      for (let h = 0; h < HORAS; h += 0.25) {
        expect(suyas.filter((i) => i.inicio! <= h && (i.fin === null || i.fin > h)).length).toBeLessThanOrEqual(LIMITE_WIP)
      }
    }
  })

  it('atiende primero la prioridad alta, aunque haya llegado después', () => {
    const { incidencias } = simular([llegada({ t: 0, prioridad: 'baja' }), llegada({ t: 0.1, prioridad: 'alta' })], [{ nombre: 'T', disponible: siempre }], 10, 1)
    const alta = incidencias.find((i) => i.prioridad === 'alta')!
    const baja = incidencias.find((i) => i.prioridad === 'baja')!
    expect(alta.inicio).toBe(0.1) // apenas se reporta, antes que la baja que llegó primero
    expect(baja.inicio).toBeGreaterThanOrEqual(alta.fin!)
  })

  it('fuera de turno no se toma ni se trabaja nada', () => {
    const tecnico: Tecnico = { nombre: 'T', disponible: turno(7, 15) }
    const { incidencias } = simular([llegada({ t: 23, trabajo: 2 })], [tecnico], 48)
    expect(incidencias[0]).toMatchObject({ inicio: 31, fin: 33 }) // 7:00 del día siguiente + 2 h
  })

  it('una incidencia bloqueada (ej. sin luz) no se trabaja antes de que se desbloquee', () => {
    const { incidencias } = simular([llegada({ t: 1, bloqueadaHasta: 6, trabajo: 1 })], [{ nombre: 'T', disponible: siempre }], 12)
    expect(incidencias[0]).toMatchObject({ inicio: 1, fin: 7 })
  })

  it('respeta al técnico que solo toma prioridad alta y las asignaciones directas', () => {
    const tecnicos: Tecnico[] = [
      { nombre: 'Guardia', disponible: siempre, soloAlta: true },
      { nombre: 'Electricista', disponible: siempre },
    ]
    const { incidencias } = simular(
      [llegada({ prioridad: 'media' }), llegada({ prioridad: 'alta', asignadaA: 'Electricista' }), llegada({ prioridad: 'alta', t: 0.5 })],
      tecnicos,
      10,
    )
    expect(incidencias.filter((i) => i.tecnico === 'Guardia').every((i) => i.prioridad === 'alta')).toBe(true)
    expect(incidencias.find((i) => i.asignadaA)!.tecnico).toBe('Electricista')
  })

  it('los reportes repetidos se cierran junto con la incidencia principal sin ocupar al técnico', () => {
    const { incidencias, wip } = simular(
      [llegada({ t: 0, clave: 'general', trabajo: 2 }), llegada({ t: 0.5, agrupadaEn: 'general' }), llegada({ t: 1, agrupadaEn: 'general' })],
      [{ nombre: 'T', disponible: siempre }],
      6,
    )
    expect(incidencias.map((i) => i.fin)).toEqual([2, 2, 2])
    expect(Math.max(...wip)).toBe(1)
  })

  it('en una semana normal se cumple la Ley de Little (WIP ≈ throughput × cycle time)', () => {
    // 20 semanas normales para que el promedio sea estable
    let wipTotal = 0, pasos = 0, resueltas = 0, horasCiclo = 0
    for (let semilla = 1; semilla <= 20; semilla++) {
      const { resultado } = correr('normal', semilla)
      wipTotal += resultado.wip.reduce((a, b) => a + b, 0)
      pasos += resultado.wip.length
      for (const i of resultado.incidencias.filter((x) => x.fin !== null)) {
        resueltas++
        horasCiclo += i.fin! - i.inicio!
      }
    }
    const wipMedido = wipTotal / pasos
    const wipLittle = (resueltas / (20 * HORAS)) * (horasCiclo / resueltas)
    expect(Math.abs(wipLittle - wipMedido) / wipMedido).toBeLessThan(0.1)
  })
})
