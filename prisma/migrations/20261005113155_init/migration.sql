-- ServiceLog initial schema — PostgreSQL.
--
-- Migration boundary: the previous migration folder (20261004031452_init) was
-- SQLite DDL (DATETIME / INTEGER column types) and cannot run on PostgreSQL, so
-- it was replaced by this single PostgreSQL init rather than layered on top.
-- The SQLite database `dev.db` that folder created is retained locally as an
-- untracked archive; it held only the four demo rows that `npm run db:seed`
-- reproduces identically.
--
-- The models, column names, enum values, ids, and indexes are unchanged from the
-- SQLite schema — only the provider changed. Differences are the type mappings
-- Prisma applies for PostgreSQL: String -> TEXT, Int -> INTEGER,
-- DateTime -> TIMESTAMP(3), and ServiceType as a native PostgreSQL enum whose
-- wire values are identical to the strings the API already used.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('OIL_CHANGE', 'BRAKE', 'CHAIN', 'TIRE', 'BATTERY', 'GENERAL_SERVICE', 'OTHER');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currentOdometer" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_records_vehicleId_date_idx" ON "service_records"("vehicleId", "date" DESC);

-- CreateIndex
CREATE INDEX "service_records_vehicleId_type_idx" ON "service_records"("vehicleId", "type");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;