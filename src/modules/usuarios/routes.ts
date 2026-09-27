import { Router } from 'express'
import { requireAuth, requireRol, usuarioActual } from '../../middleware/auth.js'
import { actualizarUsuarioSchema, crearUsuarioSchema, listarUsuariosSchema } from './schemas.js'
import { actualizarUsuario, crearUsuario, listarUsuarios } from './service.js'

export const usuariosRouter = Router()

usuariosRouter.use(requireAuth, requireRol('administrador'))

// GET /usuarios?rol=mantenimiento&inactivos=true
usuariosRouter.get('/', async (req, res) => {
  const { rol, inactivos } = listarUsuariosSchema.parse(req.query)
  res.json(await listarUsuarios(usuarioActual(req).edificioId, rol, inactivos))
})

// POST /usuarios
usuariosRouter.post('/', async (req, res) => {
  const datos = crearUsuarioSchema.parse(req.body)
  res.status(201).json(await crearUsuario(usuarioActual(req).edificioId, datos))
})

// PATCH /usuarios/:id  { activo?, password? }
usuariosRouter.patch<{ id: string }>('/:id', async (req, res) => {
  const datos = actualizarUsuarioSchema.parse(req.body)
  res.json(await actualizarUsuario(usuarioActual(req), req.params.id, datos))
})
