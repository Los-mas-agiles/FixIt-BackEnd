import { afterEach, describe, expect, it, vi } from 'vitest'

// Cada test recarga el módulo con un process.env distinto
async function cargarEnv(extra: Record<string, string>) {
  vi.resetModules()
  for (const [clave, valor] of Object.entries(extra)) vi.stubEnv(clave, valor)
  return (await import('../src/config/env.js')).env
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('config/env', () => {
  it('trata las variables opcionales vacías como no definidas', async () => {
    const env = await cargarEnv({ VAPID_PUBLIC_KEY: '', GEMINI_API_KEY: '   ' })
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it('separa CORS_ORIGINS por comas', async () => {
    const env = await cargarEnv({ CORS_ORIGINS: 'http://localhost:5173, https://fixit-web.vercel.app' })
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://fixit-web.vercel.app'])
  })

  it('falla con un mensaje claro si JWT_SECRET es muy corto', async () => {
    await expect(cargarEnv({ JWT_SECRET: 'corto' })).rejects.toThrow(/JWT_SECRET/)
  })
})
