// Reintenta con la IA las incidencias que cayeron al fallback (Gemini saturado o lento en ese momento).
// Así una caída momentánea de la IA no deja incidencias sin clasificar de verdad (Objetivo 4),
// y sin intervención manual.
import { prisma } from '../../lib/prisma.js'
import { enSegundoPlano } from '../../lib/segundoPlano.js'
import { clasificar } from './clasificador.js'

const MAX_POR_EJECUCION = 3 // cuida la cuota por minuto del nivel gratuito
const INTERVALO_MINIMO_MS = 60_000 // como mucho una ejecución por minuto y edificio
const ANTIGUEDAD_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000

const ultimaEjecucion = new Map<string, number>()

/** Reclasifica hasta 3 incidencias en fallback del edificio. Devuelve cuántas logró clasificar con IA. */
export async function reclasificarPendientes(edificioId: string, ahora = Date.now()): Promise<number> {
  const pendientes = await prisma.incidencia.findMany({
    where: {
      edificioId,
      clasificadoPor: 'fallback', // las corregidas a mano ('manual') nunca se tocan
      fechaCreacion: { gte: new Date(ahora - ANTIGUEDAD_MAXIMA_MS) },
    },
    select: { id: true, descripcion: true },
    orderBy: { fechaCreacion: 'asc' },
    take: MAX_POR_EJECUCION,
  })

  let reclasificadas = 0
  for (const incidencia of pendientes) {
    const resultado = await clasificar(incidencia.descripcion)
    if (resultado.clasificadoPor !== 'ia') break // la IA sigue sin responder: se reintenta más tarde

    // Condicional: si un admin la corrigió mientras tanto, no se pisa su corrección
    const { count } = await prisma.incidencia.updateMany({
      where: { id: incidencia.id, clasificadoPor: 'fallback' },
      data: {
        tipo: resultado.tipo,
        prioridad: resultado.prioridad,
        tipoIA: resultado.tipo,
        prioridadIA: resultado.prioridad,
        clasificadoPor: 'ia',
      },
    })
    reclasificadas += count
  }

  if (pendientes.length > 0) {
    console.info(JSON.stringify({ evento: 'reclasificacion', edificioId, pendientes: pendientes.length, reclasificadas }))
  }
  return reclasificadas
}

/** Programa una reclasificación en segundo plano (respetando el intervalo mínimo por edificio). */
export function programarReclasificacion(edificioId: string): void {
  const ahora = Date.now()
  if (ahora - (ultimaEjecucion.get(edificioId) ?? 0) < INTERVALO_MINIMO_MS) return
  ultimaEjecucion.set(edificioId, ahora)
  enSegundoPlano(() => reclasificarPendientes(edificioId, ahora))
}

/** Solo para tests. */
export function reiniciarIntervalos(): void {
  ultimaEjecucion.clear()
}
