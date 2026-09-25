import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { RolUsuario } from '../types/models.js'

export interface PayloadToken {
  sub: string          // id del usuario
  rol: RolUsuario
  edificioId: string
}

export function firmarToken(payload: PayloadToken): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

/** Devuelve el payload o null si el token es inválido, está vencido o fue manipulado. */
export function verificarToken(token: string): PayloadToken | null {
  try {
    const decodificado = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof decodificado === 'string' || typeof decodificado.sub !== 'string') return null
    return decodificado as PayloadToken
  } catch {
    return null
  }
}
