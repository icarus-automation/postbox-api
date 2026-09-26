-- CreateEnum
CREATE TYPE "content_kind" AS ENUM ('post', 'page');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "alt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "content_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "meta_title" TEXT NOT NULL DEFAULT '',
    "meta_description" TEXT NOT NULL DEFAULT '',
    "og_image_id" TEXT,
    "cover_image_id" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "blocks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_access" (
    "organization_id" TEXT NOT NULL,
    "public_key_hash" TEXT,
    "public_key_last4" TEXT,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_access_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_organization_id_idx" ON "media"("organization_id");

-- CreateIndex
CREATE INDEX "content_entries_organization_id_status_kind_updated_at_idx" ON "content_entries"("organization_id", "status", "kind", "updated_at");

-- CreateIndex
CREATE INDEX "content_entries_organization_id_status_published_at_idx" ON "content_entries"("organization_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_entries_organization_id_slug_key" ON "content_entries"("organization_id", "slug");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_og_image_id_fkey" FOREIGN KEY ("og_image_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_cover_image_id_fkey" FOREIGN KEY ("cover_image_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_access" ADD CONSTRAINT "content_access_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
