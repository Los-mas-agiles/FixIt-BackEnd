// Dibuja un CFD (diagrama de flujo acumulado) como SVG, con los mismos colores que el panel del frontend.
import type { PuntoCFD } from '../../src/types/models.js'

export interface OpcionesCfd {
  titulo: string
  /** Texto de cada punto en el eje X (por defecto: 1, 2, 3…) */
  etiquetas?: string[]
  /** Sombrea desde este punto (índice) hasta el final, ej. la semana de una crisis */
  sombrearDesde?: number
  /** Texto debajo del eje X */
  pieEje?: string
}

const CAPAS = [
  { clave: 'resuelto', relleno: '#B8E8D0', trazo: '#5FAE88', etiqueta: 'Resueltas' },
  { clave: 'en_proceso', relleno: '#BFE0F0', trazo: '#6AAAD0', etiqueta: 'En proceso' },
  { clave: 'pendiente', relleno: '#F2C4A8', trazo: '#C98763', etiqueta: 'Pendientes' },
] as const

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function cfdSvg(puntos: PuntoCFD[], { titulo, etiquetas, sombrearDesde, pieEje = 'Día' }: OpcionesCfd): string {
  const W = 720, H = 300, izq = 44, der = 16, arr = 40, aba = 36
  const max = Math.max(...puntos.map((p) => p.pendiente + p.en_proceso + p.resuelto), 1)
  const tope = Math.ceil(max / 10) * 10
  const x = (k: number) => izq + (puntos.length > 1 ? k / (puntos.length - 1) : 0.5) * (W - izq - der)
  const y = (v: number) => H - aba - (v / tope) * (H - arr - aba)

  const acum = puntos.map(() => 0)
  const areas = CAPAS.map((c) => {
    const abajo = acum.slice()
    puntos.forEach((p, k) => (acum[k]! += p[c.clave]))
    const ida = acum.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const vuelta = abajo.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(' ')
    return `<polygon points="${ida} ${vuelta}" fill="${c.relleno}" stroke="${c.trazo}" stroke-width="1.5"/>`
  })
  const sombra =
    sombrearDesde === undefined
      ? ''
      : `<rect x="${x(sombrearDesde - 0.5).toFixed(1)}" y="${arr}" width="${(x(puntos.length - 1) - x(sombrearDesde - 0.5)).toFixed(1)}" height="${H - arr - aba}" fill="#2B2B2B" opacity="0.05"/>`
  const ejeY = [0, tope / 2, tope].map((v) => `<text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text><line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="#E5E5E5"/>`)
  // Con muchos puntos se muestra una etiqueta de cada tantas para que no se encimen
  const cada = Math.ceil(puntos.length / 16)
  const ejeX = puntos
    .map((_, k) => (k % cada === 0 || k === puntos.length - 1 ? `<text x="${x(k)}" y="${H - aba + 18}" text-anchor="middle">${escapar(etiquetas?.[k] ?? String(k + 1))}</text>` : ''))
    .filter(Boolean)
  const leyenda = CAPAS.map((c, k) => `<rect x="${izq + k * 110}" y="12" width="12" height="12" rx="3" fill="${c.relleno}" stroke="${c.trazo}"/><text x="${izq + k * 110 + 18}" y="22">${c.etiqueta}</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#2B2B2B">
<title>${escapar(titulo)}</title>
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
${sombra}
${ejeY.join('\n')}
${areas.join('\n')}
${ejeX.join('\n')}
<text x="${(izq + W - der) / 2}" y="${H - 4}" text-anchor="middle">${escapar(pieEje)}</text>
${leyenda.join('\n')}
<text x="${W - der}" y="22" text-anchor="end" font-weight="bold">${escapar(titulo)}</text>
</svg>
`
}
