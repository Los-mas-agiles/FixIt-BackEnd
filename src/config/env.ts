// Variables de entorno validadas al arrancar: si falta algo obligatorio, la API no levanta
// y el error dice exactamente qué variable revisar.
import 'dotenv/config'
import { z } from 'zod'

const opcional = z.string().trim().min(1).optional()

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((valor) => valor.split(',').map((origen) => origen.trim()).filter(Boolean)),
  WIP_LIMITE_TECNICO: z.coerce.number().int().positive().default(3),

  // Se vuelven obligatorias en las fases que las usan (2: Storage, 4: IA, 5: Push)
  SUPABASE_URL: opcional,
  SUPABASE_SECRET_KEY: opcional,
  SUPABASE_BUCKET: z.string().default('fotos'),
  GEMINI_API_KEY: opcional,
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  VAPID_PUBLIC_KEY: opcional,
  VAPID_PRIVATE_KEY: opcional,
  VAPID_SUBJECT: opcional,
})

const resultado = schema.safeParse(process.env)

if (!resultado.success) {
  const detalle = resultado.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
  throw new Error(`Variables de entorno inválidas:\n${detalle}\nRevisa tu archivo .env (ver .env.example).`)
}

export const env = resultado.data
