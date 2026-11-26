-- Backfill heading-block anchors from the current text. The slug matches
-- github-slugger for ASCII punctuation and keeps every other letter. A repeat
-- inside one post is not suffixed here: the read path adds -1, -2.
-- Idempotent: a heading that already has an anchor is left alone.

CREATE FUNCTION pb_github_slug(input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  source text := lower(COALESCE(input, ''));
  i int;
  ch text;
  code int;
  out text := '';
BEGIN
  FOR i IN 1..char_length(source) LOOP
    ch := substr(source, i, 1);
    code := ascii(ch);
    IF code > 127 THEN
      out := out || ch;
    ELSIF code >= 32 AND ch ~ '^[a-z0-9 _-]$' THEN
      out := out || ch;
    END IF;
  END LOOP;
  out := replace(out, ' ', '-');
  IF out = '' THEN
    RETURN 'section';
  END IF;
  RETURN out;
END;
$$;

CREATE FUNCTION pb_backfill_heading_anchors(blocks jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  block jsonb;
BEGIN
  IF jsonb_typeof(blocks) IS DISTINCT FROM 'array' THEN
    RETURN blocks;
  END IF;
  FOR block IN SELECT value FROM jsonb_array_elements(blocks) LOOP
    IF jsonb_typeof(block) = 'object'
       AND block->>'kind' = 'heading'
       AND (
         NOT (block ? 'anchor')
         OR jsonb_typeof(block->'anchor') = 'null'
         OR COALESCE(block->>'anchor', '') = ''
       ) THEN
      block := jsonb_set(
        block,
        '{anchor}',
        to_jsonb(pb_github_slug(COALESCE(block->>'text', ''))),
        true
      );
    END IF;
    result := result || jsonb_build_array(block);
  END LOOP;
  RETURN result;
END;
$$;

UPDATE "posts"
SET "blocks" = pb_backfill_heading_anchors("blocks")
WHERE jsonb_typeof("blocks") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("posts"."blocks") AS element
    WHERE element->>'kind' = 'heading'
      AND (
        NOT (element ? 'anchor')
        OR jsonb_typeof(element->'anchor') = 'null'
        OR COALESCE(element->>'anchor', '') = ''
      )
  );

DROP FUNCTION pb_backfill_heading_anchors(jsonb);
DROP FUNCTION pb_github_slug(text);
