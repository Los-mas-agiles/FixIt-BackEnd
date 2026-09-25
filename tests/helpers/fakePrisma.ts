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

const edificios: EdificioFake[] = [EDIFICIO_A, EDIFICIO_B]
let usuarios: UsuarioFake[] = []

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
  ]
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
  async $queryRaw() {
    return [{ '?column?': 1 }]
  },
}
