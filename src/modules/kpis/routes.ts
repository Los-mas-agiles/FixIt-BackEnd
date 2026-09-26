import { Router } from 'express'
import { requireAuth, requireRol, usuarioActual } from '../../middleware/auth.js'
import { cfdSchema, kpisSchema } from './schemas.js'
import { obtenerCfd, obtenerKpis } from './service.js'

export const kpisRouter = Router()

kpisRouter.use(requireAuth, requireRol('administrador'))

// GET /kpis?desde=ISO&hasta=ISO&prioridad=alta
kpisRouter.get('/', async (req, res) => {
  res.json(await obtenerKpis(usuarioActual(req), kpisSchema.parse(req.query)))
})

// GET /kpis/cfd?desde=ISO&hasta=ISO
kpisRouter.get('/cfd', async (req, res) => {
  res.json(await obtenerCfd(usuarioActual(req), cfdSchema.parse(req.query)))
})
