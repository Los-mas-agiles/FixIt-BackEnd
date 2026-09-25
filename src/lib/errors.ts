import type { CodigoError } from '../types/models.js'

/** Error de negocio con el formato del contrato: { error: { code, message, details? } } */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: CodigoError,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
