import { z } from 'zod'

export const rolSchema = z.enum(['residente', 'mantenimiento', 'administrador'])

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('El correo no es válido'))

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  email: emailSchema,
  // bcrypt solo considera los primeros 72 bytes
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
  rol: rolSchema,
})

export const listarUsuariosSchema = z.object({
  rol: rolSchema.optional(),
})
