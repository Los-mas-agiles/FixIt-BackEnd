import { Router } from 'express'
import multer from 'multer'
import { requireAuth, requireRol, usuarioActual } from '../../middleware/auth.js'
import {
  asignarSchema,
  cambiarEstadoSchema,
  corregirClasificacionSchema,
  crearIncidenciaSchema,
  listarIncidenciasSchema,
} from './schemas.js'
import {
  asignarTecnico,
  cambiarEstado,
  corregirClasificacion,
  crearIncidencia,
  listarIncidencias,
  obtenerIncidencia,
} from './service.js'

export const MAX_TAMANO_FOTO = 4 * 1024 * 1024 // 4 MB (Vercel rechaza bodies > 4.5 MB)

// La foto queda en memoria (no en disco): en Vercel no hay disco persistente
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TAMANO_FOTO, files: 1, fields: 5 },
})

export const incidenciasRouter = Router()

incidenciasRouter.use(requireAuth)

// POST /incidencias (multipart/form-data: descripcion + foto opcional)
incidenciasRouter.post('/', requireRol('residente'), subida.single('foto'), async (req, res) => {
  const { descripcion } = crearIncidenciaSchema.parse(req.body ?? {})
  const foto = req.file ? { buffer: req.file.buffer } : undefined
  res.status(201).json(await crearIncidencia(usuarioActual(req), descripcion, foto))
})

// GET /incidencias?estado=&prioridad=&asignadoA=me
incidenciasRouter.get('/', async (req, res) => {
  const filtros = listarIncidenciasSchema.parse(req.query)
  res.json(await listarIncidencias(usuarioActual(req), filtros))
})

// GET /incidencias/:id
incidenciasRouter.get('/:id', async (req, res) => {
  res.json(await obtenerIncidencia(usuarioActual(req), req.params.id))
})

// PATCH /incidencias/:id/estado  { estado }
incidenciasRouter.patch<{ id: string }>('/:id/estado', requireRol('mantenimiento', 'administrador'), async (req, res) => {
  const { estado } = cambiarEstadoSchema.parse(req.body)
  res.json(await cambiarEstado(usuarioActual(req), req.params.id, estado))
})

// PATCH /incidencias/:id/asignacion  { tecnicoId: string | null }
incidenciasRouter.patch<{ id: string }>('/:id/asignacion', requireRol('administrador'), async (req, res) => {
  const { tecnicoId } = asignarSchema.parse(req.body)
  res.json(await asignarTecnico(usuarioActual(req), req.params.id, tecnicoId))
})

// PATCH /incidencias/:id/clasificacion  { tipo?, prioridad? }
incidenciasRouter.patch<{ id: string }>('/:id/clasificacion', requireRol('administrador'), async (req, res) => {
  const datos = corregirClasificacionSchema.parse(req.body)
  res.json(await corregirClasificacion(usuarioActual(req), req.params.id, datos))
})
