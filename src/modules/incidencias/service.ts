import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { CONTENT_TYPE, detectarTipoImagen } from '../../domain/imagen.js'
import { ApiError } from '../../lib/errors.js'
import { prisma } from '../../lib/prisma.js'
import { borrarFoto, subirFoto, urlsFirmadas } from '../../lib/storage.js'
import type { Incidencia, IncidenciaDetalle } from '../../types/models.js'
import type { UsuarioAutenticado } from '../../types/express.js'
import { clasificar } from './clasificador.js'
import { aIncidencia, aIncidenciaDetalle, INCLUDE_INCIDENCIA, INCLUDE_INCIDENCIA_DETALLE } from './mapper.js'
import { idIncidenciaSchema, type listarIncidenciasSchema } from './schemas.js'

const MAX_RESULTADOS = 200

export interface FotoSubida {
  buffer: Buffer
}

async function urlDe(fotoPath: string | null): Promise<string | null> {
  if (!fotoPath) return null
  return (await urlsFirmadas([fotoPath])).get(fotoPath) ?? null
}

export async function crearIncidencia(
  usuario: UsuarioAutenticado,
  descripcion: string,
  foto?: FotoSubida,
): Promise<Incidencia> {
  const id = randomUUID()

  // 1. Validar la foto por su contenido real (antes de gastar tiempo en la IA)
  let fotoPath: string | null = null
  let contentType = ''
  if (foto) {
    const tipo = detectarTipoImagen(foto.buffer)
    if (!tipo) throw new ApiError(400, 'VALIDACION', 'La foto debe ser una imagen JPG, PNG o WEBP')
    fotoPath = `${usuario.edificioId}/${id}.${tipo}`
    contentType = CONTENT_TYPE[tipo]
  }

  // 2. Clasificar (Fase 2: fallback; Fase 4: Gemini). Nunca lanza error.
  const clasificacion = await clasificar(descripcion)

  // 3. Subir la foto y 4. crear la incidencia + su primera fila de historial en una sola operación
  if (fotoPath && foto) await subirFoto(fotoPath, foto.buffer, contentType)
  try {
    const creada = await prisma.incidencia.create({
      data: {
        id,
        edificioId: usuario.edificioId,
        residenteId: usuario.id,
        descripcion,
        fotoPath,
        tipo: clasificacion.tipo,
        prioridad: clasificacion.prioridad,
        clasificadoPor: clasificacion.clasificadoPor,
        tipoIA: clasificacion.clasificadoPor === 'ia' ? clasificacion.tipo : null,
        prioridadIA: clasificacion.clasificadoPor === 'ia' ? clasificacion.prioridad : null,
        historial: { create: { estadoAnterior: null, estadoNuevo: 'pendiente', usuarioId: usuario.id } },
      },
      include: INCLUDE_INCIDENCIA,
    })
    return aIncidencia(creada, await urlDe(fotoPath))
  } catch (error) {
    if (fotoPath) await borrarFoto(fotoPath) // no dejar fotos huérfanas en el bucket
    throw error
  }
}

export async function listarIncidencias(
  usuario: UsuarioAutenticado,
  filtros: z.infer<typeof listarIncidenciasSchema>,
): Promise<Incidencia[]> {
  const incidencias = await prisma.incidencia.findMany({
    where: {
      edificioId: usuario.edificioId,
      ...(usuario.rol === 'residente' ? { residenteId: usuario.id } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.prioridad ? { prioridad: filtros.prioridad } : {}),
      ...(filtros.asignadoA === 'me' ? { asignadoAId: usuario.id } : {}),
    },
    include: INCLUDE_INCIDENCIA,
    orderBy: { fechaCreacion: 'desc' },
    take: MAX_RESULTADOS,
  })

  const urls = await urlsFirmadas(incidencias.flatMap((i) => (i.fotoPath ? [i.fotoPath] : [])))
  return incidencias.map((i) => aIncidencia(i, i.fotoPath ? (urls.get(i.fotoPath) ?? null) : null))
}

export async function obtenerIncidencia(usuario: UsuarioAutenticado, id: string): Promise<IncidenciaDetalle> {
  const noEncontrada = new ApiError(404, 'NO_ENCONTRADO', 'La incidencia no existe')
  // Un id con formato inválido se trata igual que uno inexistente
  if (!idIncidenciaSchema.safeParse(id).success) throw noEncontrada

  const incidencia = await prisma.incidencia.findFirst({
    where: {
      id,
      edificioId: usuario.edificioId, // de otro edificio → 404 (no revela que existe)
      ...(usuario.rol === 'residente' ? { residenteId: usuario.id } : {}),
    },
    include: INCLUDE_INCIDENCIA_DETALLE,
  })
  if (!incidencia) throw noEncontrada

  return aIncidenciaDetalle(incidencia, await urlDe(incidencia.fotoPath))
}
