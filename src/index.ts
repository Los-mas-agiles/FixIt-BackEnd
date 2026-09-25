// Entrypoint de Vercel: exporta la app Express por defecto (no llama a listen).
// Para correr en local se usa src/dev.ts.
import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { authRouter } from './modules/auth/routes.js'
import { healthRouter } from './modules/health/routes.js'
import { incidenciasRouter } from './modules/incidencias/routes.js'
import { usuariosRouter } from './modules/usuarios/routes.js'

const app = express()

app.disable('x-powered-by')
app.use(securityHeaders)
app.use(cors({ origin: env.CORS_ORIGINS }))
app.use(express.json({ limit: '100kb' }))

const api = express.Router()
api.use('/health', healthRouter)
api.use('/auth', authRouter)
api.use('/usuarios', usuariosRouter)
api.use('/incidencias', incidenciasRouter)
app.use('/api', api)

app.use(notFound)
app.use(errorHandler)

export default app
