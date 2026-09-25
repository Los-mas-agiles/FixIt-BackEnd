import { Router } from 'express'
import { requireAuth, requireRol, usuarioActual } from '../../middleware/auth.js'
import { crearUsuarioSchema, listarUsuariosSchema } from './schemas.js'
import { crearUsuario, listarUsuarios } from './service.js'

export const usuariosRouter = Router()

usuariosRouter.use(requireAuth, requireRol('administrador'))

// GET /usuarios?rol=mantenimiento
usuariosRouter.get('/', async (req, res) => {
  const { rol } = listarUsuariosSchema.parse(req.query)
  res.json(await listarUsuarios(usuarioActual(req).edificioId, rol))
})

// POST /usuarios
usuariosRouter.post('/', async (req, res) => {
  const datos = crearUsuarioSchema.parse(req.body)
  res.status(201).json(await crearUsuario(usuarioActual(req).edificioId, datos))
})
