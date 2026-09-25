import type { Usuario } from '../../types/models.js'

/** Campos que se leen de la BD para armar un Usuario del contrato (nunca incluye passwordHash). */
export const SELECT_USUARIO = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  edificioId: true,
  edificio: { select: { nombre: true } },
} as const

interface UsuarioBD {
  id: string
  nombre: string
  email: string
  rol: Usuario['rol']
  edificioId: string
  edificio: { nombre: string }
}

export function aUsuario(u: UsuarioBD): Usuario {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    edificioId: u.edificioId,
    edificioNombre: u.edificio.nombre,
  }
}
