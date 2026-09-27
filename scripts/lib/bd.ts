// Cliente de Prisma para los scripts (seed, piloto, respaldo): usa la conexión directa (DIRECT_URL),
// igual que el CLI de Prisma, y no el pooler de transacciones que usa la API en Vercel.
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client.js'

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']
if (!connectionString) throw new Error('Falta DIRECT_URL o DATABASE_URL en el .env')

export const bd = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
