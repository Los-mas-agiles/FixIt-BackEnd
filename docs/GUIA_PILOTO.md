# Guía del piloto (Fase 7)

Piloto de **2 semanas** con participantes de los 3 roles (residente, mantenimiento y administrador). Sirve para validar los Objetivos 2, 3 y 4 del TF y la hipótesis de valor de la sección 2.5. Lo conduce el PO/QA.

## 1. Antes de empezar (1 o 2 días antes)

**Mínimo de participantes:** 1 administrador, 1 o 2 técnicos y 3 a 5 residentes. El Objetivo 3 pide al menos 3 usuarios con los 3 roles cubiertos.

1. **Crear el edificio del piloto y su administrador.** Se hace desde el backend, con el `.env` configurado:
   ```bash
   npm run piloto:crear -- --edificio "Residencial Las Palmeras" --direccion "Av. Las Palmeras 321, Surco" --admin-nombre "Rosa Díaz" --admin-email rosa.diaz@correo.com
   ```
   El script muestra una **contraseña temporal una sola vez**. Pásala por un canal privado. El piloto usa un edificio propio para que sus KPIs no se mezclen con los datos de demo.
2. **El administrador entra a la app**, cambia su contraseña y crea las cuentas de residentes y técnicos en **Usuarios**. Cada persona recibe su contraseña inicial por un canal privado y luego la cambia.
3. **Cada participante, en su celular:**
   - Abre la app.
   - La instala en la pantalla de inicio: en Android, "Instalar app"; en iPhone, Compartir → "Agregar a inicio".
   - Activa las notificaciones desde la campanita. En iPhone, solo funcionan con la app instalada.
4. **Revisar que todo esté arriba:** `https://fix-it-back-end.vercel.app/api/health/db` debe responder `{"ok":true,"db":"up"}`.
5. **Día de demo o de presentación:** conviene activar la facturación de Gemini ese día para evitar la saturación del nivel gratuito (ver `docs/EVALUACION_IA.md`). Groq queda como respaldo automático.

## 2. Durante el piloto

**Regla del piloto:** todo reclamo de mantenimiento se reporta por FixIt. El administrador anota **cuántos reclamos siguen llegando por WhatsApp**, porque ese número mide la adopción (meta: 70 % por FixIt).

| Cuándo | Quién | Qué revisar |
|---|---|---|
| Todos los días | Administrador | El tablero: asignar técnico a las pendientes y revisar las marcadas como provisionales (la IA no respondió) |
| Todos los días | Administrador | Anotar los reclamos que llegaron por WhatsApp |
| Día por medio | PO/QA | El panel de indicadores: el cycle time de prioridad alta frente a la meta de 48 h y si la franja de pendientes del CFD se ensancha |
| Ante un error | Cualquiera | Captura de pantalla, qué se hizo y la hora. Se registra como issue en GitHub con la etiqueta `piloto` |
| Fin de la semana 1 | Equipo | Retrospectiva corta: qué está costando, qué ajustar (evidencia para el Capítulo VI) |

**Gestión de cuentas:**
- Alguien olvidó su contraseña: el administrador le asigna una temporal con `PATCH /usuarios/:id` y la persona la cambia con `PATCH /auth/password`.
- Alguien deja el piloto: el administrador lo desactiva con `PATCH /usuarios/:id` y `{ activo: false }`. Si era técnico, hay que reasignar sus incidencias en proceso.

**Si se sale de lo normal:** aplicar el plan de la sección 5.3 del TF (ver `docs/ESCENARIOS_CRITICOS.md`). Las señales de alerta son dos: que la franja de pendientes del CFD se ensanche más de un día, o que el lead time de prioridad alta supere unas 13 h.

## 3. Al cerrar

1. **Reporte de resultados**, con el conteo de WhatsApp que llevó el administrador:
   ```bash
   npm run piloto:reporte -- --edificio "Residencial Las Palmeras" --desde 2026-11-02 --hasta 2026-11-15 --whatsapp 3
   ```
   Escribe `docs/RESULTADOS_PILOTO.md` (Objetivos 2, 3 y 4, hipótesis de valor, KPIs, semana a semana y adopción) y el CFD en `docs/piloto/cfd-piloto.svg`.
2. **Respaldo de la BD y las fotos:**
   ```bash
   npm run db:respaldo -- --fotos
   ```
   Queda en `respaldos/<fecha-hora>/`. **Nunca se sube al repositorio**, que es público y el respaldo incluye los hashes de las contraseñas. Guárdalo en el Drive privado del equipo.
3. **Evidencias para el TF:**
   - Capturas del tablero y del panel del edificio del piloto (secciones 5.5 y 7.6).
   - Los resultados del reporte en la validación de cada funcionalidad (7.6).
   - Los aprendizajes y mejoras que salieron del piloto (tabla de aprendizaje ágil y Capítulo VI).
4. **Después de la entrega:** se puede pausar el proyecto de Supabase. Ojo: el plan gratuito también lo pausa solo tras 7 días sin uso.
