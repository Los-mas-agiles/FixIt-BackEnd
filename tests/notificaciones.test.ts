import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buscarUsuario,
  crearIncidenciaDePrueba,
  PASSWORD_DEMO,
  reiniciarBD,
  todasLasNotificaciones,
  todasLasSuscripciones,
} from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))
const enviarPush = vi.fn(async () => {})
vi.mock('../src/lib/push.js', () => ({ enviarPush }))
vi.stubEnv('VAPID_PUBLIC_KEY', 'BClavePublicaDePrueba')
const { default: app } = await import('../src/index.js')

const FCM = 'https://fcm.googleapis.com/fcm/send/dispositivo-1'
const suscripcion = (endpoint = FCM) => ({ endpoint, expirationTime: null, keys: { p256dh: 'BNcRd...', auth: 'tBHI...' } })

const tokens = new Map<string, string>()
async function tokenDe(email: string) {
  if (!tokens.has(email)) {
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
    tokens.set(email, `Bearer ${res.body.token}`)
  }
  return tokens.get(email)!
}

const notificacionesDe = (email: string) => todasLasNotificaciones().filter((n) => n.usuarioId === buscarUsuario(email).id)

beforeEach(() => {
  reiniciarBD()
  tokens.clear()
  enviarPush.mockClear()
})

describe('avisos automáticos (HU4)', () => {
  it('cuando el técnico toma y resuelve la incidencia, el residente recibe 2 avisos (en la app y por push)', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', descripcion: 'Fuga en el baño' })
    const tecnico = await tokenDe('tecnico1@olivos.demo')

    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'en_proceso' })
    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'resuelto' })

    expect(notificacionesDe('residente1@olivos.demo').map((n) => n.mensaje)).toEqual([
      'Tu incidencia "Fuga en el baño" está En proceso: un técnico ya la está atendiendo.',
      'Tu incidencia "Fuga en el baño" fue resuelta.',
    ])
    await vi.waitFor(() => expect(enviarPush).toHaveBeenCalledTimes(2))
    expect(enviarPush).toHaveBeenLastCalledWith(buscarUsuario('residente1@olivos.demo').id, {
      titulo: 'FixIt',
      mensaje: 'Tu incidencia "Fuga en el baño" fue resuelta.',
      url: `/incidencias/${id}`,
    })
  })

  it('cuando el admin asigna un técnico, el técnico recibe un aviso', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', descripcion: 'Ascensor detenido' })
    await request(app)
      .patch(`/api/incidencias/${id}/asignacion`)
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ tecnicoId: buscarUsuario('tecnico2@olivos.demo').id })

    expect(notificacionesDe('tecnico2@olivos.demo').map((n) => n.mensaje)).toEqual(['Te asignaron la incidencia "Ascensor detenido".'])
    await vi.waitFor(() => expect(enviarPush).toHaveBeenCalledWith(buscarUsuario('tecnico2@olivos.demo').id, expect.anything()))
  })

  it('reasignar al mismo técnico o quitar el técnico no genera avisos', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', asignadoAEmail: 'tecnico1@olivos.demo' })
    const admin = await tokenDe('admin@olivos.demo')
    await request(app).patch(`/api/incidencias/${id}/asignacion`).set('Authorization', admin).send({ tecnicoId: buscarUsuario('tecnico1@olivos.demo').id })
    await request(app).patch(`/api/incidencias/${id}/asignacion`).set('Authorization', admin).send({ tecnicoId: null })
    expect(todasLasNotificaciones()).toHaveLength(0)
  })

  it('si el cambio de estado falla (ej. límite de WIP), no se crea ningún aviso', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', await tokenDe('admin@olivos.demo')).send({ estado: 'resuelto' })
    expect(res.status).toBe(409)
    expect(todasLasNotificaciones()).toHaveLength(0)
    expect(enviarPush).not.toHaveBeenCalled()
  })
})

describe('GET /api/notificaciones', () => {
  it('cada usuario ve solo sus avisos, del más nuevo al más viejo', async () => {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', descripcion: 'Fuga en el baño' })
    const tecnico = await tokenDe('tecnico1@olivos.demo')
    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'en_proceso' })
    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'resuelto' })

    const res = await request(app).get('/api/notificaciones').set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ incidenciaId: id, leida: false, mensaje: 'Tu incidencia "Fuga en el baño" fue resuelta.' })
    expect(Object.keys(res.body[0]).sort()).toEqual(['fecha', 'id', 'incidenciaId', 'leida', 'mensaje'])

    const otro = await request(app).get('/api/notificaciones').set('Authorization', await tokenDe('residente2@olivos.demo'))
    expect(otro.body).toEqual([])
  })

  it('sin sesión → 401', async () => {
    expect((await request(app).get('/api/notificaciones')).status).toBe(401)
  })
})

describe('marcar como leídas', () => {
  async function prepararAvisos() {
    const { id } = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const tecnico = await tokenDe('tecnico1@olivos.demo')
    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'en_proceso' })
    await request(app).patch(`/api/incidencias/${id}/estado`).set('Authorization', tecnico).send({ estado: 'resuelto' })
    return notificacionesDe('residente1@olivos.demo')
  }

  it('PATCH /:id/leida marca solo esa', async () => {
    const [primera, segunda] = await prepararAvisos()
    const res = await request(app).patch(`/api/notificaciones/${primera!.id}/leida`).set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.status).toBe(200)
    expect(res.body.leida).toBe(true)
    expect(segunda!.leida).toBe(false)
  })

  it('no se puede marcar la notificación de otro usuario → 404 y queda sin leer', async () => {
    const [aviso] = await prepararAvisos()
    const res = await request(app).patch(`/api/notificaciones/${aviso!.id}/leida`).set('Authorization', await tokenDe('residente2@olivos.demo'))
    expect(res.status).toBe(404)
    expect(aviso!.leida).toBe(false)
  })

  it('id inválido → 404', async () => {
    const res = await request(app).patch('/api/notificaciones/abc/leida').set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.status).toBe(404)
  })

  it('POST /leer-todas marca todas las del usuario', async () => {
    await prepararAvisos()
    const res = await request(app).post('/api/notificaciones/leer-todas').set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.body).toEqual({ ok: true })
    expect(notificacionesDe('residente1@olivos.demo').every((n) => n.leida)).toBe(true)
  })
})

describe('suscripciones Web Push', () => {
  it('GET /push/vapid-public-key devuelve la clave pública', async () => {
    const res = await request(app).get('/api/push/vapid-public-key').set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.body).toEqual({ publicKey: 'BClavePublicaDePrueba' })
  })

  it('guarda la suscripción del navegador (201)', async () => {
    const res = await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send(suscripcion())
    expect(res.status).toBe(201)
    expect(todasLasSuscripciones()).toMatchObject([{ endpoint: FCM, usuarioId: buscarUsuario('residente1@olivos.demo').id }])
  })

  it('suscribir dos veces el mismo navegador no duplica; si otro usuario entra en ese navegador, pasa a ser suyo', async () => {
    await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send(suscripcion())
    await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send(suscripcion())
    await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('tecnico1@olivos.demo')).send(suscripcion())
    expect(todasLasSuscripciones()).toHaveLength(1)
    expect(todasLasSuscripciones()[0]!.usuarioId).toBe(buscarUsuario('tecnico1@olivos.demo').id)
  })

  it.each([
    ['endpoint que no es de un servicio de push (SSRF)', suscripcion('https://169.254.169.254/latest/meta-data')],
    ['sin claves', { endpoint: FCM }],
  ])('rechaza %s → 400', async (_caso, body) => {
    const res = await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send(body)
    expect(res.status).toBe(400)
    expect(todasLasSuscripciones()).toHaveLength(0)
  })

  it('DELETE borra solo la suscripción propia', async () => {
    await request(app).post('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send(suscripcion())
    await request(app).delete('/api/push/suscripciones').set('Authorization', await tokenDe('residente2@olivos.demo')).send({ endpoint: FCM })
    expect(todasLasSuscripciones()).toHaveLength(1)
    await request(app).delete('/api/push/suscripciones').set('Authorization', await tokenDe('residente1@olivos.demo')).send({ endpoint: FCM })
    expect(todasLasSuscripciones()).toHaveLength(0)
  })
})
