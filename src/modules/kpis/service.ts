import { ApiError } from '../../lib/errors.js'
import { prisma } from '../../lib/prisma.js'
import { calcularCfd, calcularKpis, type Periodo } from '../../domain/kpis.js'
import type { UsuarioAutenticado } from '../../types/express.js'
import type { KPIs, Prioridad, PuntoCFD } from '../../types/models.js'

const DIA_MS = 86_400_000
/** Periodo más largo que se puede pedir (evita recorrer años de datos en una sola consulta). */
export const MAX_DIAS_PERIODO = 366

function resolverPeriodo(filtros: { desde?: string; hasta?: string }, diasPorDefecto: number): Periodo {
  const hasta = filtros.hasta ? new Date(filtros.hasta) : new Date()
  const desde = filtros.desde ? new Date(filtros.desde) : new Date(hasta.getTime() - diasPorDefecto * DIA_MS)
  if (desde >= hasta) throw new ApiError(400, 'VALIDACION', '"desde" debe ser anterior a "hasta"')
  if (hasta.getTime() - desde.getTime() > MAX_DIAS_PERIODO * DIA_MS) {
    throw new ApiError(400, 'VALIDACION', `El periodo no puede superar los ${MAX_DIAS_PERIODO} días`)
  }
  return { desde, hasta }
}

// Solo los campos que usan los cálculos, de las incidencias del edificio del admin
function leerIncidencias(edificioId: string, prioridad?: Prioridad) {
  return prisma.incidencia.findMany({
    where: { edificioId, ...(prioridad && { prioridad }) },
    select: {
      prioridad: true,
      estado: true,
      tipo: true,
      tipoIA: true,
      prioridadIA: true,
      fechaCreacion: true,
      fechaInicioProceso: true,
      fechaResolucion: true,
    },
  })
}

/** GET /kpis — por defecto, los últimos 7 días y todas las prioridades. */
export async function obtenerKpis(usuario: UsuarioAutenticado, filtros: { desde?: string; hasta?: string; prioridad?: Prioridad }): Promise<KPIs> {
  const periodo = resolverPeriodo(filtros, 7)
  return calcularKpis(await leerIncidencias(usuario.edificioId, filtros.prioridad), periodo, filtros.prioridad ?? null)
}

/** GET /kpis/cfd — por defecto, los últimos 14 días. */
export async function obtenerCfd(usuario: UsuarioAutenticado, filtros: { desde?: string; hasta?: string }): Promise<PuntoCFD[]> {
  const periodo = resolverPeriodo(filtros, 13) // 13 días atrás + hoy = 14 puntos
  return calcularCfd(await leerIncidencias(usuario.edificioId), periodo)
}
