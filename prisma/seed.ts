// Datos de demo: 2 edificios y las cuentas de docs/CONTRATO_API.md (sección 3).
// Es idempotente: se puede correr varias veces sin duplicar nada.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Rol } from '../src/generated/prisma/client.js'

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

  console.log(`Seed listo: ${EDIFICIOS.length} edificios, ${USUARIOS.length} usuarios (contraseña: ${PASSWORD_DEMO})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
