import { describe, expect, it } from 'vitest'
import { evaluarTransicion, superaLimiteWip } from '../src/domain/transiciones.js'
import type { EstadoIncidencia } from '../src/types/models.js'

const TECNICO = { id: 'tec-1', rol: 'mantenimiento' as const }
const OTRO_TECNICO = 'tec-2'
const ADMIN = { id: 'adm-1', rol: 'administrador' as const }
const RESIDENTE = { id: 'res-1', rol: 'residente' as const }

describe('evaluarTransicion: transiciones permitidas', () => {
  it('técnico toma una pendiente sin asignar → se autoasigna y marca fechaInicioProceso', () => {
    expect(evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: null, actor: TECNICO })).toEqual({
      ok: true,
      tecnicoId: 'tec-1',
      campoFecha: 'fechaInicioProceso',
    })
  })

  it('técnico toma una pendiente que ya le asignaron a él', () => {
    const r = evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: 'tec-1', actor: TECNICO })
    expect(r).toMatchObject({ ok: true, tecnicoId: 'tec-1' })
  })

  it('admin pasa a en proceso una pendiente con técnico asignado (queda a cargo del técnico, no del admin)', () => {
    const r = evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: OTRO_TECNICO, actor: ADMIN })
    expect(r).toEqual({ ok: true, tecnicoId: OTRO_TECNICO, campoFecha: 'fechaInicioProceso' })
  })

  it('el técnico asignado la resuelve → marca fechaResolucion', () => {
    const r = evaluarTransicion({ estadoActual: 'en_proceso', estadoNuevo: 'resuelto', asignadoAId: 'tec-1', actor: TECNICO })
    expect(r).toEqual({ ok: true, tecnicoId: 'tec-1', campoFecha: 'fechaResolucion' })
  })

  it('el admin puede resolver una incidencia de cualquier técnico', () => {
    const r = evaluarTransicion({ estadoActual: 'en_proceso', estadoNuevo: 'resuelto', asignadoAId: OTRO_TECNICO, actor: ADMIN })
    expect(r).toMatchObject({ ok: true, tecnicoId: OTRO_TECNICO })
  })
})

describe('evaluarTransicion: transiciones inválidas (409)', () => {
  const casos: [EstadoIncidencia, EstadoIncidencia, string][] = [
    ['pendiente', 'resuelto', 'No se puede pasar de "Pendiente" a "Resuelto"'], // saltarse un paso
    ['en_proceso', 'pendiente', 'No se puede pasar de "En proceso" a "Pendiente"'], // retroceder
    ['resuelto', 'en_proceso', 'La incidencia ya está resuelta'],
    ['resuelto', 'pendiente', 'La incidencia ya está resuelta'],
    ['pendiente', 'pendiente', 'La incidencia ya está en "Pendiente"'],
    ['en_proceso', 'en_proceso', 'La incidencia ya está en "En proceso"'],
  ]

  it.each(casos)('%s → %s', (estadoActual, estadoNuevo, mensaje) => {
    const r = evaluarTransicion({ estadoActual, estadoNuevo, asignadoAId: 'tec-1', actor: ADMIN })
    expect(r).toEqual({ ok: false, status: 409, code: 'TRANSICION_INVALIDA', mensaje })
  })

  it('el admin no puede pasar a en proceso sin técnico asignado', () => {
    const r = evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: null, actor: ADMIN })
    expect(r).toMatchObject({ ok: false, status: 409, mensaje: 'Asigna un técnico antes de pasarla a "En proceso"' })
  })
})

describe('evaluarTransicion: sin permiso (403)', () => {
  it('un técnico no puede tomar una incidencia asignada a otro técnico', () => {
    const r = evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: OTRO_TECNICO, actor: TECNICO })
    expect(r).toEqual({ ok: false, status: 403, code: 'PROHIBIDO', mensaje: 'Esta incidencia está asignada a otro técnico' })
  })

  it('un técnico no puede resolver la incidencia de otro técnico', () => {
    const r = evaluarTransicion({ estadoActual: 'en_proceso', estadoNuevo: 'resuelto', asignadoAId: OTRO_TECNICO, actor: TECNICO })
    expect(r).toMatchObject({ ok: false, status: 403, mensaje: 'Solo el técnico asignado puede marcarla como resuelta' })
  })

  it('un residente nunca puede cambiar estados', () => {
    const r = evaluarTransicion({ estadoActual: 'pendiente', estadoNuevo: 'en_proceso', asignadoAId: null, actor: RESIDENTE })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})

describe('superaLimiteWip', () => {
  it('con límite 3: 0, 1 y 2 en proceso pueden tomar otra; con 3 ya no', () => {
    expect(superaLimiteWip(0, 3)).toBe(false)
    expect(superaLimiteWip(2, 3)).toBe(false)
    expect(superaLimiteWip(3, 3)).toBe(true)
    expect(superaLimiteWip(4, 3)).toBe(true)
  })
})
