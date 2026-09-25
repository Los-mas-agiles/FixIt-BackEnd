import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { ApiError } from '../lib/errors.js'
import type { ApiError as ApiErrorBody } from '../types/models.js'

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'NO_ENCONTRADO', 'Ruta no encontrada'))
}

const MENSAJES_MULTER: Partial<Record<multer.MulterError['code'], string>> = {
  LIMIT_FILE_SIZE: 'La foto no puede pesar más de 4 MB',
  LIMIT_FILE_COUNT: 'Solo se puede adjuntar una foto',
  LIMIT_UNEXPECTED_FILE: 'La foto debe enviarse en el campo "foto"',
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let body: ApiErrorBody
  let status: number

  if (err instanceof ApiError) {
    status = err.status
    body = { error: { code: err.code, message: err.message, details: err.details } }
  } else if (err instanceof ZodError) {
    status = 400
    body = {
      error: {
        code: 'VALIDACION',
        message: 'Los datos enviados no son válidos',
        details: err.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message })),
      },
    }
  } else if (err instanceof multer.MulterError) {
    status = 400
    body = { error: { code: 'VALIDACION', message: MENSAJES_MULTER[err.code] ?? 'No se pudo procesar el archivo enviado' } }
  } else if (err?.code === 'P2002') {
    // Violación de campo único en Prisma (ej. dos altas simultáneas con el mismo email)
    status = 400
    body = { error: { code: 'VALIDACION', message: 'Ya existe un registro con esos datos' } }
  } else if (err?.type === 'entity.parse.failed') {
    // JSON mal formado en el body
    status = 400
    body = { error: { code: 'VALIDACION', message: 'El cuerpo de la petición no es un JSON válido' } }
  } else if (err?.type === 'entity.too.large') {
    status = 400
    body = { error: { code: 'VALIDACION', message: 'La petición es demasiado grande' } }
  } else {
    // Error inesperado: el detalle solo va al log, nunca al cliente
    console.error(err)
    status = 500
    body = { error: { code: 'INTERNO', message: 'Ocurrió un error inesperado. Intenta nuevamente.' } }
  }

  res.status(status).json(body)
}
