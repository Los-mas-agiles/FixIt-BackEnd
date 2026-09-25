import type { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../lib/errors.js'
import { hashPassword } from '../../lib/password.js'
import type { RolUsuario, Usuario } from '../../types/models.js'
import { aUsuario, SELECT_USUARIO } from './mapper.js'
import type { crearUsuarioSchema } from './schemas.js'

export async function listarUsuarios(edificioId: string, rol?: RolUsuario): Promise<Usuario[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { edificioId, activo: true, ...(rol ? { rol } : {}) },
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
