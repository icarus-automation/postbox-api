# Postbox phase 1 API

Contract for the client. Routes sit under `/api/v1`. Errors use `{ statusCode, message, error, path, timestamp }`.

## Heading block `anchor`

A heading block may carry `anchor`. It is a string. Leave it out, send `null`, or send `""` and the server makes one from the text the first time the block is saved. A later save of the same block id keeps that anchor when the text changes.

An explicit anchor must already be the github-slugger form of itself: lowercase, punctuation removed, spaces as hyphens, 1 to 200 characters. `readings` is valid. `Meter Readings` is not.

The server does not reject a repeated anchor. When the post is read, the second one in document order is rendered as `readings-1`, then `readings-2`.

`POST /blog/posts` and `PATCH /blog/posts/:id` (draft) and `PUT /blog/posts/:id` accept the block. A bad anchor is `400`:

```json
{
  "statusCode": 400,
  "message": "Heading anchor is invalid",
  "error": "Bad Request",
  "path": "/api/v1/blog/posts/post-1",
  "timestamp": "2026-11-26T12:00:00.000Z"
}
```

```json
{
  "id": "readings",
  "kind": "heading",
  "level": 2,
  "text": "Readings",
  "anchor": "readings"
}
```

## Category `slug`

`POST /blog/categories` and `PATCH /blog/categories/:id` take an optional `slug`.

Blank or omitted on create builds the slug from the name. A name that already exists, in any case, returns that category and ignores `slug`. A generated slug that is taken gets `-2`, `-3`, and so on.

Blank or omitted on edit keeps the current slug. Changing the name does not change the slug. Only a `slug` value does.

A non-blank slug must be lowercase kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), at most 200 characters. Anything else is `400` with message `Slug is invalid`. A slug another category in the organization already uses is `409` with message `Another category already uses <slug>`. The server does not add `-2` to an explicit slug.

```json
{
  "statusCode": 409,
  "message": "Another category already uses billing",
  "error": "Conflict",
  "path": "/api/v1/blog/categories/category-1",
  "timestamp": "2026-11-26T12:00:00.000Z"
}
```

A slug change on a category that has published posts sends the existing `post.updated` webhook for each of those posts. A name change does the same. The webhook body is unchanged.

```json
{ "name": "Billing & Payments", "slug": "billing" }
```

## `headings` and `markdown` on detail

`GET /blog/posts/:id` and `GET /public/:orgSlug/blog/posts/:slug` add:

- `headings`: `{ level, text, id }[]` in document order. `id` is the `id` on the matching `h1`, `h2` or `h3` in `html`.
- `markdown`: the blocks as markdown. Heading ids are not in this string. The headings in the markdown follow `headings`.

`GET /blog/posts` and `GET /public/:orgSlug/blog/posts` stay summaries. They have no `blocks`, `html`, `headings` or `markdown`.

Public heading blocks still have `kind`, `level` and `text` only. The editor block includes `anchor`.

```json
{
  "headings": [
    { "level": 2, "text": "Readings", "id": "readings" },
    { "level": 2, "text": "Readings", "id": "readings-1" }
  ],
  "markdown": "## Readings\n\nPhotograph the dials.\n\n## Readings"
}
```
