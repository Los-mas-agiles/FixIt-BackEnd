import type { RolUsuario } from './models.js'

// Datos del usuario autenticado que pone el middleware requireAuth en cada request
export interface UsuarioAutenticado {
  id: string
  rol: RolUsuario
  edificioId: string
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado
    }
  }
}
