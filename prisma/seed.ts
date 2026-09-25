// Datos de demo: 2 edificios, las cuentas de docs/CONTRATO_API.md (sección 3) e incidencias de ejemplo.
// Es idempotente: se puede correr varias veces sin duplicar nada.
//   npm run db:seed                       → crea lo que falte (no toca incidencias existentes)
//   npm run db:seed -- --reiniciar-demo   → borra y vuelve a crear las incidencias de demo con fechas de HOY
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type EstadoIncidencia, type Prioridad, type Rol, type TipoIncidencia } from '../src/generated/prisma/client.js'
import { mensajeCambioEstado } from '../src/domain/notificaciones.js'

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']
if (!connectionString) throw new Error('Falta DIRECT_URL o DATABASE_URL en el .env')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const PASSWORD_DEMO = 'FixIt2026!'

// IDs fijos para que el seed sea repetible
const EDIFICIOS = [
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'Residencial Los Olivos', direccion: 'Av. Los Olivos 123, San Isidro' },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Torre San Borja', direccion: 'Av. San Borja Norte 456, San Borja' },
] as const

const [OLIVOS, SAN_BORJA] = EDIFICIOS

const USUARIOS: { nombre: string; email: string; rol: Rol; edificioId: string }[] = [
  { nombre: 'Ana Torres', email: 'admin@olivos.demo', rol: 'administrador', edificioId: OLIVOS.id },
  { nombre: 'Carlos Quispe', email: 'tecnico1@olivos.demo', rol: 'mantenimiento', edificioId: OLIVOS.id },
  { nombre: 'Luis Huamán', email: 'tecnico2@olivos.demo', rol: 'mantenimiento', edificioId: OLIVOS.id },
  { nombre: 'María Rojas', email: 'residente1@olivos.demo', rol: 'residente', edificioId: OLIVOS.id },
  { nombre: 'Jorge Salazar', email: 'residente2@olivos.demo', rol: 'residente', edificioId: OLIVOS.id },
  { nombre: 'Patricia Vega', email: 'admin@sanborja.demo', rol: 'administrador', edificioId: SAN_BORJA.id },
  { nombre: 'Diego Paredes', email: 'residente1@sanborja.demo', rol: 'residente', edificioId: SAN_BORJA.id },
]

// Incidencias de demo (IDs fijos). Las horas son "hace cuántas horas" respecto al momento del seed,
// para que el tablero, los KPIs y el CFD muestren datos de los últimos días.
interface IncidenciaDemo {
  n: number
  edificioId: string
  residente: string
  descripcion: string
  tipo: TipoIncidencia
  prioridad: Prioridad
  tecnico?: string
  creadaHaceH: number
  inicioHaceH?: number
  resueltaHaceH?: number
  /** Si el admin la corrigió a mano: lo que había dicho la IA */
  ia?: { tipo: TipoIncidencia; prioridad: Prioridad }
}

const T1 = 'tecnico1@olivos.demo'
const T2 = 'tecnico2@olivos.demo'
const R1 = 'residente1@olivos.demo'
const R2 = 'residente2@olivos.demo'

const INCIDENCIAS_DEMO: IncidenciaDemo[] = [
  // Resueltas (alimentan cycle time, lead time y throughput)
  { n: 1, edificioId: OLIVOS.id, residente: R1, descripcion: 'Hay una fuga de agua debajo del lavadero y está mojando el piso de la cocina', tipo: 'plomeria', prioridad: 'alta', tecnico: T1, creadaHaceH: 312, inicioHaceH: 311, resueltaHaceH: 300 },
  { n: 2, edificioId: OLIVOS.id, residente: R2, descripcion: 'El foco del pasadizo del tercer piso está quemado', tipo: 'electricidad', prioridad: 'baja', tecnico: T2, creadaHaceH: 288, inicioHaceH: 260, resueltaHaceH: 240 },
  { n: 3, edificioId: OLIVOS.id, residente: R1, descripcion: 'El ascensor se quedó detenido entre el piso 2 y 3', tipo: 'ascensor', prioridad: 'alta', tecnico: T1, creadaHaceH: 240, inicioHaceH: 239, resueltaHaceH: 236 },
  { n: 4, edificioId: OLIVOS.id, residente: R2, descripcion: 'Las bolsas de basura se acumulan en el cuarto de basura desde hace días', tipo: 'limpieza', prioridad: 'media', tecnico: T2, creadaHaceH: 192, inicioHaceH: 180, resueltaHaceH: 170, ia: { tipo: 'otros', prioridad: 'baja' } },
  { n: 5, edificioId: OLIVOS.id, residente: R1, descripcion: 'La puerta principal del edificio no cierra bien', tipo: 'seguridad', prioridad: 'alta', tecnico: T1, creadaHaceH: 144, inicioHaceH: 143, resueltaHaceH: 120 },
  { n: 6, edificioId: OLIVOS.id, residente: R2, descripcion: 'Gotea el caño del lavadero de la zona de lavandería común', tipo: 'plomeria', prioridad: 'baja', tecnico: T2, creadaHaceH: 120, inicioHaceH: 96, resueltaHaceH: 72 },
  { n: 7, edificioId: OLIVOS.id, residente: R1, descripcion: 'Un enchufe de la sala se calienta mucho y huele a quemado', tipo: 'electricidad', prioridad: 'alta', tecnico: T1, creadaHaceH: 72, inicioHaceH: 71, resueltaHaceH: 60 },
  // En proceso (WIP)
  { n: 8, edificioId: OLIVOS.id, residente: R2, descripcion: 'El intercomunicador del departamento 302 no suena cuando tocan', tipo: 'seguridad', prioridad: 'media', tecnico: T1, creadaHaceH: 48, inicioHaceH: 30 },
  { n: 9, edificioId: OLIVOS.id, residente: R1, descripcion: 'Las luces de la escalera parpadean toda la noche', tipo: 'electricidad', prioridad: 'media', tecnico: T2, creadaHaceH: 26, inicioHaceH: 20 },
  // Pendientes
  { n: 10, edificioId: OLIVOS.id, residente: R2, descripcion: 'Hay excremento de perro en la escalera del segundo piso', tipo: 'limpieza', prioridad: 'media', creadaHaceH: 10 },
  { n: 11, edificioId: OLIVOS.id, residente: R1, descripcion: 'Se inundó el estacionamiento del sótano por la lluvia', tipo: 'plomeria', prioridad: 'alta', tecnico: T2, creadaHaceH: 3 },
  { n: 12, edificioId: OLIVOS.id, residente: R2, descripcion: 'La pintura de la fachada se está descascarando', tipo: 'otros', prioridad: 'baja', creadaHaceH: 1 },
  // Otro edificio (para probar el aislamiento)
  { n: 13, edificioId: SAN_BORJA.id, residente: 'residente1@sanborja.demo', descripcion: 'La bomba de agua hace un ruido muy fuerte en las noches', tipo: 'plomeria', prioridad: 'media', creadaHaceH: 20 },
]

const idDemo = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function crearIncidenciasDemo(reiniciar: boolean): Promise<number> {
  const ids = INCIDENCIAS_DEMO.map((i) => idDemo(i.n))
  // El historial y los avisos se borran en cascada
  if (reiniciar) await prisma.incidencia.deleteMany({ where: { id: { in: ids } } })

  const usuarios = new Map((await prisma.usuario.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id]))
  const idDe = (email: string) => {
    const id = usuarios.get(email)
    if (!id) throw new Error(`Falta el usuario ${email}`)
    return id
  }
  const ahora = Date.now()
  const hace = (horas: number) => new Date(ahora - horas * 3600_000)

  let creadas = 0
  for (const d of INCIDENCIAS_DEMO) {
    const id = idDemo(d.n)
    if (await prisma.incidencia.findUnique({ where: { id }, select: { id: true } })) continue

    const estado: EstadoIncidencia = d.resueltaHaceH !== undefined ? 'resuelto' : d.inicioHaceH !== undefined ? 'en_proceso' : 'pendiente'
    const residenteId = idDe(d.residente)
    const tecnicoId = d.tecnico ? idDe(d.tecnico) : null

    const historial: { estadoAnterior: EstadoIncidencia | null; estadoNuevo: EstadoIncidencia; usuarioId: string; fecha: Date }[] = [
      { estadoAnterior: null, estadoNuevo: 'pendiente', usuarioId: residenteId, fecha: hace(d.creadaHaceH) },
    ]
    if (d.inicioHaceH !== undefined && tecnicoId) {
      historial.push({ estadoAnterior: 'pendiente', estadoNuevo: 'en_proceso', usuarioId: tecnicoId, fecha: hace(d.inicioHaceH) })
    }
    if (d.resueltaHaceH !== undefined && tecnicoId) {
      historial.push({ estadoAnterior: 'en_proceso', estadoNuevo: 'resuelto', usuarioId: tecnicoId, fecha: hace(d.resueltaHaceH) })
    }

    await prisma.incidencia.create({
      data: {
        id,
        edificioId: d.edificioId,
        residenteId,
        descripcion: d.descripcion,
        tipo: d.tipo,
        prioridad: d.prioridad,
        clasificadoPor: d.ia ? 'manual' : 'ia',
        tipoIA: d.ia?.tipo ?? d.tipo,
        prioridadIA: d.ia?.prioridad ?? d.prioridad,
        estado,
        asignadoAId: tecnicoId,
        fechaCreacion: hace(d.creadaHaceH),
        fechaInicioProceso: d.inicioHaceH !== undefined ? hace(d.inicioHaceH) : null,
        fechaResolucion: d.resueltaHaceH !== undefined ? hace(d.resueltaHaceH) : null,
        historial: { create: historial },
        // Los avisos que habría recibido el residente (los de las últimas 48 h quedan sin leer)
        notificaciones: {
          create: historial.slice(1).map((h) => ({
            usuarioId: residenteId,
            mensaje: mensajeCambioEstado(d.descripcion, h.estadoNuevo),
            fecha: h.fecha,
            leida: ahora - h.fecha.getTime() > 48 * 3600_000,
          })),
        },
      },
    })
    creadas++
  }
  return creadas
}

async function main() {
  for (const edificio of EDIFICIOS) {
    await prisma.edificio.upsert({ where: { id: edificio.id }, update: edificio, create: edificio })
  }

  const passwordHash = await bcrypt.hash(PASSWORD_DEMO, 10)
  for (const usuario of USUARIOS) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: { nombre: usuario.nombre, rol: usuario.rol, edificioId: usuario.edificioId, activo: true },
      create: { ...usuario, passwordHash },
    })
  }

  const creadas = await crearIncidenciasDemo(process.argv.includes('--reiniciar-demo'))

  console.log(
    `Seed listo: ${EDIFICIOS.length} edificios, ${USUARIOS.length} usuarios (contraseña: ${PASSWORD_DEMO}), ${creadas} incidencias de demo nuevas`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
