import { z } from 'zod'
import { prioridadSchema } from '../incidencias/schemas.js'

const fechaIso = z.iso.datetime({ offset: true, error: 'La fecha debe estar en formato ISO 8601 (ej. 2026-09-25T00:00:00Z)' })

const periodoSchema = z.object({
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
})

export const kpisSchema = periodoSchema.extend({
  prioridad: prioridadSchema.optional(),
})

export const cfdSchema = periodoSchema
