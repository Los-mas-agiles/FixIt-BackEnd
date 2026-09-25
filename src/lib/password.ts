import { compare, hash } from 'bcryptjs'

const COSTO = 10

export function hashPassword(password: string): Promise<string> {
  return hash(password, COSTO)
}

// Hash de una contraseña cualquiera: se compara contra él cuando el email no existe,
// para que la respuesta tarde lo mismo y no revele qué correos están registrados.
const HASH_FALSO = '$2b$10$Ddx/cMuPCtq0Yh9Ze6BM2uL7S8P1US0dUUlTC0nQ52ECthSnMZz5e'

export async function verificarPassword(password: string, passwordHash: string | null): Promise<boolean> {
  const coincide = await compare(password, passwordHash ?? HASH_FALSO)
  return passwordHash !== null && coincide
}
