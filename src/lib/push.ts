// Envío de notificaciones Web Push (VAPID) a todos los dispositivos suscritos de un usuario.
import webpush from 'web-push'
import { env } from '../config/env.js'
import { prisma } from './prisma.js'

export interface PayloadPush {
  titulo: string
  mensaje: string
  url: string
}

let configurado = false

/** Configura VAPID la primera vez. Devuelve false si faltan las claves (el push queda desactivado). */
function configurar(): boolean {
  if (configurado) return true
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configurado = true
  return true
}

/**
 * Envía el push a todos los dispositivos del usuario. NUNCA lanza error:
 * las notificaciones ya quedaron guardadas en la BD; el push es un aviso extra.
 * Las suscripciones vencidas (404/410) se borran solas.
 */
export async function enviarPush(usuarioId: string, payload: PayloadPush): Promise<void> {
  if (!configurar()) {
    console.warn('Web Push desactivado: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT')
    return
  }

  const suscripciones = await prisma.suscripcionPush.findMany({ where: { usuarioId } })
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, timeout: 5000 }, // si el celular está apagado, el aviso espera hasta 24 h
        )
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // El usuario desinstaló la app o revocó el permiso: la suscripción ya no sirve
          await prisma.suscripcionPush.deleteMany({ where: { endpoint: s.endpoint } })
        } else {
          console.warn(`No se pudo enviar el push (${status ?? 'sin respuesta'})`)
        }
      }
    }),
  )
}
