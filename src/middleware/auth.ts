import type { Request, RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { ApiError } from '../lib/errors.js'
import { verificarToken } from '../lib/jwt.js'
import type { RolUsuario } from '../types/models.js'
import type { UsuarioAutenticado } from '../types/express.js'

const SESION_INVALIDA = 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.'

/**
 * Exige un JWT válido. Además consulta la BD para usar el rol y edificio ACTUALES del usuario
 * (si un admin lo desactiva o le cambia el rol, el cambio aplica de inmediato, sin esperar a que venza el token).
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [esquema, token] = (req.headers.authorization ?? '').split(' ')
  if (esquema !== 'Bearer' || !token) throw new ApiError(401, 'NO_AUTENTICADO', SESION_INVALIDA)

  const payload = verificarToken(token)
  if (!payload) throw new ApiError(401, 'NO_AUTENTICADO', SESION_INVALIDA)

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { id: true, rol: true, edificioId: true, activo: true },
  })
  if (!usuario || !usuario.activo) throw new ApiError(401, 'NO_AUTENTICADO', SESION_INVALIDA)

  req.usuario = { id: usuario.id, rol: usuario.rol, edificioId: usuario.edificioId }
  next()
}

/** Exige que el usuario autenticado tenga alguno de los roles indicados. Va después de requireAuth. */
export function requireRol(...roles: RolUsuario[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      throw new ApiError(403, 'PROHIBIDO', 'No tienes permiso para realizar esta acción')
    }
    next()
  }
}

/** Usuario autenticado del request. Úsalo solo en rutas protegidas con requireAuth. */
export function usuarioActual(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw new ApiError(401, 'NO_AUTENTICADO', SESION_INVALIDA)
  return req.usuario
}
