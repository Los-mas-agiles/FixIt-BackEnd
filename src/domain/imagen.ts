// Detecta el tipo REAL de una imagen por sus primeros bytes ("firma" del archivo).
// No se confía en la extensión ni en el Content-Type que manda el navegador: ambos se pueden falsificar.

export type TipoImagen = 'jpg' | 'png' | 'webp'

export const CONTENT_TYPE: Record<TipoImagen, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function ascii(bytes: Uint8Array, desde: number, hasta: number): string {
  return String.fromCharCode(...bytes.subarray(desde, hasta))
}

export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 8 && FIRMA_PNG.every((valor, i) => bytes[i] === valor)) return 'png'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp'
  return null
}
