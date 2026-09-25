import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// La CLI de Prisma (migrate, studio, seed) usa DIRECT_URL: el session pooler de Supabase (puerto 5432).
// La app en ejecución NO usa este archivo: se conecta con DATABASE_URL (pooler en modo transacción) en src/lib/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'],
  },
})
