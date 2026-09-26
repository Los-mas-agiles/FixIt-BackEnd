import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearIncidenciaDePrueba, PASSWORD_DEMO, reiniciarBD } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))
vi.mock('../src/lib/push.js', () => ({ enviarPush: vi.fn(async () => {}) }))
const { default: app } = await import('../src/index.js')

const tokens = new Map<string, string>()
async function tokenDe(email: string) {
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
    tokens.set(email, `Bearer ${res.body.token}`)
  }
  return tokens.get(email)!
}

const HORA = 3_600_000
const haceHoras = (h: number) => new Date(Date.now() - h * HORA)

/** Incidencia resuelta con fechas conocidas. */
function resuelta(email: string, prioridad: string, creadaHaceH: number, inicioHaceH: number, resueltaHaceH: number) {
  const i = crearIncidenciaDePrueba({ residenteEmail: email, prioridad, estado: 'resuelto', fechaCreacion: haceHoras(creadaHaceH) })
  i.fechaInicioProceso = haceHoras(inicioHaceH)
  i.fechaResolucion = haceHoras(resueltaHaceH)
  return i
}

beforeEach(() => {
  reiniciarBD()
  tokens.clear()
})

describe('GET /api/kpis', () => {
  it('calcula los KPIs del edificio del admin, sin mezclar otros edificios', async () => {
    resuelta('residente1@olivos.demo', 'alta', 30, 28, 4) // cycle 24 h, lead 26 h
    resuelta('residente2@olivos.demo', 'media', 20, 12, 8) // cycle 4 h, lead 12 h
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico1@olivos.demo' })
    // Otro edificio: no debe contar
    resuelta('residente1@sanborja.demo', 'alta', 10, 9, 1)
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@sanborja.demo', estado: 'en_proceso' })

    const res = await request(app).get('/api/kpis').set('Authorization', await tokenDe('admin@olivos.demo'))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      prioridad: null,
      cycleTimeHoras: 14,
      leadTimeHoras: 19,
      wip: 1,
      throughput: 2,
      totalReportadas: 3,
      precisionIA: 100,
      clasificadasPorIA: 100,
    })
  })

  it('por defecto usa los últimos 7 días', async () => {
    const res = await request(app).get('/api/kpis').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(Date.parse(res.body.hasta) - Date.parse(res.body.desde)).toBe(7 * 24 * HORA)
    expect(Math.abs(Date.parse(res.body.hasta) - Date.now())).toBeLessThan(60_000)
  })

  it('filtra por prioridad y por periodo', async () => {
    resuelta('residente1@olivos.demo', 'alta', 30, 28, 4)
    resuelta('residente1@olivos.demo', 'media', 20, 12, 8)
    resuelta('residente1@olivos.demo', 'alta', 400, 390, 300) // hace más de 7 días
    const admin = await tokenDe('admin@olivos.demo')

    const alta = await request(app).get('/api/kpis?prioridad=alta').set('Authorization', admin)
    expect(alta.body).toMatchObject({ prioridad: 'alta', throughput: 1, cycleTimeHoras: 24 })

    const desde = haceHoras(24 * 30).toISOString()
    const mes = await request(app).get('/api/kpis').query({ prioridad: 'alta', desde }).set('Authorization', admin)
    expect(mes.body).toMatchObject({ throughput: 2, cycleTimeHoras: 57 }) // (24 + 90) / 2
  })

  it('las incidencias que el admin corrigió bajan la precisión de la IA', async () => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const corregida = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const admin = await tokenDe('admin@olivos.demo')
    await request(app).patch(`/api/incidencias/${corregida.id}/clasificacion`).set('Authorization', admin).send({ prioridad: 'alta' })

    const res = await request(app).get('/api/kpis').set('Authorization', admin)
    expect(res.body.precisionIA).toBe(50)
  })

  it('las que cayeron al fallback no cuentan como clasificadas por la IA', async () => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', clasificadoPor: 'fallback' })
    const res = await request(app).get('/api/kpis').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.body).toMatchObject({ totalReportadas: 2, clasificadasPorIA: 50, precisionIA: 100 })
  })

  it('el flujo real del tablero alimenta los KPIs', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const tecnico = await tokenDe('tecnico1@olivos.demo')
    const admin = await tokenDe('admin@olivos.demo')

    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'en_proceso' })
    expect((await request(app).get('/api/kpis').set('Authorization', admin)).body).toMatchObject({ wip: 1, throughput: 0 })

    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'resuelto' })
    const res = await request(app).get('/api/kpis').set('Authorization', admin)
    expect(res.body).toMatchObject({ wip: 0, throughput: 1 })
    expect(res.body.cycleTimeHoras).toBeGreaterThanOrEqual(0)
  })

  it.each([
    ['fecha inválida', { desde: 'ayer' }],
    ['prioridad inválida', { prioridad: 'urgente' }],
    ['"desde" posterior a "hasta"', { desde: '2026-09-20T00:00:00Z', hasta: '2026-09-10T00:00:00Z' }],
    ['periodo de más de un año', { desde: '2024-01-01T00:00:00Z', hasta: '2026-01-01T00:00:00Z' }],
  ])('%s → 400', async (_caso, query) => {
    const res = await request(app).get('/api/kpis').query(query).set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })

  it('sin sesión → 401', async () => {
    expect((await request(app).get('/api/kpis')).status).toBe(401)
  })

  it.each(['residente1@olivos.demo', 'tecnico1@olivos.demo'])('%s no puede ver los KPIs → 403', async (email) => {
    expect((await request(app).get('/api/kpis').set('Authorization', await tokenDe(email))).status).toBe(403)
    expect((await request(app).get('/api/kpis/cfd').set('Authorization', await tokenDe(email))).status).toBe(403)
  })
})

describe('GET /api/kpis/cfd', () => {
  it('por defecto devuelve 14 días, del más antiguo a hoy', async () => {
    const res = await request(app).get('/api/kpis/cfd').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(14)
    expect(res.body[0].fecha < res.body[13].fecha).toBe(true)
    expect(Object.keys(res.body[0]).sort()).toEqual(['en_proceso', 'fecha', 'pendiente', 'resuelto'])
  })

  it('el último punto es el estado actual del tablero del edificio', async () => {
    resuelta('residente1@olivos.demo', 'alta', 30, 28, 4)
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', fechaCreacion: haceHoras(2) }).fechaInicioProceso = haceHoras(1)
    crearIncidenciaDePrueba({ residenteEmail: 'residente2@olivos.demo' })
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@sanborja.demo' }) // otro edificio

    const res = await request(app).get('/api/kpis/cfd').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.body.at(-1)).toMatchObject({ pendiente: 1, en_proceso: 1, resuelto: 1 })
  })

  it('respeta el periodo pedido', async () => {
    const res = await request(app)
      .get('/api/kpis/cfd')
      .query({ desde: '2026-09-01T05:00:00Z', hasta: '2026-09-07T12:00:00Z' })
      .set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.body.map((p: { fecha: string }) => p.fecha)).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
    ])
  })
})
