import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buscarUsuario,
  crearIncidenciaDePrueba,
  PASSWORD_DEMO,
  reiniciarBD,
  simularFalloAlCrearIncidencia,
  todasLasIncidencias,
} from './helpers/fakePrisma.js'
import { archivos, reiniciarStorage } from './helpers/fakeStorage.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))
const { default: app } = await import('../src/index.js')

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const DESCRIPCION = 'Hay una fuga de agua debajo del lavadero de la cocina'

async function tokenDe(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO })
  return `Bearer ${res.body.token}`
}

beforeEach(() => {
  reiniciarBD()
  reiniciarStorage()
})

describe('POST /api/incidencias', () => {
  it('el residente reporta sin foto: queda pendiente y clasificada (fallback en Fase 2)', async () => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', `  ${DESCRIPCION}  `)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      edificioId: 'edificio-a',
      residente: { id: buscarUsuario('residente1@olivos.demo').id, nombre: 'María Rojas' },
      descripcion: DESCRIPCION, // sin espacios sobrantes
      fotoUrl: null,
      tipo: 'otros',
      prioridad: 'media',
      clasificadoPor: 'fallback',
      estado: 'pendiente',
      asignadoA: null,
      fechaInicioProceso: null,
      fechaResolucion: null,
    })
    expect(new Date(res.body.fechaCreacion).toISOString()).toBe(res.body.fechaCreacion)
  })

  it('con foto PNG: la guarda en <edificio>/<id>.png y devuelve una URL firmada', async () => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', DESCRIPCION)
      .attach('foto', PNG, { filename: 'foto.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    const path = `edificio-a/${res.body.id}.png`
    expect(archivos.get(path)?.contentType).toBe('image/png')
    expect(res.body.fotoUrl).toBe(`https://storage.test/firmada/${path}?token=abc`)
  })

  it('usa el tipo REAL del archivo, no el nombre: un JPG llamado .png se guarda como .jpg', async () => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', DESCRIPCION)
      .attach('foto', JPG, { filename: 'engaño.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(archivos.get(`edificio-a/${res.body.id}.jpg`)?.contentType).toBe('image/jpeg')
  })

  it('un archivo que no es imagen → 400 y no se guarda nada', async () => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', DESCRIPCION)
      .attach('foto', Buffer.from('<?php system($_GET["c"]); ?>'), { filename: 'foto.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'VALIDACION', message: 'La foto debe ser una imagen JPG, PNG o WEBP' })
    expect(archivos.size).toBe(0)
    expect(todasLasIncidencias()).toHaveLength(0)
  })

  it('foto de más de 4 MB → 400 con mensaje claro', async () => {
    const grande = Buffer.concat([JPG, Buffer.alloc(4 * 1024 * 1024)])
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', DESCRIPCION)
      .attach('foto', grande, { filename: 'grande.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('La foto no puede pesar más de 4 MB')
  })

  it.each([
    ['muy corta', 'Se rompió'],
    ['vacía', '   '],
  ])('descripción %s → 400 VALIDACION', async (_caso, descripcion) => {
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', descripcion)
    expect(res.status).toBe(400)
    expect(res.body.error.details[0]).toEqual({ campo: 'descripcion', mensaje: 'La descripción debe tener al menos 10 caracteres' })
  })

  it('sin campo descripción → 400', async () => {
    const res = await request(app).post('/api/incidencias').set('Authorization', await tokenDe('residente1@olivos.demo')).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })

  it('si la BD falla después de subir la foto, la foto se borra (no quedan huérfanas)', async () => {
    simularFalloAlCrearIncidencia()
    const res = await request(app)
      .post('/api/incidencias')
      .set('Authorization', await tokenDe('residente1@olivos.demo'))
      .field('descripcion', DESCRIPCION)
      .attach('foto', PNG, { filename: 'foto.png', contentType: 'image/png' })

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNO')
    expect(archivos.size).toBe(0)
  })

  it.each(['tecnico1@olivos.demo', 'admin@olivos.demo'])('%s no puede reportar (solo residentes) → 403', async (email) => {
    const res = await request(app).post('/api/incidencias').set('Authorization', await tokenDe(email)).field('descripcion', DESCRIPCION)
    expect(res.status).toBe(403)
  })

  it('sin sesión → 401', async () => {
    const res = await request(app).post('/api/incidencias').field('descripcion', DESCRIPCION)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/incidencias', () => {
  beforeEach(() => {
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', descripcion: 'María: vieja', fechaCreacion: new Date('2026-10-01T10:00:00Z') })
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo', descripcion: 'María: nueva', fechaCreacion: new Date('2026-10-02T10:00:00Z'), fotoPath: 'edificio-a/x.jpg' })
    crearIncidenciaDePrueba({ residenteEmail: 'residente2@olivos.demo', descripcion: 'Jorge: en proceso', estado: 'en_proceso', prioridad: 'alta', asignadoAEmail: 'tecnico1@olivos.demo' })
    crearIncidenciaDePrueba({ residenteEmail: 'residente1@sanborja.demo', descripcion: 'San Borja: ajena' })
  })

  const descripciones = (body: { descripcion: string }[]) => body.map((i) => i.descripcion)

  it('el residente ve SOLO sus incidencias, de la más nueva a la más vieja', async () => {
    const res = await request(app).get('/api/incidencias').set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.status).toBe(200)
    expect(descripciones(res.body)).toEqual(['María: nueva', 'María: vieja'])
    expect(res.body[0].fotoUrl).toBe('https://storage.test/firmada/edificio-a/x.jpg?token=abc')
    expect(res.body[1].fotoUrl).toBeNull()
  })

  it('el admin y el técnico ven todas las de SU edificio, nunca las de otro', async () => {
    for (const email of ['admin@olivos.demo', 'tecnico1@olivos.demo']) {
      const res = await request(app).get('/api/incidencias').set('Authorization', await tokenDe(email))
      expect(descripciones(res.body)).toHaveLength(3)
      expect(descripciones(res.body)).not.toContain('San Borja: ajena')
    }
  })

  it('el admin de San Borja solo ve la de su edificio', async () => {
    const res = await request(app).get('/api/incidencias').set('Authorization', await tokenDe('admin@sanborja.demo'))
    expect(descripciones(res.body)).toEqual(['San Borja: ajena'])
  })

  it('filtra por estado, prioridad y "asignadas a mí"', async () => {
    const tecnico = await tokenDe('tecnico1@olivos.demo')
    const porEstado = await request(app).get('/api/incidencias?estado=en_proceso').set('Authorization', tecnico)
    const porPrioridad = await request(app).get('/api/incidencias?prioridad=alta').set('Authorization', tecnico)
    const mias = await request(app).get('/api/incidencias?asignadoA=me').set('Authorization', tecnico)

    expect(descripciones(porEstado.body)).toEqual(['Jorge: en proceso'])
    expect(descripciones(porPrioridad.body)).toEqual(['Jorge: en proceso'])
    expect(descripciones(mias.body)).toEqual(['Jorge: en proceso'])
    expect(mias.body[0].asignadoA).toEqual({ id: buscarUsuario('tecnico1@olivos.demo').id, nombre: 'Carlos Quispe' })
  })

  it('filtro inválido → 400', async () => {
    const res = await request(app).get('/api/incidencias?estado=cerrado').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/incidencias/:id', () => {
  it('devuelve el detalle con el historial (la creación como primer cambio)', async () => {
    const incidencia = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app).get(`/api/incidencias/${incidencia.id}`).set('Authorization', await tokenDe('residente1@olivos.demo'))

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(incidencia.id)
    expect(res.body.historial).toHaveLength(1)
    expect(res.body.historial[0]).toMatchObject({
      estadoAnterior: null,
      estadoNuevo: 'pendiente',
      usuario: { nombre: 'María Rojas' },
    })
  })

  it('un residente no puede ver la incidencia de otro residente → 404', async () => {
    const ajena = crearIncidenciaDePrueba({ residenteEmail: 'residente2@olivos.demo' })
    const res = await request(app).get(`/api/incidencias/${ajena.id}`).set('Authorization', await tokenDe('residente1@olivos.demo'))
    expect(res.status).toBe(404)
  })

  it('el admin de otro edificio recibe 404 (no se revela que existe)', async () => {
    const incidencia = crearIncidenciaDePrueba({ residenteEmail: 'residente1@olivos.demo' })
    const res = await request(app).get(`/api/incidencias/${incidencia.id}`).set('Authorization', await tokenDe('admin@sanborja.demo'))
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual({ code: 'NO_ENCONTRADO', message: 'La incidencia no existe' })
  })

  it('id con formato inválido → 404 (no 500)', async () => {
    const res = await request(app).get('/api/incidencias/no-es-un-uuid').set('Authorization', await tokenDe('admin@olivos.demo'))
    expect(res.status).toBe(404)
  })
})
