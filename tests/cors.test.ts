import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { crearValidadorOrigen } from '../src/domain/cors.js'
import app from '../src/index.js'

describe('crearValidadorOrigen', () => {
  const permitido = crearValidadorOrigen(['http://localhost:5173', 'https://fix-it-front-end*.vercel.app'])

  it.each([
    'http://localhost:5173',
    'https://fix-it-front-end.vercel.app',
    'https://fix-it-front-end-git-feature-login-agiles.vercel.app',
    'https://fix-it-front-end-a1b2c3d4-agiles.vercel.app',
  ])('permite %s', (origen) => {
    expect(permitido(origen)).toBe(true)
  })

  it.each([
    ['otro puerto', 'http://localhost:3001'],
    ['otro proyecto de Vercel', 'https://sitio-malicioso.vercel.app'],
    ['el comodín no puede saltar a otro dominio', 'https://fix-it-front-end.evil.com/.vercel.app'],
    ['subdominio con punto', 'https://fix-it-front-end.x.vercel.app'],
    ['http en vez de https', 'http://fix-it-front-end.vercel.app'],
  ])('bloquea %s', (_caso, origen) => {
    expect(permitido(origen)).toBe(false)
  })
})

describe('CORS en la API (valores por defecto)', () => {
  it('responde con Access-Control-Allow-Origin a un preview del frontend', async () => {
    const origen = 'https://fix-it-front-end-git-feature-kanban-agiles.vercel.app'
    const res = await request(app).options('/api/auth/login').set('Origin', origen).set('Access-Control-Request-Method', 'POST')
    expect(res.headers['access-control-allow-origin']).toBe(origen)
  })

  it('no autoriza a un sitio ajeno', async () => {
    const res = await request(app).options('/api/auth/login').set('Origin', 'https://sitio-malicioso.com').set('Access-Control-Request-Method', 'POST')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
