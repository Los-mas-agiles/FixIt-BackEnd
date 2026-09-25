// Storage falso en memoria (reemplaza a Supabase en los tests).
// Se usa con: vi.mock('../src/lib/storage.js', () => import('./helpers/fakeStorage.js'))

export const archivos = new Map<string, { contenido: Buffer; contentType: string }>()

export function reiniciarStorage() {
  archivos.clear()
}

export async function subirFoto(path: string, contenido: Buffer, contentType: string): Promise<void> {
  archivos.set(path, { contenido, contentType })
}

export async function borrarFoto(path: string): Promise<void> {
  archivos.delete(path)
}

export async function urlsFirmadas(paths: string[]): Promise<Map<string, string>> {
  return new Map(paths.map((path) => [path, `https://storage.test/firmada/${path}?token=abc`]))
}
