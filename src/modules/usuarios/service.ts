import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../lib/errors.js'
import { hashPassword } from '../../lib/password.js'
import type { RolUsuario, Usuario } from '../../types/models.js'
import { aUsuario, SELECT_USUARIO } from './mapper.js'
import { idUsuarioSchema, type actualizarUsuarioSchema, type crearUsuarioSchema } from './schemas.js'

export async function listarUsuarios(edificioId: string, rol?: RolUsuario, inactivos = false): Promise<Usuario[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { edificioId, activo: !inactivos, ...(rol ? { rol } : {}) },
    select: SELECT_USUARIO,
    orderBy: { nombre: 'asc' },
  })
  return usuarios.map(aUsuario)
}

export async function crearUsuario(edificioId: string, datos: z.infer<typeof crearUsuarioSchema>): Promise<Usuario> {
  const existente = await prisma.usuario.findUnique({ where: { email: datos.email }, select: { id: true } })
  if (existente) throw new ApiError(400, 'VALIDACION', 'Ya existe un usuario con ese correo')

  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      email: datos.email,
      rol: datos.rol,
      passwordHash: await hashPassword(datos.password),
      edificioId, // siempre el edificio del admin que lo crea
    },
    select: SELECT_USUARIO,
  })
  return aUsuario(usuario)
}

/**
 * El admin desactiva o reactiva a un usuario de SU edificio, o le asigna una contraseña temporal
 * (cuando la olvidó). Un usuario desactivado no puede entrar y su sesión abierta deja de valer al instante.
 */
export async function actualizarUsuario(
  admin: { id: string; edificioId: string },
  id: string,
  datos: z.infer<typeof actualizarUsuarioSchema>,
): Promise<Usuario> {
  // Otro edificio o id mal formado → 404, igual que si no existiera
  const existente = idUsuarioSchema.safeParse(id).success
    ? await prisma.usuario.findFirst({ where: { id, edificioId: admin.edificioId }, select: { id: true } })
    : null
  if (!existente) throw new ApiError(404, 'NO_ENCONTRADO', 'Usuario no encontrado')
  if (id === admin.id && datos.activo === false) throw new ApiError(400, 'VALIDACION', 'No puedes desactivar tu propia cuenta')

  const usuario = await prisma.usuario.update({
    where: { id },
    data: {
      ...(datos.activo !== undefined && { activo: datos.activo }),
      ...(datos.password !== undefined && { passwordHash: await hashPassword(datos.password) }),
    },
    select: SELECT_USUARIO,
  })
  // Un usuario desactivado ya no debe recibir notificaciones push en sus dispositivos
  if (datos.activo === false) await prisma.suscripcionPush.deleteMany({ where: { usuarioId: id } })
  return aUsuario(usuario)
}
