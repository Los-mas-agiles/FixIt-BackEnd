// Qué webs pueden llamar a la API desde el navegador (CORS).
// CORS_ORIGINS admite comodines "*" para los previews de Vercel, que cambian de URL en cada PR:
//   https://fix-it-front-end*.vercel.app  →  https://fix-it-front-end.vercel.app
//                                           https://fix-it-front-end-git-feature-login-agiles.vercel.app

function aExpresion(patron: string): RegExp {
  const escapado = patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  // El comodín solo cubre letras, números y guiones: nunca "." ni "/", así no puede saltar a otro dominio
  return new RegExp(`^${escapado.replace(/\*/g, '[a-z0-9-]*')}$`, 'i')
}

export function crearValidadorOrigen(patrones: string[]): (origen: string) => boolean {
  const expresiones = patrones.map(aExpresion)
  return (origen) => expresiones.some((expresion) => expresion.test(origen))
}
