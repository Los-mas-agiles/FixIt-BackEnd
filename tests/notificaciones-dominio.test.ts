import { describe, expect, it } from 'vitest'
import { esServicioPushPermitido, mensajeAsignacion, mensajeCambioEstado, resumir } from '../src/domain/notificaciones.js'

describe('textos de las notificaciones', () => {
  it('resume descripciones largas a 40 caracteres con "…"', () => {
    const larga = 'Hay una fuga de agua enorme debajo del lavadero de la cocina del departamento'
    const r = resumir(larga)
    expect(r.length).toBeLessThanOrEqual(40)
    expect(r.endsWith('…')).toBe(true)
    expect(resumir('Fuga   en el\nbaño')).toBe('Fuga en el baño')
  })

  it('mensajes para el residente y para el técnico', () => {
    expect(mensajeCambioEstado('Fuga en el baño', 'en_proceso')).toBe('Tu incidencia "Fuga en el baño" está En proceso: un técnico ya la está atendiendo.')
    expect(mensajeCambioEstado('Fuga en el baño', 'resuelto')).toBe('Tu incidencia "Fuga en el baño" fue resuelta.')
    expect(mensajeAsignacion('Fuga en el baño')).toBe('Te asignaron la incidencia "Fuga en el baño".')
  })
})

describe('esServicioPushPermitido (protección contra SSRF)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx9abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta el servicio oficial: %s', (endpoint) => {
    expect(esServicioPushPermitido(endpoint)).toBe(true)
  })

  it.each([
    ['HTTP sin cifrar', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['dominio cualquiera', 'https://evil.com/push'],
    ['dominio que "contiene" el oficial', 'https://fcm.googleapis.com.evil.com/x'],
    ['sufijo engañoso', 'https://evilpush.apple.com.attacker.net/x'],
    ['red interna', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost:3000/api'],
    ['puerto no estándar', 'https://fcm.googleapis.com:8443/x'],
    ['texto que no es URL', 'no-es-una-url'],
  ])('rechaza %s', (_caso, endpoint) => {
    expect(esServicioPushPermitido(endpoint)).toBe(false)
  })
})
