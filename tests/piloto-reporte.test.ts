import { describe, expect, it } from 'vitest'
import { leerArgumentos } from '../scripts/lib/argumentos.js'
import { cfdSvg } from '../scripts/lib/cfd-svg.js'
import { armarReportePiloto, type DatosPiloto, type IncidenciaPiloto } from '../scripts/piloto/reporte.js'

const DESDE = new Date('2026-11-02T05:00:00Z') // lunes 2/11, 00:00 en Lima
const HASTA = new Date('2026-11-15T04:59:59Z') // domingo 14/11, 23:59 en Lima
const h = (horas: number) => new Date(DESDE.getTime() + horas * 3_600_000)

function incidencia(datos: Partial<IncidenciaPiloto>): IncidenciaPiloto {
  return {
    residenteId: 'r1',
    clasificadoPor: 'ia',
    prioridad: 'media',
    estado: 'pendiente',
    tipo: 'plomeria',
    tipoIA: 'plomeria',
    prioridadIA: datos.prioridad ?? 'media',
    fechaCreacion: h(10),
    fechaInicioProceso: null,
    fechaResolucion: null,
    ...datos,
  }
}

const base: DatosPiloto = {
  edificio: 'Residencial Las Palmeras',
  periodo: { desde: DESDE, hasta: HASTA },
  incidencias: [
    // Semana 1: una alta resuelta en 10 h de trabajo (lead 12 h) y una media resuelta
    incidencia({ residenteId: 'r1', prioridad: 'alta', prioridadIA: 'alta', tipo: 'ascensor', tipoIA: 'ascensor', estado: 'resuelto', fechaCreacion: h(10), fechaInicioProceso: h(12), fechaResolucion: h(22) }),
    incidencia({ residenteId: 'r2', estado: 'resuelto', fechaCreacion: h(30), fechaInicioProceso: h(40), fechaResolucion: h(50) }),
    // Semana 2: el residente r1 vuelve a reportar; una quedó provisional (fallback) y otra la corrigió el admin
    incidencia({ residenteId: 'r1', clasificadoPor: 'fallback', tipo: 'otros', tipoIA: null, prioridadIA: null, fechaCreacion: h(200) }),
    incidencia({ residenteId: 'r3', clasificadoPor: 'manual', tipo: 'limpieza', tipoIA: 'otros', estado: 'en_proceso', fechaCreacion: h(210), fechaInicioProceso: h(215) }),
  ],
  participantes: { residente: 5, mantenimiento: 2, administrador: 1 },
  avisos: 7,
  usuariosConPush: 4,
  reportesWhatsapp: 1,
  generado: new Date('2026-11-15T15:00:00Z'),
}

describe('reporte del piloto', () => {
  it('evalúa los objetivos del TF con los datos del piloto', () => {
    const { markdown } = armarReportePiloto(base)
    expect(markdown).toContain('# Resultados del piloto — Residencial Las Palmeras')
    expect(markdown).toContain('Periodo: **02/11/2026 al 14/11/2026**')
    expect(markdown).toMatch(/Objetivo 2:.*\| 10 h \(1 resueltas\) \| ✅ Cumple/)
    expect(markdown).toMatch(/Objetivo 3:.*5 residentes, 2 de mantenimiento, 1 administrador\(es\) \| ✅ Cumple/)
    expect(markdown).toMatch(/Objetivo 4:.*75 % \(1 quedaron con clasificación provisional\) \| ❌ No cumple/)
    expect(markdown).toMatch(/Hipótesis de valor.*80 % \(4 por FixIt, 1 por WhatsApp\) \| ✅ Cumple/)
  })

  it('KPIs, semanas, adopción y uso', () => {
    const { markdown } = armarReportePiloto(base)
    expect(markdown).toContain('| Todas | 4 | 2 | 10 h | 16 h | 66,7 % | 75 % |') // lead: (12 + 20) / 2
    expect(markdown).toContain('| Alta | 1 | 1 | 10 h | 12 h | 100 % | 100 % |')
    expect(markdown).toContain('| Semana 1 (02/11/2026 – 08/11/2026) | 2 | 2 | 10 h | 10 h | 16 h |')
    expect(markdown).toContain('| Semana 2 (09/11/2026 – 14/11/2026) | 2 | 0 | — | — | — |')
    expect(markdown).toContain('**Residentes que reportaron:** 3 de 5 · **volvieron a reportar (2 o más veces):** 1 (33,3 %)')
    expect(markdown).toContain('**Clasificación:** 2 por la IA · 1 corregidas por el administrador · 1 provisionales')
    expect(markdown).toContain('**Avisos enviados:** 7 · **usuarios con notificaciones push activas:** 4 de 8')
    expect(markdown).toContain('**WIP al cierre:** 1 incidencias en proceso.')
  })

  it('sin el conteo de WhatsApp no inventa la adopción, y sin resueltas de alta no marca el Objetivo 2', () => {
    const { markdown } = armarReportePiloto({ ...base, reportesWhatsapp: undefined, incidencias: base.incidencias.slice(1) })
    expect(markdown).toMatch(/Hipótesis de valor.*Falta el conteo de WhatsApp.*\| Sin datos \|/)
    expect(markdown).toMatch(/Objetivo 2:.*\| — \(0 resueltas\) \| Sin datos \|/)
  })

  it('el CFD tiene un punto por día del piloto', () => {
    const { cfd } = armarReportePiloto(base)
    expect(cfd).toHaveLength(13)
    expect(cfd.at(-1)).toMatchObject({ fecha: '2026-11-14', pendiente: 1, en_proceso: 1, resuelto: 2 })
    const svg = cfdSvg(cfd, { titulo: 'Piloto <prueba>', etiquetas: cfd.map((p) => p.fecha.slice(8)) })
    expect(svg).toContain('<title>Piloto &lt;prueba&gt;</title>')
    expect(svg.match(/<polygon/g)).toHaveLength(3)
  })
})

describe('leerArgumentos', () => {
  it('lee --clave valor y banderas sueltas', () => {
    expect(leerArgumentos(['--edificio', 'Las Palmeras', '--fotos', '--whatsapp', '3'])).toEqual({ edificio: 'Las Palmeras', fotos: 'true', whatsapp: '3' })
  })
})
