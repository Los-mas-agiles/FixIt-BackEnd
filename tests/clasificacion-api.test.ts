import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearIncidenciaDePrueba, PASSWORD_DEMO, reiniciarBD, todasLasIncidencias } from './helpers/fakePrisma.js'
import { reiniciarStorage } from './helpers/fakeStorage.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))
// La IA "responde" plomería / alta (sin llamar a Gemini)
vi.mock('../src/modules/incidencias/clasificador.js', () => ({
  clasificar: vi.fn(async () => ({ tipo: 'plomeria', prioridad: 'alta', clasificadoPor: 'ia', modelo: 'modelo-falso', ms: 5 })),
}))
const { default: app } = await import('../src/index.js')

async function tokenDe(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
  return `Bearer ${res.body.token}`
}

beforeEach(() => {
  reiniciarBD()
  reiniciarStorage()
})

describe('POST /api/incidencias con clasificación IA', () => {
  it('guarda la clasificación de la IA y también la copia original (tipoIA / prioridadIA)', async () => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', 'Se rompió un tubo y el agua sale sin parar')

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ tipo: 'plomeria', prioridad: 'alta', clasificadoPor: 'ia' })
    const guardada = todasLasIncidencias().find((i) => i.id === res.body.id)!
    expect(guardada).toMatchObject({ tipoIA: 'plomeria', prioridadIA: 'alta' })
  })
})

describe('PATCH /api/incidencias/:id/clasificacion (corrección manual)', () => {
  it('el admin corrige la prioridad: queda "manual" y se conserva lo que dijo la IA', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', prioridad: 'media' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ prioridad: 'alta' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ tipo: 'plomeria', prioridad: 'alta', clasificadoPor: 'manual' })
    expect(todasLasIncidencias().find((i) => i.id === id)).toMatchObject({ tipoIA: 'plomeria', prioridadIA: 'media' })
  })

  it('puede corregir tipo y prioridad a la vez', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ tipo: 'electricidad', prioridad: 'baja' })
    expect(res.body).toMatchObject({ tipo: 'electricidad', prioridad: 'baja', clasificadoPor: 'manual' })
  })

  it('sin tipo ni prioridad → 400', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error.details[0].mensaje).toBe('Envía al menos el tipo o la prioridad')
  })

  it('valores inválidos → 400', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ tipo: 'jardineria', prioridad: 'urgente' })
    expect(res.status).toBe(400)
  })

  it.each(['tecnico1@olivos.demo', 'residente1@olivos.demo'])('%s no puede corregir (solo admin) → 403', async (email) => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe(email))
      .send({ prioridad: 'alta' })
    expect(res.status).toBe(403)
  })

  it('incidencia de otro edificio → 404 y no se modifica', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', prioridad: 'baja' })
    const res = await request(app)
      .patch(`/api/incidencias/${id}/clasificacion`)
      .set('Authorization', await tokenDe('admin@sanborja.demo'))
      .send({ prioridad: 'alta' })
    expect(res.status).toBe(404)
    expect(todasLasIncidencias().find((i) => i.id === id)?.prioridad).toBe('baja')
  })
})
