// BD falsa en memoria que imita la parte de Prisma que usa la API.
// Se usa con: vi.mock('../src/lib/prisma.js', () => import('./helpers/fakePrisma.js'))
import { randomUUID } from 'node:crypto'
import { hashSync } from 'bcryptjs'
import type { RolUsuario } from '../../src/types/models.js'

export const PASSWORD_DEMO = 'FixIt2026!'
const HASH_DEMO = hashSync(PASSWORD_DEMO, 4) // costo bajo: solo para tests

interface EdificioFake {
  id: string
  nombre: string
}

interface UsuarioFake {
  id: string
  nombre: string
  email: string
  passwordHash: string
  rol: RolUsuario
  edificioId: string
  activo: boolean
}

export const EDIFICIO_A = { id: 'edificio-a', nombre: 'Residencial Los Olivos' }
export const EDIFICIO_B = { id: 'edificio-b', nombre: 'Torre San Borja' }

interface IncidenciaFake {
  id: string
  edificioId: string
  residenteId: string
  descripcion: string
  fotoPath: string | null
  tipo: string
  prioridad: string
  clasificadoPor: string
  tipoIA: string | null
  prioridadIA: string | null
  estado: string
  asignadoAId: string | null
  fechaCreacion: Date
  fechaInicioProceso: Date | null
  fechaResolucion: Date | null
}

interface HistorialFake {
  id: string
  incidenciaId: string
  estadoAnterior: string | null
  estadoNuevo: string
  usuarioId: string
  fecha: Date
}

const edificios: EdificioFake[] = [EDIFICIO_A, EDIFICIO_B]
let usuarios: UsuarioFake[] = []
let incidencias: IncidenciaFake[] = []
let historial: HistorialFake[] = []
let fallarProximoCreate = false

/** Hace que el próximo incidencia.create falle (para probar la limpieza de la foto). */
export function simularFalloAlCrearIncidencia() {
  fallarProximoCreate = true
}

export function todasLasIncidencias() {
  return incidencias
}

function nuevoUsuario(datos: Omit<UsuarioFake, 'id' | 'passwordHash' | 'activo'> & Partial<UsuarioFake>): UsuarioFake {
  return { id: randomUUID(), passwordHash: HASH_DEMO, activo: true, ...datos }
}

/** Reinicia la BD falsa con los datos de demo. Llamar en beforeEach. */
export function reiniciarBD() {
  usuarios = [
    nuevoUsuario({ nombre: 'Ana Torres', email: 'admin@olivos.demo', rol: 'administrador', edificioId: EDIFICIO_A.id }),
    nuevoUsuario({ nombre: 'Carlos Quispe', email: 'tecnico1@olivos.demo', rol: 'mantenimiento', edificioId: EDIFICIO_A.id }),
    nuevoUsuario({ nombre: 'María Rojas', email: 'residente1@olivos.demo', rol: 'residente', edificioId: EDIFICIO_A.id }),
    nuevoUsuario({ nombre: 'Pedro Inactivo', email: 'inactivo@olivos.demo', rol: 'residente', edificioId: EDIFICIO_A.id, activo: false }),
    nuevoUsuario({ nombre: 'Patricia Vega', email: 'admin@sanborja.demo', rol: 'administrador', edificioId: EDIFICIO_B.id }),
    nuevoUsuario({ nombre: 'Diego Paredes', email: 'residente1@sanborja.demo', rol: 'residente', edificioId: EDIFICIO_B.id }),
    nuevoUsuario({ nombre: 'Jorge Salazar', email: 'residente2@olivos.demo', rol: 'residente', edificioId: EDIFICIO_A.id }),
  ]
  incidencias = []
  historial = []
  fallarProximoCreate = false
}

/** Inserta una incidencia directamente (para preparar escenarios de lectura). */
export function crearIncidenciaDePrueba(datos: {
  residenteEmail: string
  descripcion?: string
  estado?: string
  prioridad?: string
  asignadoAEmail?: string
  fotoPath?: string
  fechaCreacion?: Date
}) {
  const residente = buscarUsuario(datos.residenteEmail)
  const incidencia: IncidenciaFake = {
    id: randomUUID(),
    edificioId: residente.edificioId,
    residenteId: residente.id,
    descripcion: datos.descripcion ?? 'Fuga de agua en el baño del departamento',
    fotoPath: datos.fotoPath ?? null,
    tipo: 'plomeria',
    prioridad: datos.prioridad ?? 'media',
    clasificadoPor: 'ia',
    tipoIA: 'plomeria',
    prioridadIA: datos.prioridad ?? 'media',
    estado: datos.estado ?? 'pendiente',
    asignadoAId: datos.asignadoAEmail ? buscarUsuario(datos.asignadoAEmail).id : null,
    fechaCreacion: datos.fechaCreacion ?? new Date(),
    fechaInicioProceso: null,
    fechaResolucion: null,
  }
  incidencias.push(incidencia)
  historial.push({
    id: randomUUID(),
    incidenciaId: incidencia.id,
    estadoAnterior: null,
    estadoNuevo: 'pendiente',
    usuarioId: residente.id,
    fecha: incidencia.fechaCreacion,
  })
  return incidencia
}

function resumen(id: string | null) {
  const usuario = id ? usuarios.find((u) => u.id === id) : undefined
  return usuario ? { id: usuario.id, nombre: usuario.nombre } : null
}

// Devuelve la incidencia con sus relaciones (residente, asignadoA, historial con usuario)
function conRelaciones(i: IncidenciaFake) {
  return {
    ...i,
    residente: resumen(i.residenteId)!,
    asignadoA: resumen(i.asignadoAId),
    historial: historial
      .filter((h) => h.incidenciaId === i.id)
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
      .map((h) => ({ ...h, usuario: resumen(h.usuarioId)! })),
  }
}

function cumpleIncidencia(i: IncidenciaFake, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([campo, valor]) => i[campo as keyof IncidenciaFake] === valor)
}

export function buscarUsuario(email: string): UsuarioFake {
  const usuario = usuarios.find((u) => u.email === email)
  if (!usuario) throw new Error(`Usuario de prueba no encontrado: ${email}`)
  return usuario
}

export function desactivarUsuario(email: string) {
  buscarUsuario(email).activo = false
}

// Devuelve el usuario con su edificio (el mapper ignora los campos que no necesita)
function conEdificio(u: UsuarioFake) {
  const edificio = edificios.find((e) => e.id === u.edificioId)!
  return { ...u, edificio: { nombre: edificio.nombre } }
}

type WhereUsuario = Partial<Pick<UsuarioFake, 'id' | 'email' | 'edificioId' | 'rol' | 'activo'>>

function cumple(u: UsuarioFake, where: WhereUsuario = {}) {
  return Object.entries(where).every(([campo, valor]) => u[campo as keyof UsuarioFake] === valor)
}

export const prisma = {
  usuario: {
    async findUnique({ where }: { where: { id?: string; email?: string } }) {
      const usuario = usuarios.find((u) => (where.id ? u.id === where.id : u.email === where.email))
      return usuario ? conEdificio(usuario) : null
    },
    async findMany({ where }: { where?: WhereUsuario }) {
      return usuarios
        .filter((u) => cumple(u, where))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map(conEdificio)
    },
    async create({ data }: { data: Omit<UsuarioFake, 'id' | 'activo'> }) {
      if (usuarios.some((u) => u.email === data.email)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      }
      const usuario = { id: randomUUID(), activo: true, ...data }
      usuarios.push(usuario)
      return conEdificio(usuario)
    },
  },
  incidencia: {
    async create({ data }: { data: Omit<IncidenciaFake, 'estado' | 'asignadoAId' | 'fechaCreacion' | 'fechaInicioProceso' | 'fechaResolucion'> & { historial: { create: Omit<HistorialFake, 'id' | 'incidenciaId' | 'fecha'> } } }) {
      if (fallarProximoCreate) {
        fallarProximoCreate = false
        throw new Error('Fallo simulado de la BD')
      }
      const { historial: nested, ...campos } = data
      const incidencia: IncidenciaFake = {
        ...campos,
        estado: 'pendiente',
        asignadoAId: null,
        fechaCreacion: new Date(),
        fechaInicioProceso: null,
        fechaResolucion: null,
      }
      incidencias.push(incidencia)
      historial.push({ id: randomUUID(), incidenciaId: incidencia.id, fecha: incidencia.fechaCreacion, ...nested.create })
      return conRelaciones(incidencia)
    },
    async findMany({ where, take }: { where?: Record<string, unknown>; take?: number }) {
      return incidencias
        .filter((i) => cumpleIncidencia(i, where))
        .sort((a, b) => b.fechaCreacion.getTime() - a.fechaCreacion.getTime())
        .slice(0, take)
        .map(conRelaciones)
    },
    async findFirst({ where }: { where?: Record<string, unknown> }) {
      const incidencia = incidencias.find((i) => cumpleIncidencia(i, where))
      return incidencia ? conRelaciones(incidencia) : null
    },
  },
  async $queryRaw() {
    return [{ '?column?': 1 }]
  },
}
