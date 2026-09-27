import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../lib/errors.js'
import { firmarToken } from '../../lib/jwt.js'
import { hashPassword, verificarPassword } from '../../lib/password.js'
import type { Usuario } from '../../types/models.js'
import { aUsuario, SELECT_USUARIO } from '../usuarios/mapper.js'

export async function login(email: string, password: string): Promise<{ token: string; usuario: Usuario }> {
  // Para no revelar qué correos existen, el camino es idéntico exista o no el email:
  // UNA consulta sin relaciones (incluir el edificio agregaría otra ida a la BD solo cuando existe)
  // y SIEMPRE una comparación de contraseña.
  const encontrado = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, rol: true, edificioId: true, passwordHash: true, activo: true },
  })

  const passwordOk = await verificarPassword(password, encontrado?.activo ? encontrado.passwordHash : null)
  if (!encontrado || !passwordOk) {
    throw new ApiError(401, 'NO_AUTENTICADO', 'Correo o contraseña incorrectos')
  }

  const token = firmarToken({ sub: encontrado.id, rol: encontrado.rol, edificioId: encontrado.edificioId })
  return { token, usuario: await obtenerUsuario(encontrado.id) }
}

export async function obtenerUsuario(id: string): Promise<Usuario> {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO })
  if (!usuario) throw new ApiError(401, 'NO_AUTENTICADO', 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.')
  return aUsuario(usuario)
}

/**
 * El propio usuario cambia su contraseña. Si la actual no coincide responde 400 (no 401),
 * para que el frontend muestre el error en el formulario en vez de cerrar la sesión.
 */
export async function cambiarPassword(id: string, actual: string, nueva: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { passwordHash: true } })
  if (!usuario || !(await verificarPassword(actual, usuario.passwordHash))) {
    throw new ApiError(400, 'VALIDACION', 'La contraseña actual no es correcta')
  }
  if (actual === nueva) throw new ApiError(400, 'VALIDACION', 'La nueva contraseña debe ser distinta de la actual')
  await prisma.usuario.update({ where: { id }, data: { passwordHash: await hashPassword(nueva) } })
}
