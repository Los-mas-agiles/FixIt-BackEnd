# Plan de fases de desarrollo — FixIt

Plan maestro del MVP. Las fases siguen la priorización **MoSCoW + WSJF** del Trabajo Final (sección 1.8) y dejan libres las **2 últimas semanas del ciclo para el piloto** que exige el Objetivo 2.

## Equipo de desarrollo

| Área | Responsables | Repositorio |
|---|---|---|
| Frontend | George Aliaga, Jefrey Sanchez | [FixIt-FrontEnd](https://github.com/Los-mas-agiles/FixIt-FrontEnd) |
| Backend + IA + despliegues | Edery Abanto | [FixIt-BackEnd](https://github.com/Los-mas-agiles/FixIt-BackEnd) |
| Scrum Master (tablero, dailys, KPIs del equipo) | George Aliaga | Trello |
| Product Owner + QA | Edery Abanto | Trello / GitHub |

## Arquitectura en una línea

```
Navegador (Vue 3 PWA, Vercel)  ──HTTPS/JSON──▶  API Express (Vercel)  ──▶  PostgreSQL + Storage (Supabase)
                                                        └──▶  Gemini API (clasificación)   └──▶  Web Push
```

- El frontend **nunca** habla con la base de datos ni con Supabase directamente: todo pasa por la API.
- El acuerdo entre ambos lados es [`CONTRATO_API.md`](CONTRATO_API.md).

## Regla de sincronización entre front y back

**El backend va una fase adelante.** Cuando el frontend empieza la fase N, los endpoints de la fase N ya están desplegados en la API de desarrollo con datos de prueba. Así el frontend nunca espera.

Si algún endpoint se retrasa, el frontend usa datos simulados (un archivo `mocks/` con respuestas de ejemplo que respetan el contrato) y lo cambia por la llamada real después.

---

## Fases

La duración es orientativa (semanas de trabajo). Las fechas reales se fijan cuando se conozca la entrega del TF: **el piloto (Fase 7) debe empezar 2 semanas antes de la entrega**, y todo lo demás se calcula hacia atrás desde ahí.

### Fase 0 — Cimientos (1 semana)

| Backend | Frontend |
|---|---|
| Proyecto Express + TS + Prisma + Zod | Proyecto Vite + Vue 3 + TS + Tailwind v4 + Pinia + Router |
| Proyecto Supabase: BD + bucket `fotos` (privado) | Layout base (header, navegación por rol), página 404 |
| Esquema Prisma + primera migración | Cliente HTTP (`src/api/client.ts`) con manejo de errores del contrato |
| Seed con los 2 edificios y las cuentas de demo | Tipos de `CONTRATO_API.md` copiados en `src/types/models.ts` |
| `GET /health` desplegado en Vercel | "Hola mundo" desplegado en Vercel |
| CI (GitHub Actions): lint + typecheck + tests | CI (GitHub Actions): lint + typecheck + tests |

**Terminada cuando:** los dos proyectos se despliegan solos al hacer merge a `main`, y el frontend desplegado muestra el resultado de `GET /health`.

### Fase 1 — HU6: Login con roles (1 semana) · Must

| Backend | Frontend |
|---|---|
| `POST /auth/login`, `GET /auth/me` (JWT + bcrypt) | `LoginView` |
| Middleware de autenticación, de rol y de edificio | Store de sesión (Pinia) + token en `localStorage` |
| `GET /usuarios`, `POST /usuarios` | Guards del router por rol; redirección según el rol al entrar |
| Tests: aislamiento entre edificios | Cerrar sesión automáticamente ante `401` |

**Terminada cuando:** cada cuenta de demo entra y cae en su pantalla; un residente que escribe a mano la URL de admin es redirigido.

### Fase 2 — HU1: Reportar incidencia (1–2 semanas) · Must

| Backend | Frontend |
|---|---|
| `POST /incidencias` (multipart) con subida a Supabase Storage | `NuevaIncidenciaView`: descripción + foto (cámara o galería) |
| URL firmada para leer la foto | Compresión de la foto en el navegador antes de enviar |
| `GET /incidencias`, `GET /incidencias/:id` | `MisIncidenciasView` (lista) + `IncidenciaDetalleView` |
| Clasificación temporal: siempre fallback (`otros`/`media`) hasta la Fase 4 | Estados de carga, error y lista vacía |

**Terminada cuando:** desde un celular real se reporta una incidencia con foto y aparece en la lista del residente.

### Fase 3 — HU3: Tablero Kanban (2 semanas) · Must

| Backend | Frontend |
|---|---|
| `PATCH /incidencias/:id/estado` con reglas de transición | `KanbanView`: 3 columnas (Pendiente / En proceso / Resuelto) |
| Tabla `historial_estados` (una fila por cambio) | Botón "Tomar" / "Marcar resuelta" en cada tarjeta |
| Límite de WIP por técnico (3) | Filtro "Mis incidencias" para el técnico |
| `PATCH /incidencias/:id/asignacion` | Admin: asignar técnico desde la tarjeta |
| Tests de todas las transiciones válidas e inválidas | Mostrar el mensaje de `LIMITE_WIP` y `TRANSICION_INVALIDA` |

**Terminada cuando:** una incidencia recorre Pendiente → En proceso → Resuelto con dos cuentas distintas, y el cuarto intento de tomar una incidencia muestra el aviso de WIP.

### Fase 4 — HU2: Clasificación con IA (1 semana) · Must

| Backend | Frontend |
|---|---|
| Cliente Gemini con salida JSON, timeout de 8 s y fallback | Badges de tipo y prioridad en tarjetas y detalle (colores por prioridad) |
| `PATCH /incidencias/:id/clasificacion` (corrección manual del admin) | Admin: editar tipo/prioridad desde el detalle |
| Set de ~30 descripciones de prueba para medir precisión | Indicador discreto de "clasificado por IA / manual" |

**Terminada cuando:** el 100 % de incidencias nuevas sale con tipo y prioridad (Objetivo 4) y el set de prueba da una precisión medida y documentada.

### 🏁 Hito — MVP núcleo

Demo interna del flujo completo con las 3 cuentas. Checklist de Definition of Done de las 4 historias Must. Capturas para el TF (sección 7.6).

### Fase 5 — HU4: Notificaciones (1–2 semanas) · Should, pero es parte del Objetivo 1

| Backend | Frontend |
|---|---|
| Tabla `notificaciones` + endpoints | PWA instalable (`vite-plugin-pwa`, manifest, íconos) |
| Web Push con VAPID (`web-push`) al cambiar el estado | Service worker que muestra el push y abre la incidencia al tocarlo |
| Guardar/borrar suscripciones push | Botón "Activar notificaciones" + campanita con polling cada 30 s |

**Terminada cuando:** el residente recibe la notificación en el celular (Android, y iPhone con la app instalada) cuando el técnico cambia el estado.

### Fase 6 — HU5: Panel de KPIs (1–2 semanas) · Should

| Backend | Frontend |
|---|---|
| `GET /kpis` (cycle time, lead time, WIP, throughput, precisión IA) | `DashboardView`: tarjetas de KPIs con filtro de prioridad y periodo |
| `GET /kpis/cfd` desde `historial_estados` | Gráfico CFD (Cumulative Flow Diagram) |
| Tests del cálculo con datos conocidos | Resaltar el Objetivo 2: cycle time de prioridad alta vs. meta de 48 h |

**Terminada cuando:** los números del panel coinciden con un cálculo manual sobre la base de datos.

> **¿Por qué HU4 va antes que HU5?** El Objetivo 1 lista la notificación como funcionalidad núcleo del MVP. Los KPIs pueden terminarse durante el piloto, porque `historial_estados` guarda los datos desde el primer día.

### Fase 7 — Piloto y cierre (2 semanas + margen)

| Backend | Frontend | PO / QA (Edery) |
|---|---|---|
| Corrección de bugs del piloto | Pulido visual y responsive | Conducir el piloto de 2 semanas con participantes de los 3 roles |
| Script con los 3 escenarios críticos del TF 5.2 (lluvia fuerte, técnico ausente, falla eléctrica) | Accesibilidad básica (contraste, tamaños táctiles) | Recoger métricas del panel para los Objetivos 2 y 4 |
| Respaldo de la BD al final | — | Capturas, CFD y evidencias para el TF (caps. 5–7) |

---

## Convenciones comunes (ambos repos)

- **Ramas:** `main` protegida (solo entra por Pull Request con CI en verde y 1 aprobación). Trabajo en `feature/HU<n>-nombre-corto` (ej. `feature/HU1-formulario-reporte`). Arreglos: `fix/descripcion-corta`.
- **Commits:** `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. En español y en presente: `feat: agrega formulario de reporte`.
- **Pull Requests:** pequeños, una historia o parte de historia por PR. En la descripción: HU relacionada, qué cambia, captura de pantalla (frontend) o ejemplo de request/response (backend). Cada PR genera un deploy de preview en Vercel: pegar el link.
- **Trello ↔ GitHub:** cada tarjeta de Trello enlaza a su PR, y cada PR menciona la tarjeta. Esto es evidencia para el informe.
- **Issues y milestones:** un milestone por fase (Fase 0 … Fase 7) y un issue por tarea.

## Definition of Done (general)

Una tarea está terminada cuando:

1. Compila sin errores y pasa lint, typecheck y tests en CI.
2. Maneja los estados de carga y error (frontend) o devuelve errores con el formato del contrato (backend).
3. Otro integrante revisó y aprobó el PR.
4. Está desplegada y probada en el entorno de preview (frontend: escritorio **y** celular).
5. Si tocó la API: `CONTRATO_API.md` está actualizado y el equipo avisado.

## Costos

| Servicio | Plan | Costo |
|---|---|---|
| Vercel (frontend + API) | Hobby | $0 |
| Supabase (PostgreSQL + Storage) | Free: 500 MB de BD, 1 GB de archivos | $0 |
| Gemini API | Nivel gratuito | $0 |
| Web Push | Estándar del navegador | $0 |

⚠️ Supabase Free **pausa el proyecto tras 7 días sin uso**. Antes de cada presentación: entrar al panel de Supabase y reactivarlo, o hacer un par de requests a la API un día antes. Si en una demo importante se necesita más capacidad, se puede pagar un mes y bajar de plan después.
