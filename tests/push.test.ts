// Envío de Web Push con web-push SIMULADO (no se contacta ningún servicio real).
// Las claves VAPID se fijan ANTES de importar push.ts (el caso "sin claves" está en push-sin-vapid.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarUsuario, prisma, reiniciarBD, todasLasSuscripciones } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { sendNotification, setVapidDetails } = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }))
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails } }))
vi.stubEnv('VAPID_PUBLIC_KEY', 'clave-publica')
vi.stubEnv('VAPID_PRIVATE_KEY', 'clave-privada')
vi.stubEnv('VAPID_SUBJECT', 'mailto:equipo@fixit.demo')
const { enviarPush } = await import('../src/lib/push.js')

const PAYLOAD = { titulo: 'FixIt', mensaje: 'Tu incidencia fue resuelta.', url: '/incidencias/123' }

function suscribir(email: string, endpoint: string) {
  return prisma.suscripcionPush.upsert({
    where: { endpoint },
    create: { usuarioId: buscarUsuario(email).id, endpoint, p256dh: 'p256', auth: 'auth' },
    update: {},
  })
}

beforeEach(() => {
  reiniciarBD()
  sendNotification.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('enviarPush', () => {
  it('envía el payload JSON a TODOS los dispositivos del usuario (y a nadie más)', async () => {
    await suscribir('residente1@olivos.demo', 'https://fcm.googleapis.com/celular')
    await suscribir('residente1@olivos.demo', 'https://fcm.googleapis.com/laptop')
    await suscribir('residente2@olivos.demo', 'https://fcm.googleapis.com/otro')
    sendNotification.mockResolvedValue({ statusCode: 201 })

    await enviarPush(buscarUsuario('residente1@olivos.demo').id, PAYLOAD)

    expect(setVapidDetails).toHaveBeenCalledWith('mailto:equipo@fixit.demo', 'clave-publica', 'clave-privada')
    expect(sendNotification.mock.calls.map((c) => c[0].endpoint).sort()).toEqual([
      'https://fcm.googleapis.com/celular',
      'https://fcm.googleapis.com/laptop',
    ])
    expect(JSON.parse(sendNotification.mock.calls[0]![1])).toEqual(PAYLOAD)
  })

  it('borra las suscripciones vencidas (410/404) y conserva las que fallaron por otro motivo', async () => {
    await suscribir('residente1@olivos.demo', 'https://fcm.googleapis.com/vencida')
    await suscribir('residente1@olivos.demo', 'https://fcm.googleapis.com/caida-temporal')
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      throw Object.assign(new Error('push falló'), { statusCode: sub.endpoint.endsWith('vencida') ? 410 : 503 })
    })

    await expect(enviarPush(buscarUsuario('residente1@olivos.demo').id, PAYLOAD)).resolves.toBeUndefined()
    expect(todasLasSuscripciones().map((s) => s.endpoint)).toEqual(['https://fcm.googleapis.com/caida-temporal'])
  })
})
