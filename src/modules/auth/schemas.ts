import { z } from 'zod'
import { emailSchema, passwordSchema } from '../usuarios/schemas.js'

// Los ejemplos (una cuenta de demo) se usan en Swagger para probar el login con un clic
export const loginSchema = z.object({
  email: emailSchema.meta({ format: 'email', examples: ['admin@olivos.demo'] }),
  password: z.string().min(1, 'Ingresa tu contraseña').max(200).meta({ examples: ['FixIt2026!'] }),
})

export const cambiarPasswordSchema = z.object({
  actual: z.string().min(1, 'Ingresa tu contraseña actual').max(200),
  nueva: passwordSchema,
})
