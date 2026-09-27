import { Router } from 'express'
import { requireAuth, usuarioActual } from '../../middleware/auth.js'
import { cambiarPasswordSchema, loginSchema } from './schemas.js'
import { cambiarPassword, login, obtenerUsuario } from './service.js'

export const authRouter = Router()

// POST /auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  res.json(await login(email, password))
})

// GET /auth/me
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await obtenerUsuario(usuarioActual(req).id))
})

// PATCH /auth/password  { actual, nueva }
authRouter.patch('/password', requireAuth, async (req, res) => {
  const { actual, nueva } = cambiarPasswordSchema.parse(req.body)
  await cambiarPassword(usuarioActual(req).id, actual, nueva)
  res.json({ ok: true })
})
