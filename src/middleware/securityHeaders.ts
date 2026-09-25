import type { RequestHandler } from 'express'

// Cabeceras de seguridad para una API que solo responde JSON.
// (Reemplaza a helmet: sus tipos fallan en el build de Vercel y casi todas sus
// cabeceras están pensadas para páginas HTML. HSTS ya lo pone Vercel.)
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  next()
}
