# FixIt — BackEnd

API REST de **FixIt**, plataforma web para gestionar incidencias de mantenimiento en edificios residenciales: el residente reporta con foto, la IA clasifica tipo y prioridad, el personal de mantenimiento trabaja las incidencias en un tablero Kanban y el administrador mide cycle time, lead time, WIP y throughput.

Proyecto del curso de **Ágiles (1ASI570)** — UPC, Ingeniería de Software, 2026.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/CONTRATO_API.md`](docs/CONTRATO_API.md) | **Contrato con el frontend**: tipos, endpoints, errores y cuentas de demo. Fuente de verdad. |
| [`docs/GUIA_BACKEND.md`](docs/GUIA_BACKEND.md) | Guía técnica: arquitectura, modelo de datos, reglas de negocio, IA, KPIs |
| [`docs/PLAN_FASES.md`](docs/PLAN_FASES.md) | Fases de desarrollo, convenciones y Definition of Done |

## Stack

- **Node.js 24 (LTS)** + **TypeScript** + **Express 5**
- **Prisma** sobre **PostgreSQL** (Supabase)
- **Supabase Storage** para las fotos
- **Gemini API** para la clasificación automática
- **Web Push** (VAPID) para notificaciones
- **Zod** (validación), **JWT** + **bcrypt** (autenticación)
- **Vitest** + **Supertest** (tests)
- Despliegue en **Vercel**

## Requisitos

- Node.js 24 (LTS) o superior
- Un proyecto de Supabase (Free) con un bucket privado `fotos`
- Una API key de Gemini (Google AI Studio, nivel gratuito)

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completar los valores (ver abajo)
npx prisma migrate dev      # crea las tablas
npx prisma db seed          # edificios y cuentas de demo
npm run dev                 # http://localhost:3000/api/health
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Supabase, pooler en modo transacción (puerto 6543) |
| `DIRECT_URL` | Supabase, session pooler (puerto 5432), solo para migraciones |
| `SUPABASE_URL` | URL del proyecto de Supabase |
| `SUPABASE_SECRET_KEY` | Secret key de Supabase (`sb_secret_...`). **Secreta: nunca en el frontend ni en git** |
| `SUPABASE_BUCKET` | Bucket de fotos (`fotos`) |
| `JWT_SECRET` | Cadena larga y aleatoria para firmar tokens |
| `JWT_EXPIRES_IN` | Duración del token (`7d`) |
| `GEMINI_API_KEY` | API key de Gemini |
| `GEMINI_MODEL` | Modelo de Gemini a usar |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Claves de Web Push (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | `mailto:` de contacto para Web Push |
| `WIP_LIMITE_TECNICO` | Máximo de incidencias en proceso por técnico (`3`) |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API en modo desarrollo con recarga automática |
| `npm run build` | Compila TypeScript |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests con Vitest |
| `npx prisma migrate dev` | Crea/aplica migraciones en local |
| `npx prisma db seed` | Carga datos de demo |
| `npx prisma studio` | Explorador visual de la base de datos |

## Estructura

```
src/
  index.ts          # app Express (entrypoint de Vercel)
  dev.ts            # servidor local
  config/           # variables de entorno validadas
  lib/              # prisma, supabase, gemini, push, errores
  middleware/       # auth, roles, manejo de errores
  modules/          # auth, usuarios, incidencias, kpis, notificaciones
  domain/           # reglas de negocio puras (transiciones, KPIs, clasificación)
  types/            # tipos compartidos con el frontend
prisma/             # schema.prisma y seed.ts
tests/
docs/
```

## Cuentas de demo

Todas con la contraseña `FixIt2026!` — ver la tabla completa en [`docs/CONTRATO_API.md`](docs/CONTRATO_API.md#3-cuentas-de-demo-las-crea-el-seed-del-backend).

## Estado por fases

- [ ] Fase 0 — Cimientos (proyecto, BD, seed, CI, deploy)
- [ ] Fase 1 — HU6 Login con roles
- [ ] Fase 2 — HU1 Reporte de incidencias con foto
- [ ] Fase 3 — HU3 Tablero Kanban (transiciones, asignación, límite de WIP)
- [ ] Fase 4 — HU2 Clasificación con IA
- [ ] Fase 5 — HU4 Notificaciones
- [ ] Fase 6 — HU5 KPIs y CFD
- [ ] Fase 7 — Piloto y cierre

## Cómo contribuir

1. Rama desde `main`: `feature/HU<n>-nombre-corto` o `fix/descripcion-corta`.
2. Commits con prefijo: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
3. Pull Request pequeño, con la HU relacionada y un ejemplo de request/response. CI en verde y 1 aprobación para hacer merge.
4. Si cambia un endpoint: **actualizar primero `docs/CONTRATO_API.md`** y avisar al equipo de frontend.

## Equipo

| Integrante | Rol |
|---|---|
| Edery Renzo Abanto Vicente | Backend, IA y despliegues · Product Owner · QA |
| George Arturo Aliaga Pimentel | Frontend · Scrum Master |
| Jefrey Martin Sanchez Ignacio | Frontend |

Frontend: [FixIt-FrontEnd](https://github.com/Los-mas-agiles/FixIt-FrontEnd)
