import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, usuarioActual } from '../../middleware/auth.js'
import { emailSchema } from '../usuarios/schemas.js'
import { login, obtenerUsuario } from './service.js'

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
