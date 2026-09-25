// Sin claves VAPID (entorno de test por defecto): el push queda desactivado sin romper nada.
import { expect, it, vi } from 'vitest'
import { buscarUsuario, prisma, reiniciarBD } from './helpers/fakePrisma.js'

vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }))
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails: vi.fn() } }))
const { enviarPush } = await import('../src/lib/push.js')

it('sin claves VAPID no envía nada ni lanza error', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  reiniciarBD()
  const usuarioId = buscarUsuario('residente1@olivos.demo').id
  await prisma.suscripcionPush.upsert({
    where: { endpoint: 'https://fcm.googleapis.com/celular' },
    create: { usuarioId, endpoint: 'https://fcm.googleapis.com/celular', p256dh: 'p', auth: 'a' },
    update: {},
  })

  await expect(enviarPush(usuarioId, { titulo: 'FixIt', mensaje: 'm', url: '/u' })).resolves.toBeUndefined()
  expect(sendNotification).not.toHaveBeenCalled()
})
