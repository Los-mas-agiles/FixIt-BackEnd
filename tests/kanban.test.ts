import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarUsuario, crearIncidenciaDePrueba, PASSWORD_DEMO, reiniciarBD, todasLasIncidencias } from './helpers/fakePrisma.js'
import { reiniciarStorage } from './helpers/fakeStorage.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))
const { default: app } = await import('../src/index.js')

const tokens = new Map<string, string>()
async function tokenDe(email: string) {
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
    tokens.set(email, `Bearer ${res.body.token}`)
  }
  return tokens.get(email)!
}

async function moverEstado(email: string, id: string, estado: string) {
  return request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', await tokenDe(email)).send({ estado })
}

async function asignar(email: string, id: string, tecnicoEmail: string | null) {
  const tecnicoId = tecnicoEmail ? buscarUsuario(tecnicoEmail).id : null
  return request(app).patch(`/api/incidencias/${id}/asignacion`).set('Authorization', await tokenDe(email)).send({ tecnicoId })
}

async function detalle(id: string) {
  return (await request(app).get(`/api/incidencias/${id}`).set('Authorization', await tokenDe('admin@olivos.demo'))).body
}

beforeEach(() => {
  reiniciarBD()
  reiniciarStorage()
  tokens.clear()
})

describe('flujo completo Pendiente → En proceso → Resuelto', () => {
  it('el técnico la toma (autoasignación), la resuelve, y queda todo registrado con hora del servidor', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const antes = Date.now()

    const tomar = await moverEstado('tecnico1@olivos.demo', id, 'en_proceso')
    expect(tomar.status).toBe(200)
    expect(tomar.body).toMatchObject({ estado: 'en_proceso', asignadoA: { nombre: 'Carlos Quispe' }, fechaResolucion: null })
    expect(new Date(tomar.body.fechaInicioProceso).getTime()).toBeGreaterThanOrEqual(antes)

    const resolver = await moverEstado('tecnico1@olivos.demo', id, 'resuelto')
    expect(resolver.status).toBe(200)
    expect(resolver.body.estado).toBe('resuelto')
    expect(new Date(resolver.body.fechaResolucion).getTime()).toBeGreaterThanOrEqual(new Date(tomar.body.fechaInicioProceso).getTime())

    const { historial } = await detalle(id)
    expect(historial.map((h: { estadoAnterior: string | null; estadoNuevo: string; usuario: { nombre: string } }) => [h.estadoAnterior, h.estadoNuevo, h.usuario.nombre])).toEqual([
      [null, 'pendiente', 'María Rojas'],
      ['pendiente', 'en_proceso', 'Carlos Quispe'],
      ['en_proceso', 'resuelto', 'Carlos Quispe'],
    ])
    // El historial usa exactamente la misma hora que la incidencia (para el CFD y los KPIs)
    expect(historial[1].fecha).toBe(tomar.body.fechaInicioProceso)
    expect(historial[2].fecha).toBe(resolver.body.fechaResolucion)
  })

  it('el admin asigna un técnico y luego la pasa a en proceso en su nombre', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })

    const asignada = await asignar('admin@olivos.demo', id, 'tecnico2@olivos.demo')
    expect(asignada.status).toBe(200)
    expect(asignada.body).toMatchObject({ estado: 'pendiente', asignadoA: { nombre: 'Luis Huamán' } })

    const enProceso = await moverEstado('admin@olivos.demo', id, 'en_proceso')
    expect(enProceso.body).toMatchObject({ estado: 'en_proceso', asignadoA: { nombre: 'Luis Huamán' } })
  })
})

describe('PATCH /api/incidencias/:id/estado: reglas', () => {
  it('saltarse un paso (pendiente → resuelto) → 409 TRANSICION_INVALIDA y nada cambia', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await moverEstado('admin@olivos.demo', id, 'resuelto')
    expect(res.status).toBe(409)
    expect(res.body.error).toEqual({ code: 'TRANSICION_INVALIDA', message: 'No se puede pasar de "Pendiente" a "Resuelto"' })
    expect((await detalle(id)).estado).toBe('pendiente')
  })

  it('retroceder una resuelta → 409', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'resuelto', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await moverEstado('admin@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('La incidencia ya está resuelta')
  })

  it('el admin no puede pasarla a en proceso sin técnico → 409', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await moverEstado('admin@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('Asigna un técnico antes de pasarla a "En proceso"')
  })

  it('un técnico no puede tomar la incidencia asignada a otro → 403', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', asignadoAEmail: 'tecnico2@olivos.demo' })
    const res = await moverEstado('tecnico1@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe('Esta incidencia está asignada a otro técnico')
  })

  it('un técnico no puede resolver la de otro → 403', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico2@olivos.demo' })
    const res = await moverEstado('tecnico1@olivos.demo', id, 'resuelto')
    expect(res.status).toBe(403)
  })

  it('un residente no puede cambiar estados → 403', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await moverEstado('residente1@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(403)
  })

  it('incidencia de otro edificio → 404 (no se revela que existe)', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@sanborja.demo' })
    const res = await moverEstado('tecnico1@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(404)
    expect(todasLasIncidencias().find((i) => i.id === id)?.estado).toBe('pendiente')
  })

  it('estado inválido en el body → 400', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await moverEstado('admin@olivos.demo', id, 'cerrado')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })

  it('id inválido → 404', async () => {
    const res = await moverEstado('admin@olivos.demo', 'no-es-uuid', 'en_proceso')
    expect(res.status).toBe(404)
  })
})

describe('Límite de WIP (3 incidencias en proceso por técnico)', () => {
  it('el técnico toma 3; la cuarta → 409 LIMITE_WIP; al resolver una, puede tomar otra', async () => {
    const ids = Array.from({ length: 4 }, () => crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' }).id)

    for (const id of ids.slice(0, 3)) {
      expect((await moverEstado('tecnico1@olivos.demo', id, 'en_proceso')).status).toBe(200)
    }

    const cuarta = await moverEstado('tecnico1@olivos.demo', ids[3]!, 'en_proceso')
    expect(cuarta.status).toBe(409)
    expect(cuarta.body.error).toEqual({
      code: 'LIMITE_WIP',
      message: 'Ya tienes 3 incidencias en proceso. Resuelve una antes de tomar otra.',
    })
    expect(todasLasIncidencias().find((i) => i.id === ids[3])?.estado).toBe('pendiente')

    expect((await moverEstado('tecnico1@olivos.demo', ids[0]!, 'resuelto')).status).toBe(200)
    expect((await moverEstado('tecnico1@olivos.demo', ids[3]!, 'en_proceso')).status).toBe(200)
  })

  it('el límite es por técnico: otro técnico sí puede tomarla', async () => {
    for (let i = 0; i < 3; i++) {
      crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico1@olivos.demo' })
    }
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    expect((await moverEstado('tecnico1@olivos.demo', id, 'en_proceso')).status).toBe(409)
    expect((await moverEstado('tecnico2@olivos.demo', id, 'en_proceso')).status).toBe(200)
  })

  it('cuando el admin mueve la de un técnico saturado, el mensaje habla del técnico', async () => {
    for (let i = 0; i < 3; i++) {
      crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico1@olivos.demo' })
    }
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await moverEstado('admin@olivos.demo', id, 'en_proceso')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('El técnico ya tiene 3 incidencias en proceso. Espera a que resuelva una o asigna otro técnico.')
  })
})

describe('PATCH /api/incidencias/:id/asignacion', () => {
  it('el admin puede quitar el técnico de una pendiente (tecnicoId: null)', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await asignar('admin@olivos.demo', id, null)
    expect(res.status).toBe(200)
    expect(res.body.asignadoA).toBeNull()
  })

  it('reasignar una en proceso a otro técnico respeta el límite de WIP del nuevo técnico', async () => {
    for (let i = 0; i < 3; i++) {
      crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico2@olivos.demo' })
    }
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await asignar('admin@olivos.demo', id, 'tecnico2@olivos.demo')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LIMITE_WIP')
  })

  it('no se puede dejar sin técnico una incidencia en proceso → 409', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'en_proceso', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await asignar('admin@olivos.demo', id, null)
    expect(res.status).toBe(409)
  })

  it('no se puede reasignar una resuelta → 409', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', estado: 'resuelto', asignadoAEmail: 'tecnico1@olivos.demo' })
    const res = await asignar('admin@olivos.demo', id, 'tecnico2@olivos.demo')
    expect(res.status).toBe(409)
  })

  it.each([
    ['un residente', 'residente1@olivos.demo'],
    ['un técnico inactivo', 'tecnico-inactivo@olivos.demo'],
    ['un técnico de otro edificio', 'tecnico1@sanborja.demo'],
  ])('asignar a %s → 400', async (_caso, email) => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await asignar('admin@olivos.demo', id, email)
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('El técnico no existe o no pertenece a tu edificio')
  })

  it('tecnicoId con formato inválido → 400', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/asignacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ tecnicoId: 'abc' })
    expect(res.status).toBe(400)
  })

  it.each(['tecnico1@olivos.demo', 'residente1@olivos.demo'])('%s no puede asignar (solo admin) → 403', async (email) => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await asignar(email, id, 'tecnico1@olivos.demo')
    expect(res.status).toBe(403)
  })

  it('el admin de otro edificio no puede asignar → 404', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await asignar('admin@sanborja.demo', id, 'tecnico1@sanborja.demo')
    expect(res.status).toBe(404)
  })
})
