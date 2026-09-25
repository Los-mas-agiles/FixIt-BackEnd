# Evaluación de la clasificación con IA

Generado con `npm run ia:evaluar` el 2026-09-25 sobre 30 descripciones etiquetadas a mano (`scripts/dataset-clasificacion.json`), con el mismo prompt, esquema y timeout (8 s) que usa la API.

| Modelo | Respondió | Tipo correcto | Prioridad correcta | Ambos correctos | Detecta prioridad alta | Latencia p50 | Latencia p95 |
|---|---|---|---|---|---|---|---|
| `groq:openai/gpt-oss-20b` | 100 % | 100 % | 80 % | 80 % | 100 % | 543 ms | 838 ms |
| `groq:openai/gpt-oss-120b` | 100 % | 100 % | 77 % | 77 % | 91 % | 662 ms | 1089 ms |
| `gemini:gemini-3.5-flash-lite` | 100 % | 100 % | 97 % | 97 % | 100 % | 1692 ms | 1862 ms |

- **Respondió:** llamadas que devolvieron una clasificación válida dentro del timeout (el resto caería al modelo de respaldo o al fallback).
- **Detecta prioridad alta:** de las incidencias que realmente son de prioridad alta, cuántas marcó como alta (lo más importante para el Objetivo 2).
- La prioridad tiene una parte subjetiva: parte de las diferencias son casos límite, no errores claros.

### `groq:openai/gpt-oss-20b` — casos con diferencias (6)

| Descripción | Esperado | IA |
|---|---|---|
| El inodoro del baño de visitas no deja de correr agua desde ayer | plomeria / media | plomeria / baja |
| El desagüe de la ducha está lento, el agua tarda en irse | plomeria / baja | plomeria / media |
| Gotea un poco el caño del lavadero de la zona de lavandería común | plomeria / baja | plomeria / media |
| El foco del pasadizo del tercer piso está quemado | electricidad / baja | electricidad / media |
| No hay luz en el estacionamiento del sótano, está completamente oscuro | electricidad / media | electricidad / alta |
| La chapa de la reja del jardín está oxidada y cuesta abrirla | seguridad / baja | seguridad / alta |

### `groq:openai/gpt-oss-120b` — casos con diferencias (7)

| Descripción | Esperado | IA |
|---|---|---|
| El inodoro del baño de visitas no deja de correr agua desde ayer | plomeria / media | plomeria / alta |
| El desagüe de la ducha está lento, el agua tarda en irse | plomeria / baja | plomeria / media |
| Gotea un poco el caño del lavadero de la zona de lavandería común | plomeria / baja | plomeria / media |
| El foco del pasadizo del tercer piso está quemado | electricidad / baja | electricidad / alta |
| El botón del piso 5 del ascensor no se ilumina pero sí funciona | ascensor / baja | ascensor / media |
| La chapa de la reja del jardín está oxidada y cuesta abrirla | seguridad / baja | seguridad / media |
| Una rama grande del árbol del jardín está a punto de caer sobre los autos | otros / alta | otros / media |

### `gemini:gemini-3.5-flash-lite` — casos con diferencias (1)

| Descripción | Esperado | IA |
|---|---|---|
| La chapa de la reja del jardín está oxidada y cuesta abrirla | seguridad / baja | seguridad / media |

## Decisión del orden de modelos (medición del 2026-09-25, misma hora para los tres)

| Modelo | Prioridad correcta | Detecta prioridad alta | Latencia p50 | Disponibilidad |
|---|---|---|---|---|
| `gemini:gemini-3.5-flash-lite` | **97 %** | 100 % | 1.7 s | Variable según la hora (llegó a 503 en todos sus modelos) |
| `groq:openai/gpt-oss-20b` | 80 % | **100 %** | **0.5 s** | 100 % en esta medición |
| `groq:openai/gpt-oss-120b` | 77 % | 91 % | 0.7 s | 100 % en esta medición |

**Orden elegido:** `gemini:gemini-3.5-flash-lite` → `groq:openai/gpt-oss-20b` → `gemini:gemini-3.1-flash-lite`.

- **Gemini primero** por ser el más preciso en prioridad.
- **Groq 20b como respaldo**: 3 veces más rápido y no se le escapó ninguna incidencia de prioridad alta; sus diferencias son casi todas sobrestimar problemas menores (el lado seguro).
- `gpt-oss-120b` se descarta: más lento y menos preciso que el 20b.
- Con el límite de 4 s por modelo, si Gemini se satura o se cuelga, Groq siempre alcanza a responder dentro de los 8 s.

## Cómo se protege el Objetivo 4 (100 % clasificado sin intervención manual)

La **disponibilidad** de los niveles gratuitos varía según la hora (el 2026-09-25 Gemini llegó a responder 503 en todos sus modelos a la vez). Para que eso no afecte al Objetivo 4, la API tiene tres capas:

1. **Cadena de modelos** (`IA_MODELOS`, en orden): si uno está saturado (503), sin cuota (429), no responde a tiempo o responde algo inválido, se prueba el siguiente, dentro de un máximo total de 8 s.
2. **Proveedores independientes** (Groq y Gemini): la caída de uno no afecta al otro; una API key inválida solo descarta los modelos de ese proveedor.
3. **Reclasificación automática en segundo plano**: si ninguno respondió, la incidencia se guarda con el fallback (`otros` / `media`, `clasificadoPor: fallback`) para no hacer esperar al residente, y la API la vuelve a enviar a la IA automáticamente (al crear otras incidencias o al consultar el tablero, como mucho una vez por minuto). Las que un admin corrigió a mano nunca se tocan.

Para medir el Objetivo 4 en el piloto: `% clasificado por IA = incidencias con tipoIA registrado / total de incidencias`.
