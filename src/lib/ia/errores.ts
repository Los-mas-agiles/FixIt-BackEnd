export type ProveedorIA = 'gemini' | 'groq'

/** Error al llamar a un proveedor de IA. */
export class ErrorProveedorIA extends Error {
  constructor(
    message: string,
    /** Código HTTP del proveedor (0 = error de red o timeout) */
    public readonly status: number,
    public readonly proveedor: ProveedorIA,
  ) {
    super(message)
    this.name = 'ErrorProveedorIA'
  }

  /** Saturación, cuota, error del servidor o timeout: vale la pena probar con otro modelo del mismo proveedor */
  get esReintentable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

/** fetch con timeout que convierte los errores de red en ErrorProveedorIA. */
export async function fetchIA(proveedor: ProveedorIA, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const esTimeout = error instanceof Error && error.name === 'TimeoutError'
    throw new ErrorProveedorIA(esTimeout ? `Timeout de ${timeoutMs} ms` : 'Error de red', 0, proveedor)
  }
}
