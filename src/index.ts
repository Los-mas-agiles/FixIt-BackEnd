// Entrypoint de Vercel: exporta la app Express por defecto (no llama a listen).
// Para correr en local se usa src/dev.ts.
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { healthRouter } from './modules/health/routes.js'

const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: env.CORS_ORIGINS }))
app.use(express.json({ limit: '100kb' }))

const api = express.Router()
api.use('/health', healthRouter)
app.use('/api', api)

app.use(notFound)
app.use(errorHandler)

export default app
