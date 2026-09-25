// Fotos de incidencias en Supabase Storage (bucket PRIVADO).
// Se usa la secret key, así que este módulo solo puede existir en el backend.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { ApiError } from './errors.js'

const DURACION_URL_FIRMADA_SEG = 60 * 60 // 1 hora

let cliente: SupabaseClient | undefined

function bucket() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error('Storage no configurado: faltan SUPABASE_URL o SUPABASE_SECRET_KEY')
    throw new ApiError(500, 'INTERNO', 'El almacenamiento de fotos no está disponible')
  }
  cliente ??= createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cliente.storage.from(env.SUPABASE_BUCKET)
}

export async function subirFoto(path: string, contenido: Buffer, contentType: string): Promise<void> {
  const { error } = await bucket().upload(path, contenido, { contentType, upsert: false })
  if (error) {
    console.error('Error subiendo foto a Storage', error)
    throw new ApiError(500, 'INTERNO', 'No se pudo guardar la foto. Intenta nuevamente.')
  }
}

/** Borra una foto. Nunca lanza error: se usa para limpiar si algo falla después de subirla. */
export async function borrarFoto(path: string): Promise<void> {
  try {
    const { error } = await bucket().remove([path])
    if (error) console.error('No se pudo borrar la foto', path, error)
  } catch (error) {
    console.error('No se pudo borrar la foto', path, error)
  }
}

/**
 * URLs firmadas (1 hora) para varias fotos en UNA sola llamada.
 * Si Storage falla, devuelve un mapa vacío: la incidencia se muestra igual, solo sin foto.
 */
export async function urlsFirmadas(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (paths.length === 0) return urls
  try {
    const { data, error } = await bucket().createSignedUrls(paths, DURACION_URL_FIRMADA_SEG)
    if (error) throw error
    for (const item of data) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
    }
  } catch (error) {
    console.error('No se pudieron firmar las URLs de las fotos', error)
  }
  return urls
}
