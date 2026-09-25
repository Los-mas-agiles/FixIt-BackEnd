import request from 'supertest'
import { describe, expect, it } from 'vitest'
import app from '../src/index.js'

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('incluye las cabeceras de seguridad y no revela Express', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})

describe('formato de errores del contrato', () => {
  it('ruta inexistente → 404 NO_ENCONTRADO', async () => {
    const res = await request(app).get('/api/no-existe')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NO_ENCONTRADO')
    expect(typeof res.body.error.message).toBe('string')
  })

  it('JSON mal formado → 400 VALIDACION', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ esto no es json')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDACION')
  })
})
