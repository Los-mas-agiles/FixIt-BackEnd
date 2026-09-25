import { z } from 'zod'

export const estadoSchema = z.enum(['pendiente', 'en_proceso', 'resuelto'])
export const prioridadSchema = z.enum(['alta', 'media', 'baja'])

export const crearIncidenciaSchema = z.object({
  descripcion: z
    .string({ error: 'La descripción es obligatoria' })
    .trim()
    .min(10, 'La descripción debe tener al menos 10 caracteres')
    .max(1000, 'La descripción no puede superar los 1000 caracteres'),
})

export const listarIncidenciasSchema = z.object({
  estado: estadoSchema.optional(),
  prioridad: prioridadSchema.optional(),
  asignadoA: z.literal('me').optional(),
})

export const idIncidenciaSchema = z.uuid()
