/*
  Warnings:

  - You are about to drop the column `public_key_hash` on the `blog_access` table. All the data in the column will be lost.
  - You are about to drop the column `public_key_last4` on the `blog_access` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "blog_access" DROP COLUMN "public_key_hash",
DROP COLUMN "public_key_last4";

-- CreateTable
CREATE TABLE "integration_keys" (
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_keys_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_keys_key_key" ON "integration_keys"("key");

-- AddForeignKey
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
