import { Router } from 'express'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../lib/errors.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true })
})

// Diagnóstico: confirma que la API llega a la base de datos (útil tras cada deploy)
healthRouter.get('/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    console.error('Health check de BD falló', error)
    throw new ApiError(500, 'INTERNO', 'La API no puede conectarse a la base de datos')
  }
  res.json({ ok: true, db: 'up' })
})
