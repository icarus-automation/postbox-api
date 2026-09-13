-- CreateEnum
CREATE TYPE "field_collection" AS ENUM ('lead');

-- CreateEnum
CREATE TYPE "field_type" AS ENUM ('text', 'long_text', 'number', 'select', 'url', 'date', 'datetime');

-- DropIndex
DROP INDEX "leads_organization_id_status_idx";

-- Lead attributes move to field values with no backfill, so existing leads are
-- cleared rather than left behind with nothing in them.
DELETE FROM "leads";

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "candidate_handle",
DROP COLUMN "candidate_name",
DROP COLUMN "draft_opener",
DROP COLUMN "product",
DROP COLUMN "signal",
DROP COLUMN "source_group",
DROP COLUMN "source_url",
DROP COLUMN "status",
DROP COLUMN "why_lead";

-- DropEnum
DROP TYPE "lead_status";

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "collection" "field_collection" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "field_type" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_read_only" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_values" (
    "lead_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "lead_values_pkey" PRIMARY KEY ("lead_id","field_id")
);

-- CreateIndex
CREATE INDEX "field_definitions_organization_id_collection_position_idx" ON "field_definitions"("organization_id", "collection", "position");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_organization_id_collection_key_key" ON "field_definitions"("organization_id", "collection", "key");

-- CreateIndex
CREATE INDEX "lead_values_field_id_idx" ON "lead_values"("field_id");

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_values" ADD CONSTRAINT "lead_values_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_values" ADD CONSTRAINT "lead_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
