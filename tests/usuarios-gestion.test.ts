// Gestión de cuentas para el piloto: desactivar/reactivar, contraseña temporal y cambio de contraseña propio.
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarUsuario, PASSWORD_DEMO, prisma, reiniciarBD, todasLasSuscripciones } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { default: app } = await import('../src/index.js')

const login = (email: string, password = PASSWORD_DEMO) => request(app).post('/api/auth/login').send({ email, password })
async function tokenDe(email: string) {
  return `Bearer ${(await login(email)).body.token}`
}

beforeEach(() => reiniciarBD())

describe('PATCH /api/usuarios/:id', () => {
  it('el admin desactiva a un residente: ya no puede entrar, su sesión deja de valer y se borran sus suscripciones push', async () => {
    const residente = buscarUsuario('residente1@olivos.demo')
    const sesionResidente = await tokenDe('residente1@olivos.demo')
    await prisma.suscripcionPush.upsert({
      where: { endpoint: 'https://fcm.googleapis.com/x' },
      create: { usuarioId: residente.id, endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a' },
      update: {},
    })

    const res = await request(app).patch(`/api/usuarios/${residente.id}`).set('Authorization', await tokenDe('admin@olivos.demo')).send({ activo: false })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: residente.id, email: 'residente1@olivos.demo' })
    expect(res.body.passwordHash).toBeUndefined()
    expect((await login('residente1@olivos.demo')).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Authorization', sesionResidente)).status).toBe(401)
    expect(todasLasSuscripciones()).toHaveLength(0)
  })

  it('aparece en ?inactivos=true y se puede reactivar', async () => {
    const admin = await tokenDe('admin@olivos.demo')
    const { id } = buscarUsuario('tecnico2@olivos.demo')
    await request(app).patch(`/api/usuarios/${id}`).set('Authorization', admin).send({ activo: false })

    const inactivos = await request(app).get('/api/usuarios?inactivos=true').set('Authorization', admin)
    expect(inactivos.body.map((u: { email: string }) => u.email)).toContain('tecnico2@olivos.demo')
    const activos = await request(app).get('/api/usuarios?rol=mantenimiento').set('Authorization', admin)
    expect(activos.body.map((u: { email: string }) => u.email)).not.toContain('tecnico2@olivos.demo')

    await request(app).patch(`/api/usuarios/${id}`).set('Authorization', admin).send({ activo: true })
    expect((await login('tecnico2@olivos.demo')).status).toBe(200)
  })

  it('el admin asigna una contraseña temporal: la anterior deja de funcionar', async () => {
    const { id } = buscarUsuario('residente2@olivos.demo')
    const res = await request(app).patch(`/api/usuarios/${id}`).set('Authorization', await tokenDe('admin@olivos.demo')).send({ password: 'Temporal2026' })
    expect(res.status).toBe(200)
    expect((await login('residente2@olivos.demo')).status).toBe(401)
    expect((await login('residente2@olivos.demo', 'Temporal2026')).status).toBe(200)
  })

  it('no puede desactivar su propia cuenta → 400', async () => {
    const { id } = buscarUsuario('admin@olivos.demo')
    const res = await request(app).patch(`/api/usuarios/${id}`).set('Authorization', await tokenDe('admin@olivos.demo')).send({ activo: false })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })

  it('un usuario de otro edificio o un id inválido → 404 (y no lo modifica)', async () => {
    const admin = await tokenDe('admin@sanborja.demo')
    const { id } = buscarUsuario('residente1@olivos.demo')
    expect((await request(app).patch(`/api/usuarios/${id}`).set('Authorization', admin).send({ activo: false })).status).toBe(404)
    expect(buscarUsuario('residente1@olivos.demo').activo).toBe(true)
    expect((await request(app).patch('/api/usuarios/abc').set('Authorization', admin).send({ activo: false })).status).toBe(404)
  })

  it.each([
    ['body vacío', {}],
    ['contraseña corta', { password: '123' }],
    ['activo no booleano', { activo: 'no' }],
  ])('%s → 400', async (_caso, body) => {
    const { id } = buscarUsuario('residente1@olivos.demo')
    const res = await request(app).patch(`/api/usuarios/${id}`).set('Authorization', await tokenDe('admin@olivos.demo')).send(body)
    expect(res.status).toBe(400)
  })

  it('solo el administrador → 403 para los demás', async () => {
    const { id } = buscarUsuario('residente2@olivos.demo')
    const res = await request(app).patch(`/api/usuarios/${id}`).set('Authorization', await tokenDe('tecnico1@olivos.demo')).send({ activo: false })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/auth/password', () => {
  it('cambia la contraseña propia: la nueva funciona y la anterior no', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .send({ actual: PASSWORD_DEMO, nueva: 'MiClaveNueva2026' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect((await login('residente1@olivos.demo')).status).toBe(401)
    expect((await login('residente1@olivos.demo', 'MiClaveNueva2026')).status).toBe(200)
  })

  it('contraseña actual incorrecta → 400 (no 401, para no cerrar la sesión) y no cambia nada', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .send({ actual: 'otra-cosa', nueva: 'MiClaveNueva2026' })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('La contraseña actual no es correcta')
    expect((await login('residente1@olivos.demo')).status).toBe(200)
  })

  it.each([
    ['nueva igual a la actual', { actual: PASSWORD_DEMO, nueva: PASSWORD_DEMO }],
    ['nueva muy corta', { actual: PASSWORD_DEMO, nueva: 'corta' }],
    ['sin contraseña actual', { nueva: 'MiClaveNueva2026' }],
  ])('%s → 400', async (_caso, body) => {
    const res = await request(app).patch('/api/auth/password').set('Authorization', await tokenDe('tecnico1@olivos.demo')).send(body)
    expect(res.status).toBe(400)
  })

  it('sin sesión → 401', async () => {
    expect((await request(app).patch('/api/auth/password').send({ actual: 'a', nueva: 'MiClaveNueva2026' })).status).toBe(401)
  })
})
