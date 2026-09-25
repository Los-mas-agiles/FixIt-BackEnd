import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, usuarioActual } from '../../middleware/auth.js'
import {
  borrarSuscripcion,
  clavePublicaVapid,
  guardarSuscripcion,
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  suscripcionSchema,
} from './service.js'

// GET/PATCH/POST /notificaciones
export const notificacionesRouter = Router()
notificacionesRouter.use(requireAuth)

notificacionesRouter.get('/', async (req, res) => {
  res.json(await listarNotificaciones(usuarioActual(req)))
})

notificacionesRouter.patch('/:id/leida', async (req, res) => {
  res.json(await marcarLeida(usuarioActual(req), req.params.id))
})

notificacionesRouter.post('/leer-todas', async (req, res) => {
  await marcarTodasLeidas(usuarioActual(req))
  res.json({ ok: true })
})

// /push: suscripciones Web Push del dispositivo
export const pushRouter = Router()
pushRouter.use(requireAuth)

pushRouter.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: clavePublicaVapid() })
})

pushRouter.post('/suscripciones', async (req, res) => {
  await guardarSuscripcion(usuarioActual(req), suscripcionSchema.parse(req.body))
  res.status(201).json({ ok: true })
})

pushRouter.delete('/suscripciones', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().min(1).max(1000) }).parse(req.body)
  await borrarSuscripcion(usuarioActual(req), endpoint)
  res.json({ ok: true })
})
