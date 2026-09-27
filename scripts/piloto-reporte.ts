// Reporte de resultados del piloto para el TF: lee los datos del edificio y escribe docs/RESULTADOS_PILOTO.md
// y docs/piloto/cfd-piloto.svg.
// Uso:
//   npm run piloto:reporte -- --edificio "Residencial Las Palmeras"
//   npm run piloto:reporte -- --edificio "Residencial Las Palmeras" --desde 2026-11-02 --hasta 2026-11-15 --whatsapp 3
// --desde / --hasta: días de Lima (por defecto, desde el primer reporte del edificio hasta ahora).
// --whatsapp: cuántos reclamos siguieron llegando por WhatsApp en el periodo (lo cuenta el administrador).
import { mkdirSync, writeFileSync } from 'node:fs'
import { diaLima } from '../src/domain/kpis.js'
import type { RolUsuario } from '../src/types/models.js'
import { leerArgumentos } from './lib/argumentos.js'
import { bd } from './lib/bd.js'
import { cfdSvg } from './lib/cfd-svg.js'
import { armarReportePiloto } from './piloto/reporte.js'

const DIA = /^\d{4}-\d{2}-\d{2}$/

async function main() {
  const args = leerArgumentos()
  if (!args.edificio) throw new Error('Falta --edificio "Nombre del edificio"')
  for (const clave of ['desde', 'hasta'] as const) {
    if (args[clave] && !DIA.test(args[clave])) throw new Error(`--${clave} debe tener el formato AAAA-MM-DD`)
  }
  const whatsapp = args.whatsapp === undefined ? undefined : Number(args.whatsapp)
  if (whatsapp !== undefined && (!Number.isInteger(whatsapp) || whatsapp < 0)) throw new Error('--whatsapp debe ser un número entero ≥ 0')

  const edificio = await bd.edificio.findFirst({ where: { nombre: args.edificio }, select: { id: true, nombre: true } })
  if (!edificio) throw new Error(`No existe el edificio "${args.edificio}"`)

  const incidencias = await bd.incidencia.findMany({
    where: { edificioId: edificio.id },
    select: {
      residenteId: true, prioridad: true, estado: true, tipo: true, tipoIA: true, prioridadIA: true, clasificadoPor: true,
      fechaCreacion: true, fechaInicioProceso: true, fechaResolucion: true,
    },
    orderBy: { fechaCreacion: 'asc' },
  })
  if (incidencias.length === 0) throw new Error('El edificio todavía no tiene incidencias')

  // Días de Lima: desde las 00:00 del primer día hasta las 23:59:59 del último (o ahora)
  const desde = new Date(`${args.desde ?? diaLima(incidencias[0]!.fechaCreacion)}T00:00:00-05:00`)
  const hasta = args.hasta ? new Date(`${args.hasta}T23:59:59.999-05:00`) : new Date()
  if (desde >= hasta) throw new Error('--desde debe ser anterior a --hasta')

  const usuarios = await bd.usuario.findMany({ where: { edificioId: edificio.id, activo: true }, select: { id: true, rol: true } })
  const participantes: Record<RolUsuario, number> = { residente: 0, mantenimiento: 0, administrador: 0 }
  for (const u of usuarios) participantes[u.rol]++
  const ids = usuarios.map((u) => u.id)
  const avisos = await bd.notificacion.count({ where: { usuarioId: { in: ids }, fecha: { gte: desde, lte: hasta } } })
  const conPush = await bd.suscripcionPush.findMany({ where: { usuarioId: { in: ids } }, distinct: ['usuarioId'], select: { usuarioId: true } })

  const { markdown, cfd } = armarReportePiloto({
    edificio: edificio.nombre,
    periodo: { desde, hasta },
    incidencias,
    participantes,
    avisos,
    usuariosConPush: conPush.length,
    reportesWhatsapp: whatsapp,
    generado: new Date(),
  })

  mkdirSync(new URL('../docs/piloto/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../docs/RESULTADOS_PILOTO.md', import.meta.url), markdown)
  const etiquetas = cfd.map((p) => `${p.fecha.slice(8, 10)}/${p.fecha.slice(5, 7)}`)
  writeFileSync(new URL('../docs/piloto/cfd-piloto.svg', import.meta.url), cfdSvg(cfd, { titulo: `Piloto — ${edificio.nombre}`, etiquetas, pieEje: 'Día' }))
  console.log(`Listo: docs/RESULTADOS_PILOTO.md y docs/piloto/cfd-piloto.svg (${incidencias.length} incidencias del edificio)`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => bd.$disconnect())
