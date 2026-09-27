// Las 3 situaciones críticas del TF (sección 5.2), cada una con y sin la solución propuesta (5.3),
// más una semana normal como referencia. Edificio de ~80 departamentos con 2 técnicos por turnos.
import type { Prioridad, TipoIncidencia } from '../../src/types/models.js'
import { entre, excepto, turno, type Azar, type Llegada, type Tecnico } from './simulador.js'

export const DIAS = 14
export const HORAS = DIAS * 24
/** La crisis empieza el día 8 (lunes 00:00): los primeros 7 días son una semana normal de calentamiento. */
export const INICIO_CRISIS = 7 * 24

type Plantilla = readonly [TipoIncidencia, string]

const DESCRIPCIONES: Record<Prioridad, readonly Plantilla[]> = {
  alta: [
    ['plomeria', 'Fuga fuerte de agua en el baño del departamento'],
    ['electricidad', 'Un enchufe se quemó y huele a plástico quemado'],
    ['ascensor', 'El ascensor se detuvo entre dos pisos'],
    ['seguridad', 'La puerta principal del edificio no cierra'],
  ],
  media: [
    ['plomeria', 'Gotea el caño de la cocina'],
    ['electricidad', 'El foco del pasadizo está quemado'],
    ['limpieza', 'Se acumula basura en el cuarto de basura'],
    ['seguridad', 'El intercomunicador no suena'],
  ],
  baja: [
    ['otros', 'La pintura de la pared del hall se está descascarando'],
    ['limpieza', 'Las ventanas de la escalera están sucias'],
    ['electricidad', 'Una luz del estacionamiento parpadea'],
  ],
}

/** Horas de espera (coordinar con el vecino, repuestos) y de trabajo, en promedio, según la prioridad. */
const ESPERA: Record<Prioridad, number> = { alta: 0.5, media: 3, baja: 6 }
const TRABAJO: Record<Prioridad, number> = { alta: 1.5, media: 1.25, baja: 1 }
const MEZCLA_NORMAL = [['alta', 0.2], ['media', 0.5], ['baja', 0.3]] as const

/** Reportes normales: ~3 por día, el 85 % entre las 7:00 y las 22:00. */
function llegadasNormales(azar: Azar, desde = 0, hasta = HORAS): Llegada[] {
  const llegadas: Llegada[] = []
  for (let h = desde; h < hasta; h++) {
    const hd = h % 24
    const tasa = hd >= 7 && hd < 22 ? (3 * 0.85) / 15 : (3 * 0.15) / 9
    for (let k = azar.poisson(tasa); k > 0; k--) {
      const prioridad = azar.elegir(MEZCLA_NORMAL)
      const [tipo, descripcion] = azar.elegir(DESCRIPCIONES[prioridad].map((p) => [p, 1] as const))
      llegadas.push({ t: h + azar.siguiente(), prioridad, tipo, descripcion, espera: azar.duracion(ESPERA[prioridad]), trabajo: azar.duracion(TRABAJO[prioridad]) })
    }
  }
  return llegadas
}

const TURNO_MANANA = turno(7, 15)
const TURNO_TARDE = turno(14, 22)
const tecnicosNormales = (): Tecnico[] => [
  { nombre: 'Técnico de mañana', disponible: TURNO_MANANA },
  { nombre: 'Técnico de tarde (guardia)', disponible: TURNO_TARDE },
]

export interface Escenario {
  id: string
  situacion: 'normal' | 'lluvia' | 'ausente' | 'falla'
  conSolucion: boolean
  nombre: string
  contexto: string
  solucion?: string
  generar: (azar: Azar) => { llegadas: Llegada[]; tecnicos: Tecnico[] }
}

// ---------- 1. Lluvia fuerte ----------
const LLUVIA_INICIO = INICIO_CRISIS + 14 // lunes 14:00
const LLUVIA_HORAS = 36
const CONTINGENCIA_HORAS = 72

function llegadasLluvia(azar: Azar): Llegada[] {
  const llegadas: Llegada[] = []
  for (let h = LLUVIA_INICIO; h < LLUVIA_INICIO + LLUVIA_HORAS; h++) {
    for (let k = azar.poisson(1); k > 0; k--) {
      const prioridad = azar.elegir([['alta', 0.45], ['media', 0.4], ['baja', 0.15]] as const)
      const [tipo, descripcion] = azar.elegir([
        [['plomeria', 'Se filtra agua del techo del departamento'], 3],
        [['plomeria', 'Se inundó el estacionamiento del sótano'], 2],
        [['plomeria', 'El desagüe de la azotea está atorado'], 2],
        [['electricidad', 'Entró agua al tablero eléctrico del pasadizo'], 1.5],
        [['otros', 'Aparecieron manchas de humedad en la pared'], 1.5],
      ] as const)
      llegadas.push({
        t: h + azar.siguiente(),
        prioridad,
        tipo,
        descripcion,
        espera: azar.duracion({ alta: 1, media: 4, baja: 8 }[prioridad]),
        trabajo: azar.duracion({ alta: 2.5, media: 1.5, baja: 1 }[prioridad]),
      })
    }
  }
  return llegadas
}

// ---------- 2. Técnico de guardia ausente ----------
const AUSENCIA_INICIO = INICIO_CRISIS
const AUSENCIA_HORAS = 5 * 24

// ---------- 3. Falla eléctrica general ----------
const ELECTRICISTA = 'Electricista de guardia'
const APAGON_INICIO = INICIO_CRISIS + 2 * 24 + 19 // miércoles 19:00
const APAGON_HORAS = 6 // vuelve la luz a la 1:00
const LUZ_VUELVE = APAGON_INICIO + APAGON_HORAS

function llegadasFalla(azar: Azar, agrupar: boolean): Llegada[] {
  const reportes: Plantilla[] = [
    ['ascensor', 'El ascensor se detuvo por el corte de luz'],
    ['electricidad', 'No hay luz en los pasadizos ni en la escalera'],
    ['plomeria', 'La bomba de agua dejó de funcionar y no hay agua'],
    ['seguridad', 'El intercomunicador y la puerta eléctrica no funcionan'],
  ]
  const llegadas: Llegada[] = []
  // 14 vecinos reportan lo mismo en las primeras 2 horas del apagón
  for (let k = 0; k < 14; k++) {
    const [tipo, descripcion] = reportes[k % reportes.length]!
    llegadas.push({
      t: APAGON_INICIO + azar.siguiente() * 2,
      prioridad: tipo === 'seguridad' ? 'media' : 'alta',
      tipo,
      descripcion,
      espera: 0.25,
      trabajo: azar.duracion(1),
      bloqueadaHasta: LUZ_VUELVE,
    })
  }
  if (agrupar) {
    // Solución: el primer reporte se vuelve la incidencia general; el resto se agrupa en ella
    llegadas.sort((a, b) => a.t - b.t)
    llegadas[0] = { ...llegadas[0]!, descripcion: 'Falla eléctrica general del edificio', tipo: 'electricidad', prioridad: 'alta', trabajo: 2, clave: 'apagon', asignadaA: ELECTRICISTA }
    for (let k = 1; k < llegadas.length; k++) llegadas[k] = { ...llegadas[k]!, agrupadaEn: 'apagon' }
  }
  // Al día siguiente aparecen los equipos dañados por el corte
  for (const [tipo, descripcion] of [
    ['plomeria', 'Se quemó el motor de la bomba de agua'],
    ['seguridad', 'El portón eléctrico del estacionamiento no abre'],
    ['electricidad', 'Se quemó el foco de emergencia de la escalera'],
    ['ascensor', 'El ascensor hace un ruido extraño desde el corte'],
    ['electricidad', 'Salta la llave del tablero del piso 3'],
  ] as const) {
    llegadas.push({ t: LUZ_VUELVE + 7 + azar.siguiente() * 6, prioridad: 'alta', tipo, descripcion, espera: azar.duracion(4), trabajo: azar.duracion(3) })
  }
  return llegadas
}

export const ESCENARIOS: Escenario[] = [
  {
    id: 'normal',
    situacion: 'normal',
    conSolucion: false,
    nombre: 'Semana normal (referencia)',
    contexto: 'Unos 3 reportes al día y 2 técnicos por turnos (7:00–15:00 y 14:00–22:00), con límite de WIP de 3 cada uno.',
    generar: (azar) => ({ llegadas: llegadasNormales(azar), tecnicos: tecnicosNormales() }),
  },
  {
    id: 'lluvia',
    situacion: 'lluvia',
    conSolucion: false,
    nombre: 'Pico de incidencias tras una lluvia fuerte',
    contexto: `Una lluvia fuerte de ${LLUVIA_HORAS} h genera filtraciones, un sótano inundado y desagües atorados: llegan ~1 reporte por hora (casi la mitad de prioridad alta) además de los normales.`,
    generar: (azar) => ({ llegadas: [...llegadasNormales(azar), ...llegadasLluvia(azar)], tecnicos: tecnicosNormales() }),
  },
  {
    id: 'lluvia-solucion',
    situacion: 'lluvia',
    conSolucion: true,
    nombre: 'Lluvia fuerte, con plan de contingencia',
    contexto: 'La misma lluvia.',
    solucion: `Durante ${CONTINGENCIA_HORAS} h el administrador activa un gasfitero externo (7:00–22:00) y pone en pausa las incidencias de prioridad baja: el tablero ya las ordena por la prioridad que sugiere la IA.`,
    generar: (azar) => {
      const finContingencia = LLUVIA_INICIO + CONTINGENCIA_HORAS
      const sinBaja = (p: Prioridad, h: number) => p !== 'baja' || h < LLUVIA_INICIO || h >= finContingencia
      return {
        llegadas: [...llegadasNormales(azar), ...llegadasLluvia(azar)],
        tecnicos: [
          ...tecnicosNormales().map((t) => ({ ...t, puedeTomar: sinBaja })),
          { nombre: 'Gasfitero externo', disponible: entre(LLUVIA_INICIO, finContingencia, turno(7, 22)), puedeTomar: sinBaja },
        ],
      }
    },
  },
  {
    id: 'ausente',
    situacion: 'ausente',
    conSolucion: false,
    nombre: 'Técnico de guardia ausente',
    contexto: 'El técnico de la tarde (guardia) falta 5 días seguidos por enfermedad y nadie cubre su turno: todo recae en el técnico de la mañana.',
    generar: (azar) => ({
      llegadas: llegadasNormales(azar),
      tecnicos: [
        { nombre: 'Técnico de mañana', disponible: TURNO_MANANA },
        { nombre: 'Técnico de tarde (guardia)', disponible: excepto(AUSENCIA_INICIO, AUSENCIA_INICIO + AUSENCIA_HORAS, TURNO_TARDE) },
      ],
    }),
  },
  {
    id: 'ausente-solucion',
    situacion: 'ausente',
    conSolucion: true,
    nombre: 'Técnico ausente, con cobertura',
    contexto: 'La misma ausencia.',
    solucion: 'El técnico de la mañana extiende su turno hasta las 19:00 mientras dure la ausencia, y un técnico de reemplazo cubre la guardia de la tarde solo para incidencias de prioridad alta.',
    generar: (azar) => {
      const ausente = (h: number) => h >= AUSENCIA_INICIO && h < AUSENCIA_INICIO + AUSENCIA_HORAS
      return {
        llegadas: llegadasNormales(azar),
        tecnicos: [
          { nombre: 'Técnico de mañana', disponible: (h) => (ausente(h) ? turno(7, 19)(h) : TURNO_MANANA(h)) },
          { nombre: 'Técnico de tarde (guardia)', disponible: excepto(AUSENCIA_INICIO, AUSENCIA_INICIO + AUSENCIA_HORAS, TURNO_TARDE) },
          { nombre: 'Técnico de reemplazo', disponible: entre(AUSENCIA_INICIO, AUSENCIA_INICIO + AUSENCIA_HORAS, TURNO_TARDE), soloAlta: true },
        ],
      }
    },
  },
  {
    id: 'falla',
    situacion: 'falla',
    conSolucion: false,
    nombre: 'Falla eléctrica general del edificio',
    contexto: `Un corte de luz de ${APAGON_HORAS} h (de 19:00 a 1:00) detiene el ascensor, la bomba de agua y el intercomunicador. 14 vecinos reportan lo mismo en 2 horas y nada se puede reparar hasta que vuelva la luz; al día siguiente aparecen 5 equipos dañados.`,
    generar: (azar) => ({ llegadas: [...llegadasNormales(azar), ...llegadasFalla(azar, false)], tecnicos: tecnicosNormales() }),
  },
  {
    id: 'falla-solucion',
    situacion: 'falla',
    conSolucion: true,
    nombre: 'Falla eléctrica, con incidencia general',
    contexto: 'El mismo corte de luz.',
    solucion: 'El administrador registra una sola "incidencia general" del apagón y se la asigna a un electricista de guardia, que la atiende apenas vuelve la luz (1:00–5:00). Los reportes repetidos no ocupan a los técnicos: se cierran junto con la general y FixIt avisa a cada vecino.',
    generar: (azar) => ({
      llegadas: [...llegadasNormales(azar), ...llegadasFalla(azar, true)],
      tecnicos: [...tecnicosNormales(), { nombre: ELECTRICISTA, disponible: entre(LUZ_VUELVE, LUZ_VUELVE + 4), soloAlta: true }],
    }),
  },
]
