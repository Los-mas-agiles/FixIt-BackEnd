import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, usuarioActual } from '../../middleware/auth.js'
import { emailSchema, passwordSchema } from '../usuarios/schemas.js'
import { cambiarPassword, login, obtenerUsuario } from './service.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
})

// POST /auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)
  res.json(await login(email, password))
})

// GET /auth/me
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await obtenerUsuario(usuarioActual(req).id))
})

const cambiarPasswordSchema = z.object({
  actual: z.string().min(1, 'Ingresa tu contraseña actual').max(200),
  nueva: passwordSchema,
})

// PATCH /auth/password  { actual, nueva }
authRouter.patch('/password', requireAuth, async (req, res) => {
  const { actual, nueva } = cambiarPasswordSchema.parse(req.body)
  await cambiarPassword(usuarioActual(req).id, actual, nueva)
  res.json({ ok: true })
})
