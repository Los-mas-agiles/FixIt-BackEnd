import type { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { default: app } = await import('../src/index.js')
const { openapi } = await import('../src/docs/openapi.js')
const { authRouter } = await import('../src/modules/auth/routes.js')
const { usuariosRouter } = await import('../src/modules/usuarios/routes.js')
const { incidenciasRouter } = await import('../src/modules/incidencias/routes.js')
const { kpisRouter } = await import('../src/modules/kpis/routes.js')
const { notificacionesRouter, pushRouter } = await import('../src/modules/notificaciones/routes.js')
const { healthRouter } = await import('../src/modules/health/routes.js')

// Mismos prefijos que en src/index.ts
const MONTAJES: [string, Router][] = [
  ['/health', healthRouter],
  ['/auth', authRouter],
  ['/usuarios', usuariosRouter],
  ['/incidencias', incidenciasRouter],
  ['/kpis', kpisRouter],
  ['/notificaciones', notificacionesRouter],
  ['/push', pushRouter],
]

interface Capa {
  route?: { path: string; methods: Record<string, boolean> }
}

/** Todas las rutas registradas en Express, como "get /incidencias/{id}". */
function rutasDeExpress(): string[] {
  return MONTAJES.flatMap(([prefijo, router]) =>
    (router.stack as Capa[])
      .filter((capa) => capa.route)
      .flatMap((capa) =>
        Object.keys(capa.route!.methods).map((metodo) => {
          const ruta = (prefijo + (capa.route!.path === '/' ? '' : capa.route!.path)).replace(/:(\w+)/g, '{$1}')
          return `${metodo} ${ruta}`
        }),
      ),
  ).sort()
}

const paths = openapi.paths as Record<string, Record<string, { security?: unknown[]; requestBody?: unknown; parameters?: { name: string; schema: { enum?: string[] } }[] }>>
const rutasDocumentadas = () => Object.entries(paths).flatMap(([ruta, ops]) => Object.keys(ops).map((m) => `${m} ${ruta}`)).sort()

describe('documentación OpenAPI', () => {
  it('documenta TODAS las rutas de la API, y solo rutas que existen', () => {
    expect(rutasDocumentadas()).toEqual(rutasDeExpress())
  })

  it('todas las referencias $ref apuntan a un componente que existe', () => {
    const texto = JSON.stringify(openapi)
    const refs = [...texto.matchAll(/"\$ref":"#\/components\/(\w+)\/(\w+)"/g)]
    expect(refs.length).toBeGreaterThan(20)
    const componentes = openapi.components as unknown as Record<string, Record<string, unknown>>
    for (const [, tipo, nombre] of refs) expect(componentes[tipo!]?.[nombre!], `${tipo}/${nombre}`).toBeDefined()
  })

  it('solo el login y la salud son públicos; el resto exige token', () => {
    const publicas = Object.entries(paths).flatMap(([ruta, ops]) => Object.entries(ops).filter(([, op]) => op.security?.length === 0).map(([m]) => `${m} ${ruta}`))
    expect(publicas.sort()).toEqual(['get /health', 'get /health/db', 'post /auth/login'])
  })

  it('los cuerpos y query params salen de los mismos esquemas Zod que validan la API', () => {
    const login = paths['/auth/login']!.post!.requestBody as { content: { 'application/json': { schema: { required: string[]; properties: Record<string, { format?: string; pattern?: string }> } } } }
    const schema = login.content['application/json'].schema
    expect(schema.required.sort()).toEqual(['email', 'password'])
    expect(schema.properties.email).toMatchObject({ format: 'email' })
    expect(schema.properties.email!.pattern).toBeUndefined() // sin el regex larguísimo
    const inactivos = paths['/usuarios']!.get!.parameters!.find((p) => p.name === 'inactivos')
    expect(inactivos?.schema.enum).toEqual(['true', 'false'])
  })

  it('GET /api/openapi.json devuelve la especificación', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ openapi: '3.1.0', info: { title: 'FixIt API' } })
  })

  it('GET /api/docs sirve Swagger UI con versión fija, SRI y una CSP propia', async () => {
    const res = await request(app).get('/api/docs')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle\.js" integrity="sha384-/)
    expect(res.headers['content-security-policy']).toContain("script-src 'self' https://cdn.jsdelivr.net")
    expect(res.headers['content-security-policy']).not.toContain("script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'")

    const init = await request(app).get('/api/docs/init.js')
    expect(init.headers['content-type']).toMatch(/javascript/)
    expect(init.text).toContain("url: '/api/openapi.json'")
  })

  it('las demás rutas mantienen la CSP estricta de la API', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'")
  })
})
