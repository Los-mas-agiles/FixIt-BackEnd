import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { CONTENT_TYPE, detectarTipoImagen } from '../../domain/imagen.js'
import { mensajeAsignacion, mensajeCambioEstado } from '../../domain/notificaciones.js'
import { evaluarTransicion, superaLimiteWip } from '../../domain/transiciones.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'
import { prisma } from '../../lib/prisma.js'
import { enviarPush } from '../../lib/push.js'
import { enSegundoPlano } from '../../lib/segundoPlano.js'
import { borrarFoto, subirFoto, urlsFirmadas } from '../../lib/storage.js'
import type { EstadoIncidencia, Incidencia, IncidenciaDetalle, Prioridad, TipoIncidencia } from '../../types/models.js'
import type { UsuarioAutenticado } from '../../types/express.js'
import { clasificar } from './clasificador.js'
import { programarReclasificacion } from './reclasificacion.js'
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
    // Si la IA no respondió a tiempo, se reintentará sola en segundo plano (sin hacer esperar al residente)
    if (clasificacion.clasificadoPor === 'fallback') programarReclasificacion(usuario.edificioId)
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

  // Cada vez que se consulta el tablero, se reintenta (en segundo plano) clasificar las que quedaron en fallback
  if (incidencias.some((i) => i.clasificadoPor === 'fallback')) programarReclasificacion(usuario.edificioId)

  const urls = await urlsFirmadas(incidencias.flatMap((i) => (i.fotoPath ? [i.fotoPath] : [])))
  return incidencias.map((i) => aIncidencia(i, i.fotoPath ? (urls.get(i.fotoPath) ?? null) : null))
}

interface Aviso {
  usuarioId: string
  mensaje: string
}

/** Envía el push del aviso DESPUÉS de responder (la notificación ya quedó guardada en la BD). */
function enviarAviso(aviso: Aviso | null, incidenciaId: string) {
  if (!aviso) return
  enSegundoPlano(() => enviarPush(aviso.usuarioId, { titulo: 'FixIt', mensaje: aviso.mensaje, url: `/incidencias/${incidenciaId}` }))
}

const noEncontrada = () => new ApiError(404, 'NO_ENCONTRADO', 'La incidencia no existe')

/** Un id con formato inválido se trata igual que uno inexistente (404, no 500). */
function validarId(id: string) {
  if (!idIncidenciaSchema.safeParse(id).success) throw noEncontrada()
}

/** Lee la incidencia ya actualizada con sus relaciones y la URL de la foto. */
async function incidenciaCompleta(id: string): Promise<Incidencia> {
  const incidencia = await prisma.incidencia.findFirst({ where: { id }, include: INCLUDE_INCIDENCIA })
  if (!incidencia) throw noEncontrada()
  return aIncidencia(incidencia, await urlDe(incidencia.fotoPath))
}

function mensajeLimiteWip(esElMismoTecnico: boolean): string {
  const limite = env.WIP_LIMITE_TECNICO
  return esElMismoTecnico
    ? `Ya tienes ${limite} incidencias en proceso. Resuelve una antes de tomar otra.`
    : `El técnico ya tiene ${limite} incidencias en proceso. Espera a que resuelva una o asigna otro técnico.`
}

export async function obtenerIncidencia(usuario: UsuarioAutenticado, id: string): Promise<IncidenciaDetalle> {
  validarId(id)

  const incidencia = await prisma.incidencia.findFirst({
    where: {
      id,
      edificioId: usuario.edificioId, // de otro edificio → 404 (no revela que existe)
      ...(usuario.rol === 'residente' ? { residenteId: usuario.id } : {}),
    },
    include: INCLUDE_INCIDENCIA_DETALLE,
  })
  if (!incidencia) throw noEncontrada()

  return aIncidenciaDetalle(incidencia, await urlDe(incidencia.fotoPath))
}

export async function cambiarEstado(
  usuario: UsuarioAutenticado,
  id: string,
  estadoNuevo: EstadoIncidencia,
): Promise<Incidencia> {
  validarId(id)

  const aviso = await prisma.$transaction(async (tx): Promise<Aviso> => {
    const incidencia = await tx.incidencia.findFirst({
      where: { id, edificioId: usuario.edificioId },
      select: { id: true, estado: true, asignadoAId: true, residenteId: true, descripcion: true },
    })
    if (!incidencia) throw noEncontrada()

    const decision = evaluarTransicion({
      estadoActual: incidencia.estado,
      estadoNuevo,
      asignadoAId: incidencia.asignadoAId,
      actor: { id: usuario.id, rol: usuario.rol },
    })
    if (!decision.ok) throw new ApiError(decision.status, decision.code, decision.mensaje)

    if (estadoNuevo === 'en_proceso') {
      const enProceso = await tx.incidencia.count({ where: { asignadoAId: decision.tecnicoId, estado: 'en_proceso' } })
      if (superaLimiteWip(enProceso, env.WIP_LIMITE_TECNICO)) {
        throw new ApiError(409, 'LIMITE_WIP', mensajeLimiteWip(decision.tecnicoId === usuario.id))
      }
    }

    // Hora del SERVIDOR (nunca la del cliente): alimenta el cycle time y el lead time
    const ahora = new Date()
    // Actualización condicional: si otra persona la movió en paralelo, no se pisa su cambio
    const { count } = await tx.incidencia.updateMany({
      where: { id, estado: incidencia.estado },
      data: { estado: estadoNuevo, asignadoAId: decision.tecnicoId, [decision.campoFecha]: ahora },
    })
    if (count === 0) {
      throw new ApiError(409, 'TRANSICION_INVALIDA', 'Otra persona actualizó esta incidencia hace un momento. Recarga el tablero.')
    }

    await tx.historialEstado.create({
      data: { incidenciaId: id, estadoAnterior: incidencia.estado, estadoNuevo, usuarioId: usuario.id, fecha: ahora },
    })

    // HU4: el residente se entera del cambio (en la app y por push)
    const mensaje = mensajeCambioEstado(incidencia.descripcion, estadoNuevo)
    await tx.notificacion.create({ data: { usuarioId: incidencia.residenteId, incidenciaId: id, mensaje, fecha: ahora } })
    return { usuarioId: incidencia.residenteId, mensaje }
  })

  enviarAviso(aviso, id)
  return incidenciaCompleta(id)
}

export async function asignarTecnico(
  usuario: UsuarioAutenticado,
  id: string,
  tecnicoId: string | null,
): Promise<Incidencia> {
  validarId(id)

  const aviso = await prisma.$transaction(async (tx): Promise<Aviso | null> => {
    const incidencia = await tx.incidencia.findFirst({
      where: { id, edificioId: usuario.edificioId },
      select: { id: true, estado: true, asignadoAId: true, descripcion: true },
    })
    if (!incidencia) throw noEncontrada()

    if (incidencia.estado === 'resuelto') {
      throw new ApiError(409, 'TRANSICION_INVALIDA', 'No se puede reasignar una incidencia resuelta')
    }
    if (tecnicoId === null && incidencia.estado === 'en_proceso') {
      throw new ApiError(409, 'TRANSICION_INVALIDA', 'Una incidencia en proceso siempre debe tener un técnico')
    }

    if (tecnicoId) {
      const tecnico = await tx.usuario.findFirst({
        where: { id: tecnicoId, edificioId: usuario.edificioId, rol: 'mantenimiento', activo: true },
        select: { id: true },
      })
      if (!tecnico) throw new ApiError(400, 'VALIDACION', 'El técnico no existe o no pertenece a tu edificio')

      // Reasignar una incidencia en proceso le suma trabajo al nuevo técnico: respeta su límite de WIP
      if (incidencia.estado === 'en_proceso' && tecnicoId !== incidencia.asignadoAId) {
        const enProceso = await tx.incidencia.count({ where: { asignadoAId: tecnicoId, estado: 'en_proceso' } })
        if (superaLimiteWip(enProceso, env.WIP_LIMITE_TECNICO)) {
          throw new ApiError(409, 'LIMITE_WIP', mensajeLimiteWip(false))
        }
      }
    }

    await tx.incidencia.update({ where: { id }, data: { asignadoAId: tecnicoId } })

    // El técnico nuevo se entera de que tiene trabajo asignado
    if (!tecnicoId || tecnicoId === incidencia.asignadoAId) return null
    const mensaje = mensajeAsignacion(incidencia.descripcion)
    await tx.notificacion.create({ data: { usuarioId: tecnicoId, incidenciaId: id, mensaje } })
    return { usuarioId: tecnicoId, mensaje }
  })

  enviarAviso(aviso, id)
  return incidenciaCompleta(id)
}

/**
 * Corrección manual de la clasificación (solo admin). Marca clasificadoPor = 'manual'
 * y conserva tipoIA / prioridadIA originales para poder medir la precisión de la IA.
 */
export async function corregirClasificacion(
  usuario: UsuarioAutenticado,
  id: string,
  datos: { tipo?: TipoIncidencia; prioridad?: Prioridad },
): Promise<Incidencia> {
  validarId(id)

  const { count } = await prisma.incidencia.updateMany({
    where: { id, edificioId: usuario.edificioId },
    data: {
      ...(datos.tipo ? { tipo: datos.tipo } : {}),
      ...(datos.prioridad ? { prioridad: datos.prioridad } : {}),
      clasificadoPor: 'manual',
    },
  })
  if (count === 0) throw noEncontrada()

  return incidenciaCompleta(id)
}
