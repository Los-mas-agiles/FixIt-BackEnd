// Crea el edificio del piloto y su administrador, con una contraseña temporal que se muestra UNA sola vez.
// Uso:
//   npm run piloto:crear -- --edificio "Residencial Las Palmeras" --direccion "Av. Las Palmeras 321, Surco" \
//                           --admin-nombre "Rosa Díaz" --admin-email rosa.diaz@correo.com
// Después, el administrador entra a la app, cambia su contraseña y crea las cuentas de residentes y técnicos
// desde la pantalla "Usuarios". Los datos del piloto quedan separados de los edificios de demo.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { hashPassword } from '../src/lib/password.js'
import { emailSchema } from '../src/modules/usuarios/schemas.js'
import { leerArgumentos } from './lib/argumentos.js'
import { bd } from './lib/bd.js'

// Si falta el argumento, Zod recibe undefined: se avisa con un mensaje propio antes de validar el contenido
const texto = (falta: string) => z.string({ error: (issue) => (issue.input === undefined ? falta : 'Debe ser un texto') })
const argumentosSchema = z.object({
  edificio: texto('Falta --edificio "Nombre del edificio"').trim().min(3, 'El nombre del edificio debe tener al menos 3 caracteres').max(100),
  direccion: z.string().trim().max(200).optional(),
  'admin-nombre': texto('Falta --admin-nombre "Nombre y apellido"').trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  'admin-email': texto('Falta --admin-email correo@dominio.com').pipe(emailSchema),
})

/** 12 caracteres legibles (sin 0/O ni 1/l/I para dictarla sin confusiones), siempre con letras y números. */
function contrasenaTemporal(): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (;;) {
    const clave = [...randomBytes(12)].map((b) => alfabeto[b % alfabeto.length]).join('')
    if (/\d/.test(clave) && /[a-z]/i.test(clave)) return clave
  }
}

async function main() {
  const argumentos = argumentosSchema.safeParse(leerArgumentos())
  if (!argumentos.success) {
    console.error('Argumentos inválidos:\n' + argumentos.error.issues.map((i) => `  - ${i.path.join('.') || 'argumentos'}: ${i.message}`).join('\n'))
    process.exitCode = 1
    return
  }
  const { edificio: nombre, direccion, 'admin-nombre': adminNombre, 'admin-email': adminEmail } = argumentos.data

  if (await bd.usuario.findUnique({ where: { email: adminEmail }, select: { id: true } })) {
    console.error(`Ya existe un usuario con el correo ${adminEmail}. Usa otro correo.`)
    process.exitCode = 1
    return
  }

  const existente = await bd.edificio.findFirst({ where: { nombre }, select: { id: true } })
  const edificio = existente ?? (await bd.edificio.create({ data: { nombre, direccion: direccion ?? null }, select: { id: true } }))
  const password = contrasenaTemporal()
  await bd.usuario.create({
    data: { nombre: adminNombre, email: adminEmail, rol: 'administrador', edificioId: edificio.id, passwordHash: await hashPassword(password) },
  })

  console.log(`
Edificio del piloto ${existente ? '(ya existía)' : 'creado'}: ${nombre}
  id: ${edificio.id}

Administrador creado: ${adminNombre} <${adminEmail}>
  Contraseña temporal: ${password}

Pásale la contraseña en persona o por un canal privado (no queda guardada en ningún lado).
Siguiente paso: que entre a la app, cambie su contraseña y cree las cuentas de residentes y técnicos.
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => bd.$disconnect())
