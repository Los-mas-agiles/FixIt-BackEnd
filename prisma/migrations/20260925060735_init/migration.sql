-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('residente', 'mantenimiento', 'administrador');

-- CreateEnum
CREATE TYPE "TipoIncidencia" AS ENUM ('plomeria', 'electricidad', 'ascensor', 'limpieza', 'seguridad', 'otros');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('alta', 'media', 'baja');

-- CreateEnum
CREATE TYPE "EstadoIncidencia" AS ENUM ('pendiente', 'en_proceso', 'resuelto');

-- CreateEnum
CREATE TYPE "ClasificadoPor" AS ENUM ('ia', 'fallback', 'manual');

-- CreateTable
CREATE TABLE "edificios" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edificios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "edificioId" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidencias" (
    "id" UUID NOT NULL,
    "edificioId" UUID NOT NULL,
    "residenteId" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fotoPath" TEXT,
    "tipo" "TipoIncidencia" NOT NULL,
    "prioridad" "Prioridad" NOT NULL,
    "clasificadoPor" "ClasificadoPor" NOT NULL,
    "tipoIA" "TipoIncidencia",
    "prioridadIA" "Prioridad",
    "estado" "EstadoIncidencia" NOT NULL DEFAULT 'pendiente',
    "asignadoAId" UUID,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaInicioProceso" TIMESTAMP(3),
    "fechaResolucion" TIMESTAMP(3),

    CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estados" (
    "id" UUID NOT NULL,
    "incidenciaId" UUID NOT NULL,
    "estadoAnterior" "EstadoIncidencia",
    "estadoNuevo" "EstadoIncidencia" NOT NULL,
    "usuarioId" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "incidenciaId" UUID NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_edificioId_rol_idx" ON "usuarios"("edificioId", "rol");

-- CreateIndex
CREATE INDEX "incidencias_edificioId_estado_idx" ON "incidencias"("edificioId", "estado");

-- CreateIndex
CREATE INDEX "incidencias_residenteId_idx" ON "incidencias"("residenteId");

-- CreateIndex
CREATE INDEX "incidencias_asignadoAId_estado_idx" ON "incidencias"("asignadoAId", "estado");

-- CreateIndex
CREATE INDEX "historial_estados_incidenciaId_idx" ON "historial_estados"("incidenciaId");

-- CreateIndex
CREATE INDEX "historial_estados_fecha_idx" ON "historial_estados"("fecha");

-- CreateIndex
CREATE INDEX "notificaciones_usuarioId_leida_idx" ON "notificaciones"("usuarioId", "leida");

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_edificioId_fkey" FOREIGN KEY ("edificioId") REFERENCES "edificios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_edificioId_fkey" FOREIGN KEY ("edificioId") REFERENCES "edificios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estados" ADD CONSTRAINT "historial_estados_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "incidencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estados" ADD CONSTRAINT "historial_estados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "incidencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
