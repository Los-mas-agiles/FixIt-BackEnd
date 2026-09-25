import { waitUntil } from '@vercel/functions'

/**
 * Ejecuta una tarea DESPUÉS de responder, sin hacer esperar al usuario.
 * En Vercel, waitUntil mantiene viva la función hasta que termine; en local simplemente corre en paralelo.
 * Nunca lanza error: si la tarea falla, solo queda en el log.
 */
export function enSegundoPlano(tarea: () => Promise<unknown>): void {
  const promesa = tarea().catch((error) => console.error('Tarea en segundo plano falló', error))
  waitUntil(promesa)
}
