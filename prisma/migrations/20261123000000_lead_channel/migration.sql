-- CreateEnum
CREATE TYPE "lead_channel" AS ENUM ('form', 'agent');

-- Every lead filed before channels existed counts as a form lead. The default
-- only backfills those rows: from here on the server always sets the channel.
ALTER TABLE "leads" ADD COLUMN "channel" "lead_channel" NOT NULL DEFAULT 'form';
ALTER TABLE "leads" ALTER COLUMN "channel" DROP DEFAULT;

-- CreateTable
CREATE TABLE "lead_submissions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "channel" "lead_channel" NOT NULL,
    "values" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_submissions_lead_id_created_at_idx" ON "lead_submissions"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- whyLead follows the channel now: an agent lead must have it and a form lead
-- never keeps it, so the field itself is no longer required.
UPDATE "field_definitions"
SET "is_required" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "collection" = 'lead' AND "key" = 'whyLead' AND "is_system";

-- email and phone become system fields, because duplicates are matched on them.
-- A custom field that already uses the key keeps its values and becomes the system one.
UPDATE "field_definitions"
SET "is_system" = true, "updated_at" = CURRENT_TIMESTAMP
WHERE "collection" = 'lead' AND "key" IN ('email', 'phone') AND NOT "is_system";

-- Every other organization gets email right after receivedAt, then phone after
-- email, with later fields moved down one place each time.
UPDATE "field_definitions" AS f
SET "position" = f."position" + 1
FROM "field_definitions" AS anchor
WHERE anchor."collection" = 'lead' AND anchor."key" = 'receivedAt'
  AND f."organization_id" = anchor."organization_id"
  AND f."collection" = 'lead'
  AND f."position" > anchor."position"
  AND NOT EXISTS (
    SELECT 1 FROM "field_definitions" AS e
    WHERE e."organization_id" = anchor."organization_id" AND e."collection" = 'lead' AND e."key" = 'email'
  );

INSERT INTO "field_definitions" ("id", "organization_id", "collection", "key", "label", "type", "options", "is_required", "is_read_only", "is_system", "position", "updated_at")
SELECT gen_random_uuid()::text, anchor."organization_id", 'lead', 'email', 'Email', 'text', ARRAY[]::TEXT[], false, false, true, anchor."position" + 1, CURRENT_TIMESTAMP
FROM "field_definitions" AS anchor
WHERE anchor."collection" = 'lead' AND anchor."key" = 'receivedAt'
  AND NOT EXISTS (
    SELECT 1 FROM "field_definitions" AS e
    WHERE e."organization_id" = anchor."organization_id" AND e."collection" = 'lead' AND e."key" = 'email'
  );

UPDATE "field_definitions" AS f
SET "position" = f."position" + 1
FROM "field_definitions" AS anchor
WHERE anchor."collection" = 'lead' AND anchor."key" = 'email'
  AND f."organization_id" = anchor."organization_id"
  AND f."collection" = 'lead'
  AND f."position" > anchor."position"
  AND NOT EXISTS (
    SELECT 1 FROM "field_definitions" AS p
    WHERE p."organization_id" = anchor."organization_id" AND p."collection" = 'lead' AND p."key" = 'phone'
  );

INSERT INTO "field_definitions" ("id", "organization_id", "collection", "key", "label", "type", "options", "is_required", "is_read_only", "is_system", "position", "updated_at")
SELECT gen_random_uuid()::text, anchor."organization_id", 'lead', 'phone', 'Phone', 'text', ARRAY[]::TEXT[], false, false, true, anchor."position" + 1, CURRENT_TIMESTAMP
FROM "field_definitions" AS anchor
WHERE anchor."collection" = 'lead' AND anchor."key" = 'email'
  AND NOT EXISTS (
    SELECT 1 FROM "field_definitions" AS p
    WHERE p."organization_id" = anchor."organization_id" AND p."collection" = 'lead' AND p."key" = 'phone'
  );

-- Website forms used to put boilerplate in whyLead, such as "Contact form on
-- https://... Reply to ...". The reply-to part is often the only copy of how to
-- reach the person, so the email and phone in it move to their fields first. A
-- lead that already holds an email or phone keeps it.
INSERT INTO "lead_values" ("lead_id", "field_id", "value")
SELECT boilerplate."lead_id", email."id", to_jsonb(m."match"[1])
FROM (
  SELECT v."lead_id", l."organization_id", v."value" #>> '{}' AS "text"
  FROM "lead_values" AS v
  JOIN "field_definitions" AS w ON w."id" = v."field_id" AND w."collection" = 'lead' AND w."key" = 'whyLead'
  JOIN "leads" AS l ON l."id" = v."lead_id"
  WHERE btrim(v."value" #>> '{}') ILIKE 'contact form%'
) AS boilerplate
JOIN "field_definitions" AS email
  ON email."organization_id" = boilerplate."organization_id" AND email."collection" = 'lead' AND email."key" = 'email'
CROSS JOIN LATERAL regexp_match(boilerplate."text", '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') AS m("match")
WHERE m."match" IS NOT NULL
ON CONFLICT ("lead_id", "field_id") DO NOTHING;

-- A phone is only read after "Reply to", with any email taken out first, so the
-- digits in an address or a URL never pass for one.
INSERT INTO "lead_values" ("lead_id", "field_id", "value")
SELECT boilerplate."lead_id", phone."id", to_jsonb(btrim(m."match"[1]))
FROM (
  SELECT v."lead_id", l."organization_id",
    regexp_replace(
      (regexp_match(v."value" #>> '{}', 'reply to(.*)$', 'i'))[1],
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', ' ', 'g'
    ) AS "reply"
  FROM "lead_values" AS v
  JOIN "field_definitions" AS w ON w."id" = v."field_id" AND w."collection" = 'lead' AND w."key" = 'whyLead'
  JOIN "leads" AS l ON l."id" = v."lead_id"
  WHERE btrim(v."value" #>> '{}') ILIKE 'contact form%'
) AS boilerplate
JOIN "field_definitions" AS phone
  ON phone."organization_id" = boilerplate."organization_id" AND phone."collection" = 'lead' AND phone."key" = 'phone'
CROSS JOIN LATERAL regexp_match(boilerplate."reply", '\+?[0-9][0-9 ().-]{5,}[0-9]') AS m("match")
WHERE m."match" IS NOT NULL
  AND length(regexp_replace(m."match"[1], '[^0-9]', '', 'g')) >= 7
ON CONFLICT ("lead_id", "field_id") DO NOTHING;

-- Then the boilerplate goes. A form lead never keeps a reason, and any other
-- text in whyLead stays as it is.
DELETE FROM "lead_values" AS v
USING "field_definitions" AS w
WHERE w."id" = v."field_id" AND w."collection" = 'lead' AND w."key" = 'whyLead'
  AND btrim(v."value" #>> '{}') ILIKE 'contact form%';
