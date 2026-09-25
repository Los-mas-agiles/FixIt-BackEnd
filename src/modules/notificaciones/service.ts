import { z } from 'zod'
import { env } from '../../config/env.js'
import { esServicioPushPermitido } from '../../domain/notificaciones.js'
import { ApiError } from '../../lib/errors.js'
import { prisma } from '../../lib/prisma.js'
import type { Notificacion } from '../../types/models.js'
import type { UsuarioAutenticado } from '../../types/express.js'

const MAX_NOTIFICACIONES = 50

interface NotificacionBD {
  id: string
  incidenciaId: string
  mensaje: string
  leida: boolean
  fecha: Date
}

function aNotificacion(n: NotificacionBD): Notificacion {
  return { id: n.id, incidenciaId: n.incidenciaId, mensaje: n.mensaje, leida: n.leida, fecha: n.fecha.toISOString() }
}

export async function listarNotificaciones(usuario: UsuarioAutenticado): Promise<Notificacion[]> {
  const notificaciones = await prisma.notificacion.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { fecha: 'desc' },
    take: MAX_NOTIFICACIONES,
  })
  return notificaciones.map(aNotificacion)
}

export async function marcarLeida(usuario: UsuarioAutenticado, id: string): Promise<Notificacion> {
  const noEncontrada = new ApiError(404, 'NO_ENCONTRADO', 'La notificación no existe')
  if (!z.uuid().safeParse(id).success) throw noEncontrada

  // Solo puede marcar las suyas: la de otro usuario se trata como inexistente
  const { count } = await prisma.notificacion.updateMany({ where: { id, usuarioId: usuario.id }, data: { leida: true } })
  if (count === 0) throw noEncontrada

  const notificacion = await prisma.notificacion.findFirst({ where: { id, usuarioId: usuario.id } })
  if (!notificacion) throw noEncontrada
  return aNotificacion(notificacion)
}

export async function marcarTodasLeidas(usuario: UsuarioAutenticado): Promise<void> {
  await prisma.notificacion.updateMany({ where: { usuarioId: usuario.id, leida: false }, data: { leida: true } })
}

export function clavePublicaVapid(): string {
  if (!env.VAPID_PUBLIC_KEY) {
    console.error('Web Push no configurado: falta VAPID_PUBLIC_KEY')
    throw new ApiError(500, 'INTERNO', 'Las notificaciones push no están disponibles')
  }
  return env.VAPID_PUBLIC_KEY
}

export const suscripcionSchema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine(esServicioPushPermitido, 'La suscripción debe ser de un servicio de notificaciones del navegador'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
})

export async function guardarSuscripcion(usuario: UsuarioAutenticado, datos: z.infer<typeof suscripcionSchema>): Promise<void> {
  // Si el endpoint ya existía (ej. otro usuario usó el mismo navegador), pasa a ser del usuario actual
  await prisma.suscripcionPush.upsert({
    where: { endpoint: datos.endpoint },
    create: { usuarioId: usuario.id, endpoint: datos.endpoint, p256dh: datos.keys.p256dh, auth: datos.keys.auth },
    update: { usuarioId: usuario.id, p256dh: datos.keys.p256dh, auth: datos.keys.auth },
  })
}

export async function borrarSuscripcion(usuario: UsuarioAutenticado, endpoint: string): Promise<void> {
  await prisma.suscripcionPush.deleteMany({ where: { endpoint, usuarioId: usuario.id } })
}
