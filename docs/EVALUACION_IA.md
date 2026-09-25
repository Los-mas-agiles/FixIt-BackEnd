# Evaluación de la clasificación con IA

Generado con `npm run ia:evaluar` el 2026-09-25 sobre 30 descripciones etiquetadas a mano (`scripts/dataset-clasificacion.json`), con el mismo prompt, esquema y timeout (8 s) que usa la API.

| Modelo | Respondió | Tipo correcto | Prioridad correcta | Ambos correctos | Detecta prioridad alta | Latencia p50 | Latencia p95 |
|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 90 % | 100 % | 96 % | 96 % | 91 % | 1562 ms | 6285 ms |

- **Respondió:** llamadas que devolvieron una clasificación válida dentro del timeout (el resto caería al modelo de respaldo o al fallback).
- **Detecta prioridad alta:** de las incidencias que realmente son de prioridad alta, cuántas marcó como alta (lo más importante para el Objetivo 2).
- La prioridad tiene una parte subjetiva: parte de las diferencias son casos límite, no errores claros.

### `gemini-3.5-flash-lite` — casos con diferencias (4)

| Descripción | Esperado | IA |
|---|---|---|
| Las luces de la escalera parpadean toda la noche | electricidad / media | error (timeout) |
| El ascensor se quedó detenido entre el piso 2 y 3 con una señora adentro | ascensor / alta | error (timeout) |
| El ascensor hace un ruido raro al llegar al piso 7 | ascensor / media | error (timeout) |
| Las bolsas de basura se acumulan en el cuarto de basura desde hace tres días y huele muy mal | limpieza / media | limpieza / alta |

## Cómo se protege el Objetivo 4 (100 % clasificado sin intervención manual)

La **calidad** de la IA es estable (tipo correcto en el 100 % de lo respondido), pero la **disponibilidad** del nivel gratuito de Gemini varía según la hora: en mediciones del 2026-09-25 el modelo principal respondió entre el 77 % y el 90 % de las llamadas dentro del timeout. Para que eso no afecte al Objetivo 4, la API tiene tres capas:

1. **Modelo principal** (`GEMINI_MODEL`): se usa siempre primero.
2. **Modelo de respaldo** (`GEMINI_MODEL_RESPALDO`): si el principal está saturado (503), sin cuota (429), no responde a tiempo o responde algo inválido.
3. **Reclasificación automática en segundo plano**: si ninguno respondió, la incidencia se guarda con el fallback (`otros` / `media`, `clasificadoPor: fallback`) para no hacer esperar al residente, y la API la vuelve a enviar a la IA automáticamente (al crear otras incidencias o al consultar el tablero, como mucho una vez por minuto). Las que un admin corrigió a mano nunca se tocan.

Para medir el Objetivo 4 en el piloto: `% clasificado por IA = incidencias con tipoIA registrado / total de incidencias`.
