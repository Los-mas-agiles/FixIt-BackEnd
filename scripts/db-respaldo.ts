// Respaldo de la BD en JSON (una tabla por archivo) y, opcionalmente, de las fotos.
// Uso:  npm run db:respaldo              → respaldos/<fecha-hora>/*.json
//       npm run db:respaldo -- --fotos   → además descarga las fotos del bucket
// La carpeta respaldos/ está en .gitignore: incluye los hashes de las contraseñas y datos del piloto,
// NUNCA debe subirse al repositorio (es público). Guárdala en un lugar privado (ej. Drive del equipo).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { descargarFoto } from '../src/lib/storage.js'
import { leerArgumentos } from './lib/argumentos.js'
import { bd } from './lib/bd.js'

const ahora = new Date()
// Nombre de carpeta con la hora de Lima (UTC−5): 2026-11-20_1830
const sello = new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', '')
const carpeta = join('respaldos', sello)

async function main() {
  const conFotos = leerArgumentos().fotos === 'true'
  mkdirSync(carpeta, { recursive: true })

  // En orden de dependencias: así se pueden volver a insertar en el mismo orden
  const tablas = {
    edificios: await bd.edificio.findMany({ orderBy: { creadoEn: 'asc' } }),
    usuarios: await bd.usuario.findMany({ orderBy: { creadoEn: 'asc' } }),
    incidencias: await bd.incidencia.findMany({ orderBy: { fechaCreacion: 'asc' } }),
    historial_estados: await bd.historialEstado.findMany({ orderBy: { fecha: 'asc' } }),
    notificaciones: await bd.notificacion.findMany({ orderBy: { fecha: 'asc' } }),
    suscripciones_push: await bd.suscripcionPush.findMany({ orderBy: { creadoEn: 'asc' } }),
  }
  for (const [nombre, filas] of Object.entries(tablas)) {
    writeFileSync(join(carpeta, `${nombre}.json`), JSON.stringify(filas, null, 2))
  }

  let fotos = 0
  const fallidas: string[] = []
  if (conFotos) {
    for (const { fotoPath } of tablas.incidencias) {
      if (!fotoPath) continue
      try {
        const destino = join(carpeta, 'fotos', fotoPath)
        mkdirSync(dirname(destino), { recursive: true })
        writeFileSync(destino, await descargarFoto(fotoPath))
        fotos++
      } catch (error) {
        fallidas.push(fotoPath)
        console.error(error instanceof Error ? error.message : error)
      }
    }
  }

  const resumen = {
    generado: ahora.toISOString(),
    filas: Object.fromEntries(Object.entries(tablas).map(([nombre, filas]) => [nombre, filas.length])),
    fotos: conFotos ? { descargadas: fotos, fallidas } : 'no incluidas (usa --fotos)',
  }
  writeFileSync(join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2))
  console.log(`Respaldo listo en ${carpeta}`)
  console.table(resumen.filas)
  if (conFotos) console.log(`Fotos: ${fotos} descargadas${fallidas.length ? `, ${fallidas.length} con error` : ''}`)
  if (fallidas.length) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => bd.$disconnect())
