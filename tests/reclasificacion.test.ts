import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearIncidenciaDePrueba, reiniciarBD, todasLasIncidencias } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const clasificarMock = vi.fn()
vi.mock('../src/modules/incidencias/clasificador.js', () => ({ clasificar: clasificarMock }))
vi.spyOn(console, 'info').mockImplementation(() => {})

const { reclasificarPendientes, programarReclasificacion, reiniciarIntervalos } = await import('../src/modules/incidencias/reclasificacion.js')

const IA = (tipo: string, prioridad: string) => ({ tipo, prioridad, clasificadoPor: 'ia', modelo: 'm', ms: 1 })
const FALLBACK = { tipo: 'otros', prioridad: 'media', clasificadoPor: 'fallback', modelo: null, ms: 1 }
const buscar = (id: string) => todasLasIncidencias().find((i) => i.id === id)!

beforeEach(() => {
  reiniciarBD()
  reiniciarIntervalos()
  clasificarMock.mockReset()
})

describe('reclasificarPendientes', () => {
  it('reclasifica con IA las incidencias que quedaron en fallback (y guarda tipoIA / prioridadIA)', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback', descripcion: 'Chispas en el tablero' })
    clasificarMock.mockResolvedValueOnce(IA('electricidad', 'alta'))

    expect(await reclasificarPendientes('edificio-a')).toBe(1)
    expect(clasificarMock).toHaveBeenCalledWith('Chispas en el tablero')
    expect(buscar(id)).toMatchObject({ tipo: 'electricidad', prioridad: 'alta', clasificadoPor: 'ia', tipoIA: 'electricidad', prioridadIA: 'alta' })
  })

  it('NO toca las clasificadas por IA ni las corregidas a mano', async () => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'ia' })
    const manual = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'manual', prioridad: 'baja' })

    expect(await reclasificarPendientes('edificio-a')).toBe(0)
    expect(clasificarMock).not.toHaveBeenCalled()
    expect(buscar(manual.id)).toMatchObject({ clasificadoPor: 'manual', prioridad: 'baja' })
  })

  it('si la IA sigue fallando, se detiene (no gasta cuota) y la incidencia queda en fallback', async () => {
    const a = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback' })
    crearIncidenciaDePrueba({ residenteEmail: 'residente2@olivos.demo', clasificadoPor: 'fallback' })
    clasificarMock.mockResolvedValue(FALLBACK)

    expect(await reclasificarPendientes('edificio-a')).toBe(0)
    expect(clasificarMock).toHaveBeenCalledTimes(1)
    expect(buscar(a.id).clasificadoPor).toBe('fallback')
  })

  it('procesa como máximo 3 por ejecución, empezando por las más antiguas', async () => {
    const base = Date.now() - 60_000
    const ids = [0, 1, 2, 3].map((n) =>
      crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback', descripcion: `caso ${n}`, fechaCreacion: new Date(base + n * 1000) }).id,
    )
    clasificarMock.mockResolvedValue(IA('limpieza', 'baja'))

    expect(await reclasificarPendientes('edificio-a')).toBe(3)
    expect(clasificarMock.mock.calls.map((c) => c[0])).toEqual(['caso 0', 'caso 1', 'caso 2'])
    expect(buscar(ids[3]!).clasificadoPor).toBe('fallback')
  })

  it('ignora las de más de 7 días y las de otros edificios', async () => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback', fechaCreacion: new Date(Date.now() - 8 * 24 * 3600_000) })
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@sanborja.demo', clasificadoPor: 'fallback' })

    expect(await reclasificarPendientes('edificio-a')).toBe(0)
    expect(clasificarMock).not.toHaveBeenCalled()
  })

  it('si un admin la corrige mientras la IA estaba respondiendo, gana la corrección manual', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback' })
    clasificarMock.mockImplementationOnce(async () => {
      Object.assign(buscar(id), { clasificadoPor: 'manual', prioridad: 'alta' }) // el admin corrige justo ahora
      return IA('limpieza', 'baja')
    })

    expect(await reclasificarPendientes('edificio-a')).toBe(0)
    expect(buscar(id)).toMatchObject({ clasificadoPor: 'manual', prioridad: 'alta' })
  })
})

describe('programarReclasificacion', () => {
  it('como mucho una ejecución por minuto y edificio', async () => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback' })
    clasificarMock.mockResolvedValue(FALLBACK)

    programarReclasificacion('edificio-a')
    programarReclasificacion('edificio-a') // ignorada: pasó menos de un minuto
    await vi.waitFor(() => expect(clasificarMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(clasificarMock).toHaveBeenCalledTimes(1)
  })
})
