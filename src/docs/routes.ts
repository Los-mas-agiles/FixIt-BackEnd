// Documentación interactiva: /api/docs (Swagger UI) y /api/openapi.json (especificación).
// Swagger UI se carga desde jsDelivr con versión fija y hash SRI: el navegador rechaza el archivo si alguien
// lo modifica. Así no hay que servir archivos estáticos desde la función de Vercel.
import { Router } from 'express'
import { openapi } from './openapi.js'

const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0'
const SRI_CSS = 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW'
const SRI_JS = 'sha384-YDALVcy8kj8yltLBVi1vBiBAUqdxvus673gM8XKwiy6aDUJFXivF/KCufekjYbVf'

// La API responde JSON con una CSP que bloquea todo; esta página necesita cargar Swagger UI y llamar a la API
const CSP_DOCS = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src https://cdn.jsdelivr.net 'unsafe-inline'", // Swagger UI usa atributos style
  "img-src 'self' data: https://cdn.jsdelivr.net",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const PAGINA = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FixIt API · Documentación</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" integrity="${SRI_CSS}" crossorigin="anonymous" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js" integrity="${SRI_JS}" crossorigin="anonymous"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>
`

// En un archivo aparte (y no en línea) para que la CSP no necesite 'unsafe-inline' en los scripts
const INIT = `window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  persistAuthorization: true,
  displayRequestDuration: true,
  validatorUrl: null,
})
`

export const docsRouter = Router()

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openapi)
})

docsRouter.get('/docs', (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP_DOCS)
  res.type('html').send(PAGINA)
})

docsRouter.get('/docs/init.js', (_req, res) => {
  res.type('application/javascript').send(INIT)
})
