import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSWORD_DEMO, reiniciarBD } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { default: app } = await import('../src/index.js')

async function tokenDe(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
  return `Bearer ${res.body.token}`
}

beforeEach(() => reiniciarBD())

describe('GET /api/usuarios', () => {
  it('el admin ve solo los usuarios activos de SU edificio', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(200)
    const emails = res.body.map((u: { email: string }) => u.email)
    // Ordenados por nombre: Ana Torres, Carlos Quispe, Jorge Salazar, María Rojas
    expect(emails).toEqual(['admin@olivos.demo', 'tecnico1@olivos.demo', 'residente2@olivos.demo', 'residente1@olivos.demo'])
    expect(emails).not.toContain('admin@sanborja.demo') // otro edificio
    expect(emails).not.toContain('inactivo@olivos.demo') // desactivado
  })

  it('el admin de otro edificio no ve a los de Los Olivos (aislamiento)', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', await tokenDe('admin@sanborja.demo'))
    const emails = res.body.map((u: { email: string }) => u.email)
    // Ordenados por nombre: Diego Paredes, Patricia Vega
    expect(emails).toEqual(['residente1@sanborja.demo', 'admin@sanborja.demo'])
  })

  it('filtra por rol (para elegir técnicos al asignar)', async () => {
    const res = await request(app)
      .get('/api/usuarios?rol=mantenimiento')
      .set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.body.map((u: { email: string }) => u.email)).toEqual(['tecnico1@olivos.demo'])
  })

  it('rol inválido en el query → 400', async () => {
    const res = await request(app).get('/api/usuarios?rol=jefe').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })

  it.each(['residente1@olivos.demo', 'tecnico1@olivos.demo'])('%s (no admin) → 403 PROHIBIDO', async (email) => {
    const res = await request(app).get('/api/usuarios').set('Authorization', await tokenDe(email))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PROHIBIDO')
  })

  it('sin token → 401', async () => {
    const res = await request(app).get('/api/usuarios')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/usuarios', () => {
  const nuevo = { nombre: 'Rosa Técnica', email: 'Tecnico3@Olivos.demo', password: 'segura123', rol: 'mantenimiento' }

  it('crea el usuario en el edificio del admin y ya puede iniciar sesión', async () => {
    const res = await request(app).post('/api/usuarios').set('Authorization', await tokenDe('admin@olivos.demo')).send(nuevo)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      nombre: 'Rosa Técnica',
      email: 'tecnico3@olivos.demo', // normalizado a minúsculas
      rol: 'mantenimiento',
      edificioId: 'edificio-a',
      edificioNombre: 'Residencial Los Olivos',
    })
    expect(JSON.stringify(res.body)).not.toContain('password')

    const login = await request(app).post('/api/auth/login').send({ email: 'tecnico3@olivos.demo', password: 'segura123' })
    expect(login.status).toBe(200)
  })

  it('ignora un edificioId enviado en el body (siempre usa el del admin)', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ ...nuevo, edificioId: 'edificio-b' })
    expect(res.body.edificioId).toBe('edificio-a')
  })

  it('email duplicado → 400 VALIDACION', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ ...nuevo, email: 'residente1@olivos.demo' })
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'VALIDACION', message: 'Ya existe un usuario con ese correo' })
  })

  it('contraseña corta y rol inválido → 400 con los dos campos', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', await tokenDe('admin@olivos.demo'))
      .send({ ...nuevo, password: '123', rol: 'jefe' })
    expect(res.status).toBe(400)
    const campos = res.body.error.details.map((d: { campo: string }) => d.campo)
    expect(campos).toEqual(expect.arrayContaining(['password', 'rol']))
  })

  it('un residente no puede crear usuarios → 403', async () => {
    const res = await request(app).post('/api/usuarios').set('Authorization', await tokenDe('residente1@olivos.demo')).send(nuevo)
    expect(res.status).toBe(403)
  })
})
