import request from 'supertest'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarUsuario, desactivarUsuario, PASSWORD_DEMO, reiniciarBD } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { default: app } = await import('../src/index.js')

async function loginComo(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
  return res.body.token as string
}

beforeEach(() => reiniciarBD())

describe('POST /api/auth/login', () => {
  it('con credenciales correctas devuelve token y usuario (sin passwordHash)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@olivos.demo', password: PASSWORD_DEMO })

    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.usuario).toEqual({
      id: buscarUsuario('admin@olivos.demo').id,
      nombre: 'Ana Torres',
      email: 'admin@olivos.demo',
      rol: 'administrador',
      edificioId: 'edificio-a',
      edificioNombre: 'Residencial Los Olivos',
    })
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('acepta el email con mayúsculas y espacios', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  ADMIN@Olivos.demo ', password: PASSWORD_DEMO })
    expect(res.status).toBe(200)
  })

  it('el token lleva id, rol y edificio', async () => {
    const payload = jwt.decode(await loginComo('tecnico1@olivos.demo')) as Record<string, unknown>
    expect(payload).toMatchObject({
      sub: buscarUsuario('tecnico1@olivos.demo').id,
      rol: 'mantenimiento',
      edificioId: 'edificio-a',
    })
  })

  it.each([
    ['contraseña incorrecta', 'admin@olivos.demo', 'otra-clave'],
    ['email inexistente', 'nadie@olivos.demo', PASSWORD_DEMO],
    ['usuario desactivado', 'inactivo@olivos.demo', PASSWORD_DEMO],
  ])('%s → 401 con el mismo mensaje genérico', async (_caso, email, password) => {
    const res = await request(app).post('/api/auth/login').send({ email, password })
    expect(res.status).toBe(401)
    expect(res.body.error).toEqual({ code: 'NO_AUTENTICADO', message: 'Correo o contraseña incorrectos' })
  })

  it('body inválido → 400 VALIDACION con detalle por campo', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
    const campos = res.body.error.details.map((d: { campo: string }) => d.campo)
    expect(campos).toEqual(expect.arrayContaining(['email', 'password']))
  })
})

describe('GET /api/auth/me', () => {
  it('con token válido devuelve el usuario actual', async () => {
    const token = await loginComo('residente1@olivos.demo')
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('residente1@olivos.demo')
    expect(res.body.rol).toBe('residente')
  })

  it.each([
    ['sin header', undefined],
    ['sin "Bearer"', 'abc.def.ghi'],
    ['token basura', 'Bearer abc.def.ghi'],
    ['token firmado con otra clave', `Bearer ${jwt.sign({ sub: 'x', rol: 'administrador', edificioId: 'edificio-a' }, 'otra-clave-cualquiera')}`],
  ])('%s → 401 NO_AUTENTICADO', async (_caso, header) => {
    const req = request(app).get('/api/auth/me')
    if (header) req.set('Authorization', header)
    const res = await req
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('NO_AUTENTICADO')
  })

  it('token vencido → 401', async () => {
    const vencido = jwt.sign(
      { sub: buscarUsuario('admin@olivos.demo').id, rol: 'administrador', edificioId: 'edificio-a' },
      process.env['JWT_SECRET']!,
      { expiresIn: -10 },
    )
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vencido}`)
    expect(res.status).toBe(401)
  })

  it('si el usuario fue desactivado después del login, su token deja de servir', async () => {
    const token = await loginComo('residente1@olivos.demo')
    desactivarUsuario('residente1@olivos.demo')
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })
})
