/** Lee argumentos del estilo --clave valor (y --bandera sin valor → 'true'). */
export function leerArgumentos(argv = process.argv.slice(2)): Record<string, string> {
  const args: Record<string, string> = {}
  for (let k = 0; k < argv.length; k++) {
    const actual = argv[k]!
    if (!actual.startsWith('--')) continue
    const siguiente = argv[k + 1]
    if (siguiente === undefined || siguiente.startsWith('--')) args[actual.slice(2)] = 'true'
    else args[actual.slice(2)] = argv[++k]!
  }
  return args
}
