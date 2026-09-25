import { describe, expect, it } from 'vitest'
import { detectarTipoImagen } from '../src/domain/imagen.js'

const bytes = (...valores: number[]) => new Uint8Array(valores)
const ascii = (texto: string) => [...texto].map((c) => c.charCodeAt(0))

describe('detectarTipoImagen', () => {
  it('reconoce JPG, PNG y WEBP por su firma', () => {
    expect(detectarTipoImagen(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe('jpg')
    expect(detectarTipoImagen(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe('png')
    expect(detectarTipoImagen(bytes(...ascii('RIFF'), 0x10, 0x00, 0x00, 0x00, ...ascii('WEBP')))).toBe('webp')
  })

  it('rechaza archivos que no son imágenes aunque digan serlo', () => {
    expect(detectarTipoImagen(bytes(...ascii('<?php echo 1; ?>')))).toBeNull() // "foto.jpg" que en realidad es código
    expect(detectarTipoImagen(bytes(...ascii('%PDF-1.7')))).toBeNull()
    expect(detectarTipoImagen(bytes(...ascii('GIF89a')))).toBeNull() // GIF no está permitido
    expect(detectarTipoImagen(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull() // audio, no WEBP
  })

  it('rechaza archivos vacíos o demasiado cortos', () => {
    expect(detectarTipoImagen(bytes())).toBeNull()
    expect(detectarTipoImagen(bytes(0xff, 0xd8))).toBeNull()
  })
})
