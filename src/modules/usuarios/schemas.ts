import { z } from 'zod'

export const rolSchema = z.enum(['residente', 'mantenimiento', 'administrador'])

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('El correo no es válido'))
  .meta({ format: 'email' }) // para la documentación: Zod solo describe la entrada del pipe (un string)

// bcrypt solo considera los primeros 72 bytes
export const passwordSchema = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72)

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  email: emailSchema,
  password: passwordSchema,
  rol: rolSchema,
})

export const listarUsuariosSchema = z.object({
  rol: rolSchema.optional(),
  // ?inactivos=true → solo los desactivados (para poder reactivarlos)
  inactivos: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
})

export const actualizarUsuarioSchema = z
  .object({
    activo: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((datos) => datos.activo !== undefined || datos.password !== undefined, {
    message: 'Envía "activo", "password" o ambos',
  })

export const idUsuarioSchema = z.uuid()
