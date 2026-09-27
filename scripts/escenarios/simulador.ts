// Simulador del flujo de incidencias de un edificio, con las mismas reglas que el tablero de FixIt:
// cola ordenada por prioridad (alta → media → baja) y antigüedad, límite de WIP por técnico y flujo
// Pendiente → En proceso → Resuelto. Sirve para generar los números de las 3 situaciones críticas del TF (5.2).
//
// Modelo (en horas desde las 00:00 de Lima del día 1, con pasos de 15 minutos):
// - Un técnico en turno toma incidencias de la cola hasta llegar a su límite de WIP.
// - Una incidencia en proceso primero "espera" (coordinar con el vecino, conseguir repuestos o que vuelva
//   la luz) sin ocupar al técnico, y luego necesita "trabajo": el técnico atiende una sola a la vez.
// - Fuera de su turno el técnico no toma ni trabaja incidencias (las suyas siguen contando en el WIP).
import type { Prioridad, TipoIncidencia } from '../../src/types/models.js'

export const PASO_H = 0.25
export const LIMITE_WIP = 3
const ORDEN: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 }

export interface Llegada {
  /** Hora de reporte (horas desde el inicio de la simulación) */
  t: number
  prioridad: Prioridad
  tipo: TipoIncidencia
  descripcion: string
  /** Horas de espera antes de poder trabajarla (no ocupa al técnico) */
  espera: number
  /** Horas de trabajo del técnico */
  trabajo: number
  /** No se puede trabajar antes de esta hora (ej. hasta que vuelva la luz) */
  bloqueadaHasta?: number
  /** Si el administrador la asignó a un técnico: solo ese técnico puede tomarla */
  asignadaA?: string
  /** Identificador para que otros reportes se agrupen en esta */
  clave?: string
  /** Si es un reporte repetido de otra incidencia (su clave): se cierra junto con ella sin ocupar a nadie */
  agrupadaEn?: string
}

export interface Tecnico {
  nombre: string
  disponible: (h: number) => boolean
  /** Solo toma incidencias de prioridad alta (ej. un técnico de reemplazo o de guardia externo) */
  soloAlta?: boolean
  /** Toma incidencias solo si esta función lo permite en ese momento (ej. "baja en pausa" durante la crisis) */
  puedeTomar?: (prioridad: Prioridad, h: number) => boolean
}

export interface IncidenciaSimulada extends Llegada {
  id: number
  inicio: number | null
  fin: number | null
  tecnico: string | null
}

export interface ResultadoSimulacion {
  incidencias: IncidenciaSimulada[]
  /** WIP (incidencias en proceso) al final de cada paso */
  wip: number[]
  horas: number
}

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da siempre el mismo resultado. */
export function crearAzar(semilla: number) {
  let a = semilla >>> 0
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    siguiente,
    /** Duración con media dada y poca dispersión (Erlang-2) */
    duracion: (media: number) => (-Math.log(1 - siguiente()) - Math.log(1 - siguiente())) * (media / 2),
    /** Cantidad de llegadas en un intervalo (Poisson) */
    poisson: (lambda: number) => {
      const limite = Math.exp(-lambda)
      let k = 0
      let p = siguiente()
      while (p > limite) {
        k++
        p *= siguiente()
      }
      return k
    },
    elegir: <T>(opciones: readonly (readonly [T, number])[]): T => {
      let r = siguiente() * opciones.reduce((s, [, peso]) => s + peso, 0)
      for (const [valor, peso] of opciones) {
        r -= peso
        if (r < 0) return valor
      }
      return opciones[opciones.length - 1]![0]
    },
  }
}

export type Azar = ReturnType<typeof crearAzar>

export const horaDelDia = (h: number) => ((h % 24) + 24) % 24
/** Turno diario [desde, hasta) en horas del día; si hasta < desde, cruza la medianoche. */
export const turno = (desde: number, hasta: number) => (h: number) => {
  const hd = horaDelDia(h)
  return desde <= hasta ? hd >= desde && hd < hasta : hd >= desde || hd < hasta
}
/** Disponible solo dentro de [inicio, fin) (en horas absolutas de la simulación) y además en su turno. */
export const entre = (inicio: number, fin: number, enTurno: (h: number) => boolean = () => true) => (h: number) =>
  h >= inicio && h < fin && enTurno(h)
export const excepto = (inicio: number, fin: number, enTurno: (h: number) => boolean) => (h: number) =>
  (h < inicio || h >= fin) && enTurno(h)

const antes = (a: IncidenciaSimulada, b: IncidenciaSimulada) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || a.t - b.t || a.id - b.id

export function simular(llegadas: Llegada[], tecnicos: Tecnico[], horas: number, limiteWip = LIMITE_WIP): ResultadoSimulacion {
  const incidencias: IncidenciaSimulada[] = llegadas
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((l, id) => ({ ...l, id, inicio: null, fin: null, tecnico: null }))
  const porClave = new Map(incidencias.filter((i) => i.clave).map((i) => [i.clave!, i]))
  const restante = new Map(incidencias.map((i) => [i.id, i.trabajo]))
  const esperaHasta = new Map<number, number>()
  const cola: IncidenciaSimulada[] = []
  const enProceso = new Map<string, IncidenciaSimulada[]>(tecnicos.map((t) => [t.nombre, []]))
  const wip: number[] = []
  let proxima = 0

  for (let h = 0; h < horas - 1e-9; h += PASO_H) {
    // 1. Llegan los reportes de este paso (los repetidos no entran a la cola)
    while (proxima < incidencias.length && incidencias[proxima]!.t < h + PASO_H) {
      const i = incidencias[proxima++]!
      if (i.agrupadaEn === undefined) cola.push(i)
    }
    cola.sort(antes)

    for (const tecnico of tecnicos) {
      if (!tecnico.disponible(h)) continue
      const suyas = enProceso.get(tecnico.nombre)!

      // 2. Toma de la cola hasta su límite de WIP
      while (suyas.length < limiteWip) {
        const k = cola.findIndex(
          (i) =>
            (i.asignadaA === undefined || i.asignadaA === tecnico.nombre) &&
            (!tecnico.soloAlta || i.prioridad === 'alta') &&
            (tecnico.puedeTomar?.(i.prioridad, h) ?? true),
        )
        if (k < 0) break
        const [i] = cola.splice(k, 1)
        i!.inicio = Math.max(h, i!.t)
        i!.tecnico = tecnico.nombre
        esperaHasta.set(i!.id, Math.max(i!.inicio + i!.espera, i!.bloqueadaHasta ?? 0))
        suyas.push(i!)
      }

      // 3. Trabaja en una sola: la más prioritaria de las que ya no esperan
      const lista = suyas.filter((i) => esperaHasta.get(i.id)! <= h).sort(antes)[0]
      if (!lista) continue
      const falta = restante.get(lista.id)! - PASO_H
      restante.set(lista.id, falta)
      if (falta <= 1e-9) {
        lista.fin = h + PASO_H + falta // termina dentro del paso
        suyas.splice(suyas.indexOf(lista), 1)
      }
    }

    // 4. Los reportes repetidos se cierran junto con su incidencia principal
    for (const i of incidencias) {
      if (i.agrupadaEn === undefined || i.fin !== null || i.t > h + PASO_H) continue
      const principal = porClave.get(i.agrupadaEn)
      if (principal?.fin != null) {
        i.inicio = Math.max(i.t, principal.inicio!)
        i.fin = Math.max(i.t, principal.fin)
        i.tecnico = principal.tecnico
      }
    }

    wip.push([...enProceso.values()].reduce((s, l) => s + l.length, 0))
  }
  return { incidencias, wip, horas }
}
